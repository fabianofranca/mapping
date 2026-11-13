// `planSignatureImport` (etapa #1079, S2; decisões 5, 7, 8, 9 e 12): a regra do que vira campo, a
// ligação a campos existentes, a expansão pela fábrica, os avisos com o `ref` da ficha, a
// idempotência e a sincronização. Puro: roda no projeto `model` (Node).
import { describe, expect, it } from 'vitest';
import {
  paramsOutsideSignature,
  planSignatureImport,
  type PlanSignatureImportOptions,
  type SignatureImportPlan,
} from '../../../src/model/signatures';
import type { Signature, SignatureParam } from '../../../src/model/signatures/types';
import type { Spec, SpecField, SpecNotice } from '../../../src/model/spec';
import type { Json } from './fixtures';
import {
  BUTTON_PATH,
  bool,
  buttonOf,
  callback,
  colorParam,
  composeSignature,
  dimension,
  enumParam,
  factory,
  librarySpec,
  text,
} from './importFixtures';

const REF = 'signatures/button.compose.json';

function run(
  spec: Spec,
  options: Partial<PlanSignatureImportOptions> &
    Pick<PlanSignatureImportOptions, 'signature'>,
): SignatureImportPlan {
  const result = planSignatureImport(spec, {
    type: 'button',
    target: { platform: 'compose' },
    ...options,
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.plan;
}

const field = (plan: SignatureImportPlan, key: string): SpecField | undefined =>
  plan.type.fields.find((f) => f.key === key);
const keys = (plan: SignatureImportPlan): string[] => plan.type.fields.map((f) => f.key);
const noticesOf = (notices: SpecNotice[] | undefined): string[] =>
  (notices ?? []).map((n) => `${n.kind}|${n.ref ?? ''}|${n.message}`);

describe('regra por role e value.kind (decisão 5)', () => {
  const params = [
    callback('onClick'),
    { name: 'modifier', role: 'modifier', type: 'Modifier', default: 'Modifier' },
    { name: 'interactionSource', role: 'state', type: 'MutableInteractionSource?' },
    {
      name: 'content',
      role: 'slot',
      type: '@Composable RowScope.() -> Unit',
      required: true,
    },
    { name: 'icon', role: 'slot', type: '@Composable () -> Unit' },
    text('label', { default: '"OK"', value: { kind: 'text', default: 'OK' } }),
    bool('enabled'),
    dimension('elevation', {
      default: '16.dp',
      value: { kind: 'dimension', default: 16 },
    }),
    { name: 'weight', role: 'value', type: 'Float', value: { kind: 'number' } },
    { name: 'lines', role: 'value', type: 'Int', value: { kind: 'integer' } },
    enumParam('size', ['Small', 'Large'], {
      default: 'Size.Small',
      value: { kind: 'enum', options: ['Small', 'Large'], default: 'Small' },
    }),
    colorParam('tint', { type: 'Brush' }),
    { name: 'shape', role: 'value', type: 'Shape', value: { kind: 'opaque' } },
  ];

  it('callback, modifier e state nunca viram campo; slot só com modelo', () => {
    const plan = run(librarySpec(), { signature: composeSignature(params) });
    expect(keys(plan)).not.toContain('onClick');
    expect(keys(plan)).not.toContain('modifier');
    expect(keys(plan)).not.toContain('interactionSource');
    expect(keys(plan)).not.toContain('content');
    expect(field(plan, 'icon')).toMatchObject({ type: 'string' });
    expect(plan.code?.formats).toMatchObject({ icon: '{ Text({value}) }' });
    expect(plan.unmapped.map((u) => u.name)).toEqual([
      'onClick',
      'modifier',
      'interactionSource',
      'content',
      'tint',
      'shape',
    ]);
  });

  it('text, boolean, number, integer, dimension e enum', () => {
    const plan = run(librarySpec(), { signature: composeSignature(params) });
    expect(field(plan, 'label')).toMatchObject({ type: 'string', default: 'OK' });
    expect(field(plan, 'enabled')).toMatchObject({
      type: 'enum',
      options: ['true', 'false'],
      default: 'true',
    });
    expect(field(plan, 'elevation')).toMatchObject({ type: 'number', default: 16 });
    expect(plan.code?.formats).toMatchObject({ elevation: '{value}.dp' });
    expect(field(plan, 'weight')).toMatchObject({ type: 'number' });
    expect(field(plan, 'lines')).toMatchObject({ type: 'number' });
    expect(field(plan, 'size')).toMatchObject({
      type: 'enum',
      options: ['Small', 'Large'],
      default: 'Small',
    });
    expect(plan.code?.params).toMatchObject({
      label: 'label',
      size: 'size',
      lines: 'lines',
    });
  });

  it('boolean usa as opções do modelo `boolean` da biblioteca', () => {
    const spec = librarySpec((s) => {
      s.fieldModels.compose.boolean = { type: 'enum', options: ['Sim', 'Não'] };
    });
    const plan = run(spec, { signature: composeSignature([bool('enabled')]) });
    expect(field(plan, 'enabled')).toMatchObject({
      type: 'enum',
      options: ['Sim', 'Não'],
      default: 'Sim',
    });
    expect(plan.code?.values).toEqual({ enabled: { Sim: 'true', Não: 'false' } });
  });

  it('color e opaque sem modelo ficam fora, com o aviso pending no tipo', () => {
    const plan = run(librarySpec(), { signature: composeSignature(params) });
    expect(keys(plan)).not.toContain('tint');
    expect(keys(plan)).not.toContain('shape');
    expect(noticesOf(plan.type.notices)).toEqual([
      `pending|${REF}|compose: o parâmetro \`tint\` (Brush) ainda não é campo`,
      `pending|${REF}|compose: o parâmetro \`shape\` (Shape) ainda não é campo`,
    ]);
  });

  it('o modelo `ignore` deixa o parâmetro fora sem aviso', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        { name: 'modifier', role: 'value', type: 'Modifier', value: { kind: 'opaque' } },
      ]),
    });
    expect(plan.type.fields).toEqual([]);
    expect(plan.type.notices).toBeUndefined();
  });

  it('o `ignore` do code deixa o parâmetro fora de propósito: sem campo, sem aviso e fora do unmapped', () => {
    const signature = composeSignature([
      text('label'),
      text('subtitle'),
      dimension('gap'),
    ]);
    const plan = run(
      librarySpec((s) => {
        buttonOf(s).code = {
          compose: {
            symbol: 'androidx.compose.material3.Button',
            path: BUTTON_PATH,
            ignore: ['subtitle', 'gap'],
          },
        };
      }),
      { signature },
    );
    expect(keys(plan)).toEqual(['label']);
    expect(plan.type.notices).toBeUndefined();
    expect(plan.unmapped.map((u) => u.name)).toEqual([]);
  });

  it('o `ignore` vale também pelo nome de chamada (o rótulo externo do Swift)', () => {
    const plan = run(
      librarySpec((s) => {
        buttonOf(s).code = {
          compose: {
            symbol: 'androidx.compose.material3.Button',
            path: BUTTON_PATH,
            ignore: ['badge'],
          },
        };
      }),
      {
        signature: composeSignature([
          text('label'),
          text('badgeCount', { label: 'badge' }),
        ]),
      },
    );
    expect(keys(plan)).toEqual(['label']);
    expect(plan.type.notices).toBeUndefined();
    expect(plan.unmapped.map((u) => u.name)).toEqual([]);
  });

  it('o argumento de uma fábrica não se liga, só pelo nome, a um campo de outro tipo: vira campo novo com o dono no nome', () => {
    const plan = run(
      librarySpec((s) => {
        buttonOf(s).fields = [
          { key: 'vertical', type: 'enum', options: ['top', 'bottom'] },
        ];
      }),
      {
        signature: composeSignature([
          {
            name: 'contentPadding',
            role: 'value',
            type: 'PaddingValues',
            default: 'ButtonDefaults.ContentPadding',
          },
        ]),
      },
    );
    expect(keys(plan)).toEqual(['vertical', 'horizontal', 'contentPaddingVertical']);
    expect(field(plan, 'vertical')).toMatchObject({ type: 'enum' });
    expect(field(plan, 'contentPaddingVertical')).toMatchObject({ type: 'number' });
    expect(plan.code?.params).toEqual({
      horizontal: 'contentPadding.horizontal',
      contentPaddingVertical: 'contentPadding.vertical',
    });
  });

  it('label, description e chave: o rótulo vem do nome, a descrição da doc, a chave é normalizada', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([text('content padding'), text('contentText')], (s) => {
        s.doc = { contentText: 'The text shown.' };
      }),
    });
    expect(field(plan, 'contentPadding')).toMatchObject({ label: 'Content padding' });
    expect(plan.code?.params).toMatchObject({ contentPadding: 'content padding' });
    expect(field(plan, 'contentText')).toMatchObject({
      label: 'Content text',
      description: 'The text shown.',
    });
  });
});

