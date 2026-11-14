// `planSignatureImport` (stage #1079, S2; decisions 5, 7, 8, 9 and 12): the rule for what becomes a
// field, the binding to existing fields, the expansion by the factory, the notices with the
// signature's `ref`, idempotence and synchronization. Pure: runs in the `model` project (Node).
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

describe('rule by role and value.kind (decision 5)', () => {
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

  it('callback, modifier and state never become a field; slot only with a model', () => {
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

  it('text, boolean, number, integer, dimension and enum', () => {
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

  it('boolean uses the options of the library's `boolean` model', () => {
    const spec = librarySpec((s) => {
      s.fieldModels.compose.boolean = { type: 'enum', options: ['Yes', 'No'] };
    });
    const plan = run(spec, { signature: composeSignature([bool('enabled')]) });
    expect(field(plan, 'enabled')).toMatchObject({
      type: 'enum',
      options: ['Yes', 'No'],
      default: 'Yes',
    });
    expect(plan.code?.values).toEqual({ enabled: { Yes: 'true', No: 'false' } });
  });

  it('color and opaque without a model stay out, with the pending notice on the type', () => {
    const plan = run(librarySpec(), { signature: composeSignature(params) });
    expect(keys(plan)).not.toContain('tint');
    expect(keys(plan)).not.toContain('shape');
    expect(noticesOf(plan.type.notices)).toEqual([
      `pending|${REF}|compose: the parameter \`tint\` (Brush) is not a field yet`,
      `pending|${REF}|compose: the parameter \`shape\` (Shape) is not a field yet`,
    ]);
  });

  it('the `ignore` model leaves the parameter out without a notice', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        { name: 'modifier', role: 'value', type: 'Modifier', value: { kind: 'opaque' } },
      ]),
    });
    expect(plan.type.fields).toEqual([]);
    expect(plan.type.notices).toBeUndefined();
  });

  it('the code's `ignore` leaves the parameter out on purpose: no field, no notice and out of unmapped', () => {
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

  it('`ignore` also matches by call name (the Swift external label)', () => {
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

  it('a factory argument does not bind, by name alone, to a field of another type: it becomes a new field with the owner in the name', () => {
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

  it('label, description and key: the label comes from the name, the description from the doc, the key is normalized', () => {
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

describe('field models and expansion (decision 5)', () => {
  it('like copies options and code.values from the library field', () => {
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

  it('the default's factory expands into one field per parameter, with the colliding key', () => {
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

  it('the expand model (PaddingValues) becomes one field per parameter, with the mold', () => {
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

  it('the Swift parameter without a label becomes positional, with the key of the internal name', () => {
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

describe('default and required', () => {
  it('a literal default becomes default; a non-literal one stays without default', () => {
    const plan = run(librarySpec(), {
      signature: composeSignature([
        text('label', { value: { kind: 'text', default: 'OK' } }),
        text('hint', { default: 'Defaults.hint', value: { kind: 'text' } }),
      ]),
    });
    expect(field(plan, 'label')).toHaveProperty('default', 'OK');
    expect(field(plan, 'hint')).not.toHaveProperty('default');
  });

  it('only the new type (no fields) gets a required field; on the existing type it is born optional with diverges', () => {
    const required = composeSignature([text('label', { required: true })]);
    const fresh = run(librarySpec(), { signature: required });
    expect(field(fresh, 'label')).toHaveProperty('required', true);
    expect(fresh.type.fields[0]?.notices).toBeUndefined();

    const existing = librarySpec((s) => {
      buttonOf(s).fields = [{ key: 'other', type: 'string' }];
    });
    const plan = run(existing, { signature: required });
    expect(field(plan, 'label')).not.toHaveProperty('required');
    expect(noticesOf(field(plan, 'label')?.notices)).toEqual([
      `diverges|${REF}|compose: required in the code (\`label\`), but the field is optional`,
    ]);
  });
});

describe('binding (decision 7)', () => {
  const spec = (): Spec =>
    librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [
        { key: 'title', type: 'string' },
        { key: 'enabled', type: 'enum', options: ['true', 'false'] },
      ];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { title: 'text' },
        },
      };
    });

  it('(a) the params that already cites the parameter, (b) the normalized name, (c) a new field', () => {
    const plan = run(spec(), {
      signature: composeSignature([text('text'), bool('Enabled'), text('badge')]),
    });
    expect(plan.links).toEqual([
      { param: 'text', field: 'title', via: 'params' },
      { param: 'Enabled', field: 'enabled', via: 'name' },
      { param: 'badge', field: 'badge', via: 'new' },
    ]);
    expect(plan.fields.map((f) => f.key)).toEqual(['badge']);
    expect(plan.code?.params).toEqual({
      title: 'text',
      enabled: 'Enabled',
      badge: 'badge',
    });
  });

  it('Figma: Style matches style and the options match by normalized text', () => {
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
      'diverges|signatures/button.figma.json|figma: the option `Tonal` of the source does not exist in the field',
    ]);
  });
});

describe('idempotence and importer notices (decision 8)', () => {
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

  it('importing the same signature twice gives the same specialization', () => {
    const first = run(librarySpec(), { signature });
    const second = run(first.spec, { signature, previous: signature });
    expect(JSON.stringify(second.spec)).toBe(JSON.stringify(first.spec));
    expect(second.fields).toEqual([]);
    expect(second.changes).toEqual([]);
    expect(second.versionBump).toBe(false);
  });

  it('rewrites the notices with the signature's ref and leaves the others alone', () => {
    const spec = librarySpec((s) => {
      buttonOf(s).notices = [
        { kind: 'deprecated', message: 'authored', ref: 'issue-1' },
        { kind: 'pending', message: 'compose: old', ref: REF },
      ];
    });
    const plan = run(spec, { signature });
    const notices = noticesOf(plan.type.notices);
    expect(notices[0]).toBe('deprecated|issue-1|authored');
    expect(notices.some((n) => n.includes('old'))).toBe(false);
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

describe('synchronization (decision 12)', () => {
  const previous = composeSignature([
    text('label'),
    text('legacy'),
    enumParam('size', ['Small', 'Large']),
    dimension('radius', { default: '4.dp', value: { kind: 'dimension', default: 4 } }),
  ]);
  const imported = (): SignatureImportPlan => run(librarySpec(), { signature: previous });

  it('new parameter: optional field; versionBump', () => {
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

  it('removed parameter: the field stays with removed; suggests remove-field; no break', () => {
    const next = composeSignature(
      previous.params.filter((p) => p.name !== 'legacy').map((p) => ({ ...p })) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(keys(plan)).toContain('legacy');
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: the parameter \`legacy\` left the signature; the field stays`,
    ]);
    expect(plan.changes).toEqual([{ kind: 'removed', param: 'legacy' }]);
    expect(plan.suggestedMigrations).toEqual([
      { op: 'remove-field', type: 'button', field: 'legacy' },
    ]);
    expect(plan.versionBump).toBe(false);
  });

  it('parameter already flagged as removed: reimporting the same signature does not report it again (idempotence)', () => {
    const next = composeSignature(
      previous.params.filter((p) => p.name !== 'legacy').map((p) => ({ ...p })) as Json[],
    );
    const first = run(imported().spec, { signature: next, previous });
    expect(first.changes).toEqual([{ kind: 'removed', param: 'legacy' }]);
    const again = run(first.spec, { signature: next, previous: next });
    expect(again.changes).toEqual([]);
    expect(again.suggestedMigrations).toEqual([]);
    expect(noticesOf(field(again, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: the parameter \`legacy\` left the signature; the field stays`,
    ]);
    expect(again.spec).toEqual(first.spec);
  });

  it('changed default updates the default; by default alone the contract does not change', () => {
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

  it('the first import does not write a default into an existing field that had none (curation "empty = X")', () => {
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

  it('a new option enters the field; an option that vanished becomes diverges', () => {
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
      `diverges|${REF}|compose: the option \`Large\` no longer exists in the source`,
    ]);
    expect(plan.versionBump).toBe(true);
  });

  it('the parameter's kind changed: diverges', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'label' ? { ...p, type: 'Int', value: { kind: 'integer' } } : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(noticesOf(field(plan, 'label')?.notices)).toEqual([
      `diverges|${REF}|compose: the type of parameter \`label\` changed from text to integer`,
    ]);
  });

  it('probable rename (same type, same position): diverges and suggests rename-field', () => {
    const next = composeSignature(
      previous.params.map((p) =>
        p.name === 'legacy' ? { ...p, name: 'modern' } : { ...p },
      ) as Json[],
    );
    const plan = run(imported().spec, { signature: next, previous });
    expect(plan.changes).toEqual([{ kind: 'renamed', param: 'legacy', to: 'modern' }]);
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `diverges|${REF}|compose: probable rename of \`legacy\` to \`modern\``,
    ]);
    expect(plan.suggestedMigrations).toEqual([
      { op: 'rename-field', type: 'button', from: 'legacy', to: 'modern' },
    ]);
    expect(keys(plan)).toContain('modern');
  });
});

describe('variants (decision 9)', () => {
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

  it('one signature per case: union of fields, the case's calls and the case's unmapped', () => {
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

  it('the same parameter without a field in the base and in the case gives different notices (no "repeated notice")', () => {
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
    expect(pending[0]?.message).toMatch(/^compose: the parameter/);
    expect(pending[1]?.message).toMatch(/^compose: case `outlined`: the parameter/);
  });

  it('reimporting the base signature after the case's does not reorder the notices (the signature's own stay where they were)', () => {
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

  it('the symbol of the case signature must be the case's', () => {
    const wrong = composeSignature([text('label')]);
    const result = planSignatureImport(spec(), {
      type: 'button',
      target: { platform: 'compose' },
      variant: 'outlined',
      signature: wrong,
    });
    expect(result).toMatchObject({ ok: false, code: 'signature-mismatch' });
  });

  it('case that the code does not declare', () => {
    const result = planSignatureImport(spec(), {
      type: 'button',
      target: { platform: 'compose' },
      variant: 'text',
      signature: base,
    });
    expect(result).toMatchObject({ ok: false, code: 'variant-not-found' });
  });
});

describe('errors', () => {
  const signature = composeSignature([text('label')]);
  const fail = (spec: Spec, options: Partial<PlanSignatureImportOptions>) =>
    planSignatureImport(spec, {
      type: 'button',
      target: { platform: 'compose' },
      signature,
      ...options,
    });

  it('type-not-found, platform-not-declared e signature-mismatch', () => {
    expect(fail(librarySpec(), { type: 'nothing' })).toMatchObject({
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

  it('a design signature on a code target (and the reverse) is signature-mismatch', () => {
    expect(fail(librarySpec(), { target: { system: 'figma' } })).toMatchObject({
      ok: false,
      code: 'signature-mismatch',
    });
  });
});

describe('S2 review: binding, formats, variants and design', () => {
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

  it('the params that cites the internal name of the Swift parameter binds to the existing field', () => {
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

  it('variant: the base params that the case signature lacks does not become removed', () => {
    const spec = librarySpec((s) => {
      const button = buttonOf(s);
      button.fields = [
        { key: 'style', type: 'enum', options: ['filled', 'outlined'] },
        { key: 'title', type: 'string' },
      ];
      button.code = {
        compose: {
          symbol: 'androidx.compose.material3.Button',
          path: BUTTON_PATH,
          params: { style: 'style', title: 'text' },
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
    expect(noticesOf(field(plan, 'title')?.notices)).toEqual([]);
  });

  it('the case's hand-curated formats is not overwritten', () => {
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

  it('design: a signature with a composite parameter reimported does not duplicate the field or the source', () => {
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

describe('fix CL1: signature platform and removed field (S5-b, S5-a)', () => {
  it('S5-b: the code signature of another platform is not accepted under the platform id', () => {
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

  it('S5-a: the field with removed no longer cites in params the parameter that left', () => {
    const first = run(librarySpec(), { signature: previous });
    expect(paramsOf(first.spec)).toMatchObject({ legacy: 'legacy' });
    const plan = run(first.spec, { signature: next, previous });
    expect(noticesOf(field(plan, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: the parameter \`legacy\` left the signature; the field stays`,
    ]);
    expect(paramsOf(plan.spec)).toEqual({ label: 'label' });
    // and the validator finds no parameter outside the signature
    expect(paramsOutsideSignature(next, { params: paramsOf(plan.spec) })).toEqual([]);
  });

  it('S5-a: reimporting afterwards keeps the removed notice and the params without the parameter', () => {
    const first = run(run(librarySpec(), { signature: previous }).spec, {
      signature: next,
      previous,
    });
    const again = run(first.spec, { signature: next, previous: next });
    expect(again.changes).toEqual([]);
    expect(again.suggestedMigrations).toEqual([]);
    expect(noticesOf(field(again, 'legacy')?.notices)).toEqual([
      `removed|${REF}|compose: the parameter \`legacy\` left the signature; the field stays`,
    ]);
    expect(paramsOf(again.spec)).toEqual({ label: 'label' });
    expect(again.spec).toEqual(first.spec);
  });
});

describe('CL2 R-1: a specialization older than 16 does not receive the new keys', () => {
  const v15 = (): Spec =>
    librarySpec((raw) => {
      raw.formatVersion = 15;
      delete raw.fieldModels;
    });

  it('the plan over a v15 spec refuses with a clear error, instead of returning an invalid v15 spec', () => {
    const result = planSignatureImport(v15(), {
      type: 'button',
      target: { platform: 'compose' },
      signature: composeSignature([text('label')]),
    });
    expect(result).toMatchObject({ ok: false, code: 'spec-version' });
    if (!result.ok) {
      expect(result.detail).toContain('15');
      expect(result.hint).toContain('16');
    }
  });

  it('the v16 spec is still planned', () => {
    const result = planSignatureImport(librarySpec(), {
      type: 'button',
      target: { platform: 'compose' },
      signature: composeSignature([text('label')]),
    });
    expect(result.ok).toBe(true);
  });
});