describe('modelos de campo e expansão (decisão 5)', () => {
  it('like copia options e code.values do campo da biblioteca', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([colorParam('containerColor')]),
    });
    expect(field(plan, 'containerColor')).toMatchObject({
      type: 'enum',
      options: ['primary', 'secondary'],
    });
    expect(plan.code?.values?.containerColor).toEqual({
      primary: 'MaterialTheme.colorScheme.primary',
      secondary: 'MaterialTheme.colorScheme.secondary',
    });
  });

  it('a fábrica do padrão expande em um campo por parâmetro, com a chave que colide', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        factory('colors', 'ButtonDefaults.buttonColors', [colorParam('containerColor')]),
        factory('iconColors', 'ButtonDefaults.iconColors', [
          colorParam('containerColor'),
        ]),
      ]),
    });
    expect(keys(plan)).toEqual(['containerColor', 'iconColorsContainerColor']);
    expect(plan.code?.params).toEqual({
      containerColor: 'colors.containerColor',
      iconColorsContainerColor: 'iconColors.containerColor',
    });
    expect(plan.code?.calls).toEqual({
      colors: 'ButtonDefaults.buttonColors',
      iconColors: 'ButtonDefaults.iconColors',
    });
  });

  it('o modelo expand (PaddingValues) vira um campo por parâmetro, com o molde', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        {
          name: 'contentPadding',
          role: 'value',
          type: 'PaddingValues',
          value: { kind: 'opaque' },
        },
      ]),
    });
    expect(keys(plan)).toEqual(['horizontal', 'vertical']);
    expect(plan.code?.params).toEqual({
      horizontal: 'contentPadding.horizontal',
      vertical: 'contentPadding.vertical',
    });
    expect(plan.code?.calls).toEqual({ contentPadding: 'PaddingValues' });
    expect(plan.code?.formats).toEqual({
      horizontal: '{value}.dp',
      vertical: '{value}.dp',
    });
  });

  it('o parâmetro sem rótulo do Swift vira posicional, com a chave do nome interno', () => {
    const plan = run(librarySpec(), {
      target: { platform: 'swiftui' },
      signature: composeSignature(
        [text('title', { label: '_' }), text('subtitle', { label: 'sub' })],
        (s) => {
          s.source = {
            kind: 'code',
            platform: 'swiftui',
            language: 'swift',
            symbol: 'DS.Button',
            path: 'Button.swift',
            extractor: 'mapping-signature/swift@1',
          };
        },
      ),
    });
    expect(plan.code?.params).toEqual({ title: '#0', subtitle: 'sub' });
  });
});

describe('default e obrigatório', () => {
  it('default literal vira default; não literal fica sem default', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        text('label', { value: { kind: 'text', default: 'OK' } }),
        text('hint', { default: 'Defaults.hint', value: { kind: 'text' } }),
      ]),
    });
    expect(field(plan, 'label')).toHaveProperty('default', 'OK');
    expect(field(plan, 'hint')).not.toHaveProperty('default');
  });

  it('só o tipo novo (sem campos) ganha campo obrigatório; no tipo existente nasce opcional com diverges', () => {
    const required = composeSignature([text('label', { required: true })]);
    const novo = run(librarySpec(), { signature: required });
    expect(field(novo, 'label')).toHaveProperty('required', true);
    expect(novo.type.fields[0]?.notices).toBeUndefined();

    const existing = librarySpec((s) => {
      buttonOf(s).fields = [{ key: 'other', type: 'string' }];
    });
    const plan = run(existing, { signature: required });
    expect(field(plan, 'label')).not.toHaveProperty('required');
    expect(noticesOf(field(plan, 'label')?.notices)).toEqual([
      `diverges|${REF}|compose: obrigatório no código (\`label\`), mas o campo é opcional`,
    ]);
  });
});

describe('ligação (decisão 7)', () => {
  const spec = (): Spec =>
    librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [
        { key: 'titulo', type: 'string' },
        { key: 'enabled', type: 'enum', options: ['true', 'false'] },
      ];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { titulo: 'text' },
        },
      };
    });

  it('(a) o params que já cita o parâmetro, (b) o nome normalizado, (c) campo novo', () => {
    const plan = run(spec(), {
      signature: composeSignature([text('text'), bool('Enabled'), text('badge')]),
    });
    expect(plan.links).toEqual([
      { param: 'text', field: 'titulo', via: 'params' },
      { param: 'Enabled', field: 'enabled', via: 'name' },
      { param: 'badge', field: 'badge', via: 'new' },
    ]);
    expect(plan.fields.map((f) => f.key)).toEqual(['badge']);
    expect(plan.code?.params).toEqual({
      titulo: 'text',
      enabled: 'Enabled',
      badge: 'badge',
    });
  });

  it('Figma: Style casa com style e as opções casam pelo texto normalizado', () => {
    const base = librarySpec((s) => {
      buttonOf(s).fields = [
        { key: 'style', type: 'enum', options: ['filled', 'outlined'] },
      ];
    });
    const signature = composeSignature(
      [enumParam('Style', ['Filled', 'Outlined', 'Tonal'])],
      (s) => {
        s.source = {
          kind: 'design',
          system: 'figma',
          id: '1:2',
          name: 'Button',
          extractor: 'mapping-signature/figma@1',
        };
      },
    );
    const plan = run(base, { target: { system: 'figma' }, signature });
    expect(plan.links).toEqual([{ param: 'Style', field: 'style', via: 'name' }]);
    expect(plan.sources).toEqual([
      {
        system: 'figma',
        id: '1:2',
        name: 'Button',
        signature: 'signatures/button.figma.json',
      },
    ]);
    const style = field(plan, 'style');
    expect(style).toMatchObject({
      options: ['filled', 'outlined'],
      sources: [
        {
          system: 'figma',
          name: 'Style',
          values: { Filled: 'filled', Outlined: 'outlined' },
        },
      ],
    });
    expect(noticesOf(style?.notices)).toEqual([
      'diverges|signatures/button.figma.json|figma: a opção `Tonal` da fonte não existe no campo',
    ]);
  });
});

describe('idempotência e avisos do importador (decisão 8)', () => {
  const signature = composeSignature([
    callback('onClick'),
    text('label', { required: true }),
    enumParam('size', ['Small', 'Large']),
    factory('colors', 'ButtonDefaults.buttonColors', [
      colorParam('containerColor'),
      colorParam('x', { type: 'Brush' }),
    ]),
    { name: 'shape', role: 'value', type: 'Shape', value: { kind: 'opaque' } },
  ]);

  it('importar a mesma ficha duas vezes dá a mesma especialização', () => {
    const first = run(librarySpec(), { signature });
    const second = run(first.spec, { signature, previous: signature });
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
    expect(second.fields).toEqual([]);
    expect(second.changes).toEqual([]);
    expect(second.versionBump).toBe(false);
  });

  it('regrava os avisos com o ref da ficha e não toca nos outros', () => {
    const spec = librarySpec((s) => {
      buttonOf(s).notices = [
        { kind: 'deprecated', message: 'autoral', ref: 'issue-1' },
        { kind: 'pending', message: 'compose: velho', ref: REF },
      ];
    });
    const plan = run(spec, { signature });
    const notices = noticesOf(plan.type.notices);
    expect(notices[0]).toBe('deprecated|issue-1|autoral');
    expect(notices.some((n) => n.includes('velho'))).toBe(false);
    expect(notices.slice(1).every((n) => n.startsWith(`pending|${REF}|compose: `))).toBe(
      true,
    );
    expect(
      plan.notices.every((n) => n.ref === REF && n.message.startsWith('compose: ')),
    ).toBe(true);
    const again = run(plan.spec, { signature, previous: signature });
    expect(noticesOf(again.type.notices)).toEqual(notices);
  });
});

describe('sincronização (decisão 12)', () => {
  const previous = composeSignature([
    text('label'),
    text('legacy'),
    enumParam('size', ['Small', 'Large']),
    dimension('radius', { default: '4.dp', value: { kind: 'dimension', default: 4 } }),
  ]);
  const imported = (): SignatureImportPlan => run(librarySpec(), { signature: previous });

  it('parâmetro novo: campo opcional; versionBump', () => {
    const next = composeSignature([
      ...(previous.params.map((p) => ({ ...p })) as Json[]),
      text('badge', { required: true }),
    ]);
    const plan = run(imported().spec, { signature: next, previous });
    expect(plan.changes).toEqual([{ kind: 'added', param: 'badge' }]);
    expect(plan.fields.map((f) => f.key)).toEqual(['badge']);
    expect(plan.fields[0]).not.toHaveProperty('required');
    expect(plan.versionBump).toBe(true);
  });

  it('parâmetro removido: o campo fica com removed; sugere remove-field; sem quebra', () => {
    const next = composeSignature(
      previous.params.filter((p) => p.name !== 'legacy').map((p) => ({ ...p })) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(keys(plan)).toContain('legacy');
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: o parâmetro \`legacy\` saiu da assinatura; o campo fica`,
    ]);
    expect(plan.changes).toEqual([{ kind: 'removed', param: 'legacy' }]);
    expect(plan.suggestedMigrations).toEqual([
      { op: 'remove-field', type: 'button', field: 'legacy' },
    ]);
    expect(plan.versionBump).toBe(false);
  });

  it('parâmetro já sinalizado como removed: reimportar a mesma ficha não o reporta de novo (idempotência)', () => {
    const next = composeSignature(
      previous.params.filter((p) => p.name !== 'legacy').map((p) => ({ ...p })) as Json[],
    );
    const first = run(imported().spec, { signature: next, previous });
    expect(first.changes).toEqual([{ kind: 'removed', param: 'legacy' }]);
    const again = run(first.spec, { signature: next, previous: next });
    expect(again.changes).toEqual([]);
    expect(again.suggestedMigrations).toEqual([]);
    expect(noticesOf(field(again, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: o parâmetro \`legacy\` saiu da assinatura; o campo fica`,
    ]);
    expect(again.spec).toEqual(first.spec);
  });

  it('padrão mudado atualiza o default; só por default o contrato não muda', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'radius'
          ? { ...p, default: '8.dp', value: { kind: 'dimension', default: 8 } }
          : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(field(plan, 'radius')).toHaveProperty('default', 8);
    expect(plan.changes).toEqual([
      { kind: 'changed', param: 'radius', aspect: 'default', from: '4.dp', to: '8.dp' },
    ]);
    expect(plan.versionBump).toBe(false);
  });

  it('a primeira importação não grava default em campo existente que não tinha (curadoria "vazio = X")', () => {
    const spec = librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [{ key: 'radius', type: 'number' }];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { radius: 'radius' },
        },
      };
    });
    const plan = run(spec, {
      signature: composeSignature([
        dimension('radius', {
          default: '4.dp',
          value: { kind: 'dimension', default: 4 },
        }),
      ]),
    });
    expect(field(plan, 'radius')).not.toHaveProperty('default');
  });

  it('opção nova entra no campo; opção que sumiu vira diverges', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'size'
          ? { ...p, value: { kind: 'enum', options: ['Small', 'Medium'] } }
          : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(field(plan, 'size')).toMatchObject({ options: ['Small', 'Large', 'Medium'] });
    expect(noticesOf(field(plan, 'size')?.notices)).toEqual([
      `diverges|${REF}|compose: a opção \`Large\` não existe mais na fonte`,
    ]);
    expect(plan.versionBump).toBe(true);
  });

  it('o kind do parâmetro mudou: diverges', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'label' ? { ...p, type: 'Int', value: { kind: 'integer' } } : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(noticesOf(field(plan, 'label')?.notices)).toEqual([
      `diverges|${REF}|compose: o tipo do parâmetro \`label\` mudou de text para integer`,
    ]);
  });

  it('renome provável (mesmo tipo, mesma posição): diverges e sugere rename-field', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'legacy' ? { ...p, name: 'modern' } : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(plan.changes).toEqual([{ kind: 'renamed', param: 'legacy', to: 'modern' }]);
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `diverges|${REF}|compose: renome provável de \`legacy\` para \`modern\``,
    ]);
    expect(plan.suggestedMigrations).toEqual([
      { op: 'rename-field', type: 'button', from: 'legacy', to: 'modern' },
    ]);
    expect(keys(plan)).toContain('modern');
  });
});

describe('variantes (decisão 9)', () => {
  const spec = (): Spec =>
    librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [
        {
          key: 'style',
          type: 'enum',
          options: ['filled', 'outlined'],
          default: 'filled',
        },
      ];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { style: 'style' },
          variants: {
            field: 'style',
            cases: {
              outlined: {
                symbol: 'androidx.compose.material3.OutlinedButton',
                path: 'compose/OutlinedButton.kt',
              },
            },
          },
        },
      };
    });
  const base = composeSignature([
    text('label'),
    factory('colors', 'ButtonDefaults.buttonColors', [colorParam('containerColor')]),
  ]);
  const outlined = composeSignature(
    [
      text('label'),
      text('border'),
      factory('colors', 'ButtonDefaults.outlinedButtonColors', [
        colorParam('containerColor'),
      ]),
      { name: 'content', role: 'slot', type: '@Composable RowScope.() -> Unit' },
    ],
    (s) => {
      s.source.symbol = 'androidx.compose.material3.OutlinedButton';
      s.source.path = 'compose/OutlinedButton.kt';
    },
  );

  it('uma ficha por caso: campos em união, calls do caso e unmapped do caso', () => {
    const first = run(spec(), { signature: base });
    const plan = run(first.spec, { variant: 'outlined', signature: outlined });
    expect(plan.signaturePath).toBe('signatures/button.outlined.compose.json');
    expect(keys(plan)).toEqual(['style', 'label', 'containerColor', 'border']);
    const kase = plan.code?.variants?.cases.outlined;
    expect(kase?.signature).toBe('signatures/button.outlined.compose.json');
    expect(kase?.calls).toEqual({ colors: 'ButtonDefaults.outlinedButtonColors' });
    expect(kase?.params).toEqual({ border: 'border' });
    expect(plan.code?.calls).toEqual({ colors: 'ButtonDefaults.buttonColors' });
    expect(plan.code?.signature).toBe('signatures/button.compose.json');
    expect(plan.unmapped.map((u) => u.name)).toEqual(['content']);
  });

  it('o mesmo parâmetro sem campo na base e no caso dá avisos diferentes (sem "aviso repetido")', () => {
    const inset: SignatureParam = {
      name: 'windowInsets',
      role: 'value',
      type: 'WindowInsets',
      value: { kind: 'opaque' },
    };
    const withInset = (sig: Signature): Signature => ({
      ...sig,
      params: [...sig.params, inset],
    });
    const first = run(spec(), { signature: withInset(base) });
    const second = run(first.spec, {
      variant: 'outlined',
      signature: withInset(outlined),
    });
    const notices = second.type.notices ?? [];
    const pending = notices.filter((n) => n.kind === 'pending');
    expect(pending.map((n) => n.ref)).toEqual([
      'signatures/button.compose.json',
      'signatures/button.outlined.compose.json',
    ]);
    expect(new Set(pending.map((n) => n.message)).size).toBe(2);
    expect(pending[0]?.message).toMatch(/^compose: o parâmetro/);
    expect(pending[1]?.message).toMatch(/^compose: caso `outlined`: o parâmetro/);
  });

  it('reimportar a ficha base depois da do caso não reordena os avisos (os da ficha ficam onde estavam)', () => {
    const inset: SignatureParam = {
      name: 'windowInsets',
      role: 'value',
      type: 'WindowInsets',
      value: { kind: 'opaque' },
    };
    const withInset = (sig: Signature): Signature => ({
      ...sig,
      params: [...sig.params, inset],
    });
    const baseSig = withInset(base);
    const first = run(spec(), { signature: baseSig });
    const second = run(first.spec, {
      variant: 'outlined',
      signature: withInset(outlined),
    });
    const order = (notices: SpecNotice[] | undefined): string[] =>
      (notices ?? []).map((n) => n.ref ?? '');
    const again = run(second.spec, { signature: baseSig, previous: baseSig });
    expect(order(again.type.notices)).toEqual(order(second.type.notices));
    expect(again.spec).toEqual(second.spec);
  });

  it('o símbolo da ficha do caso precisa ser o do caso', () => {
    const wrong = composeSignature([text('label')]);
    const result = planSignatureImport(spec(), {
      type: 'button',
      target: { platform: 'compose' },
      variant: 'outlined',
      signature: wrong,
    });
    expect(result).toMatchObject({ ok: false, code: 'signature-mismatch' });
  });

  it('caso que o code não declara', () => {
    const result = planSignatureImport(spec(), {
      type: 'button',
      target: { platform: 'compose' },
      variant: 'text',
      signature: base,
    });
    expect(result).toMatchObject({ ok: false, code: 'variant-not-found' });
  });
});

describe('erros', () => {
  const signature = composeSignature([text('label')]);
  const fail = (spec: Spec, options: Partial<PlanSignatureImportOptions>) =>
    planSignatureImport(spec, {
      type: 'button',
      target: { platform: 'compose' },
      signature,
      ...options,
    });

  it('type-not-found, platform-not-declared e signature-mismatch', () => {
    expect(fail(librarySpec(), { type: 'nada' })).toMatchObject({
      ok: false,
      code: 'type-not-found',
    });
    expect(fail(librarySpec(), { target: { platform: 'web' } })).toMatchObject({
      ok: false,
      code: 'platform-not-declared',
    });
    const other = librarySpec((s) => {
      buttonOf(s).code = { compose: { symbol: 'other.Button', path: BUTTON_PATH } };
    });
    expect(fail(other, {})).toMatchObject({ ok: false, code: 'signature-mismatch' });
    const otherPath = librarySpec((s) => {
      buttonOf(s).code = {
        compose: { symbol: 'androidx.compose.material3.Button', path: 'Other.kt' },
      };
    });
    expect(fail(otherPath, {})).toMatchObject({ ok: false, code: 'signature-mismatch' });
  });

  it('ficha de design num alvo de código (e o inverso) é signature-mismatch', () => {
    expect(fail(librarySpec(), { target: { system: 'figma' } })).toMatchObject({
      ok: false,
      code: 'signature-mismatch',
    });
  });
});

describe('revisão da S2: ligação, formats, variantes e design', () => {
  const swift = (params: Json[]) =>
    composeSignature(params, (s) => {
      s.source = {
        kind: 'code',
        platform: 'swiftui',
        language: 'swift',
        symbol: 'DS.Button',
        path: 'Button.swift',
        extractor: 'mapping-signature/swift@1',
      };
    });

  it('o params que cita o nome interno do parâmetro Swift liga ao campo existente', () => {
    const spec = librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [{ key: 'title', type: 'string' }];
      button.code = {
        swiftui: {
          symbol: 'DS.Button',
          path: 'Button.swift',
          params: { title: 'title' },
        },
      };
    });
    const plan = run(spec, {
      target: { platform: 'swiftui' },
      signature: swift([text('title', { label: 'with' })]),
    });
    expect(plan.links).toEqual([{ param: 'with', field: 'title', via: 'params' }]);
    expect(keys(plan)).toEqual(['title']);
  });

  it('variante: o params da base que a ficha do caso não tem não vira removed', () => {
    const spec = librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [
        { key: 'style', type: 'enum', options: ['filled', 'outlined'] },
        { key: 'titulo', type: 'string' },
      ];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { style: 'style', titulo: 'text' },
          variants: {
            field: 'style',
            cases: {
              outlined: {
                symbol: 'androidx.compose.material3.OutlinedButton',
                path: 'compose/OutlinedButton.kt',
              },
            },
          },
        },
      };
    });
    const outlined = composeSignature([text('border')], (s) => {
      s.source.symbol = 'androidx.compose.material3.OutlinedButton';
      s.source.path = 'compose/OutlinedButton.kt';
    });
    const plan = run(spec, { variant: 'outlined', signature: outlined });
    expect(plan.changes).toEqual([]);
    expect(plan.suggestedMigrations).toEqual([]);
    expect(noticesOf(field(plan, 'titulo')?.notices)).toEqual([]);
  });

  it('o formats do caso curado à mão não é sobrescrito', () => {
    const spec = librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [{ key: 'radius', type: 'number' }];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          variants: {
            field: 'radius',
            cases: {},
          },
        },
      };
      button.fields = [
        { key: 'style', type: 'enum', options: ['filled', 'outlined'] },
        { key: 'radius', type: 'number' },
      ];
      button.code.compose.variants.field = 'style';
      button.code.compose.variants.cases = {
        outlined: {
          symbol: 'androidx.compose.material3.OutlinedButton',
          path: 'compose/OutlinedButton.kt',
          formats: { radius: '{value}.pt' },
        },
      };
    });
    const outlined = composeSignature([dimension('radius')], (s) => {
      s.source.symbol = 'androidx.compose.material3.OutlinedButton';
      s.source.path = 'compose/OutlinedButton.kt';
    });
    const plan = run(spec, { variant: 'outlined', signature: outlined });
    expect(plan.code?.variants?.cases.outlined?.formats).toEqual({
      radius: '{value}.pt',
    });
  });

  it('design: a ficha com parâmetro composto reimportada não duplica o campo nem a source', () => {
    const signature = composeSignature(
      [factory('colors', 'Colors', [colorParam('containerColor')])],
      (s) => {
        s.source = {
          kind: 'design',
          system: 'figma',
          id: '1:2',
          name: 'Button',
          extractor: 'mapping-signature/figma@1',
        };
      },
    );
    const lib = librarySpec((s) => {
      s.fieldModels.figma = { Color: { like: 'surface.color' } };
    });
    const first = run(lib, { target: { system: 'figma' }, signature });
    const second = run(first.spec, {
      target: { system: 'figma' },
      signature,
      previous: signature,
    });
    expect(keys(second)).toEqual(keys(first));
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
  });
});

describe('correção CL1: plataforma da ficha e campo removed (S5-b, S5-a)', () => {
  it('S5-b: a ficha de código de outra plataforma não é aceita no id da plataforma', () => {
    const result = planSignatureImport(librarySpec(), {
      type: 'button',
      target: { platform: 'swiftui' },
      signature: composeSignature([text('label')]),
    });
    expect(result).toMatchObject({ ok: false, code: 'signature-mismatch' });
    expect(result.ok ? '' : result.detail).toContain('"compose"');
    expect(result.ok ? '' : result.detail).toContain('"swiftui"');
  });

  const previous = composeSignature([text('label'), text('legacy')]);
  const next = composeSignature([text('label')]);
  const paramsOf = (spec: Spec): Record<string, string> | undefined =>
    (buttonOf(spec as unknown as Json).code as Json).compose.params;

  it('S5-a: o campo com removed não cita mais o parâmetro que saiu em params', () => {
    const first = run(librarySpec(), { signature: previous });
    expect(paramsOf(first.spec)).toMatchObject({ legacy: 'legacy' });
    const plan = run(first.spec, { signature: next, previous });
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: o parâmetro \`legacy\` saiu da assinatura; o campo fica`,
    ]);
    expect(paramsOf(plan.spec)).toEqual({ label: 'label' });
    // e o validador não acha parâmetro fora da ficha
    expect(paramsOutsideSignature(next, { params: paramsOf(plan.spec) })).toEqual([]);
  });

  it('S5-a: reimportar depois mantém o aviso removed e o params sem o parâmetro', () => {
    const first = run(run(librarySpec(), { signature: previous }).spec, {
      signature: next,
      previous,
    });
    const again = run(first.spec, { signature: next, previous: next });
    expect(again.changes).toEqual([]);
    expect(again.suggestedMigrations).toEqual([]);
    expect(noticesOf(field(again, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: o parâmetro \`legacy\` saiu da assinatura; o campo fica`,
    ]);
    expect(paramsOf(again.spec)).toEqual({ label: 'label' });
    expect(again.spec).toEqual(first.spec);
  });
});
