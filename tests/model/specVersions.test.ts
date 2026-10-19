import { describe, expect, it } from 'vitest';
import {
  applySpecialization,
  diffSpecs,
  migrationChain,
  migrationFor,
  missingMigrations,
  parseSpec,
  specializationUpdateImpact,
  type Project,
  type Spec,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecChange,
  type SpecField,
  type SpecLayer,
  type SpecMigration,
  type SpecMigrationStep,
} from '../../src/model';
import { idGen } from './specFixtures';
import { emptyProject } from './fixtures';

// Contrato de versão: `diffSpecs` (aditiva ou quebra), `migrationChain`/`migrationFor` (o que as
// `migrations` cobrem), `missingMigrations` e o `specializationUpdateImpact`. As regras
// estruturais das `migrations` (um arquivo só) estão em specMigrations.test.ts.

const BTN_PATH = 'layers[0].annotationTypes[0]';

function button(over: Partial<SpecAnnotationType> = {}): SpecAnnotationType {
  return {
    id: 'button',
    name: 'Button',
    fields: [
      { key: 'label', type: 'string' },
      { key: 'style', type: 'enum', options: ['primary', 'text'] },
      { key: 'size', type: 'number' },
      {
        key: 'rows',
        type: 'table',
        columns: [
          { key: 'col', type: 'string' },
          { key: 'kind', type: 'enum', options: ['a', 'b'] },
        ],
      },
    ],
    ...over,
  };
}

const badge: SpecAnnotationType = {
  id: 'badge',
  name: 'Badge',
  fields: [{ key: 'text', type: 'string' }],
};

function spec(
  version: number,
  types: SpecAnnotationType[] = [button(), badge],
  over: Partial<Spec> = {},
): Spec {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lib',
    name: 'Lib',
    version,
    layers: [{ id: 'c', name: 'Componentes', color: '#1E88E5', annotationTypes: types }],
    ...over,
  };
}

/** `button` com os campos trocados por `change(fields)`. */
function withFields(change: (fields: SpecField[]) => SpecField[]): SpecAnnotationType {
  return button({ fields: change(button().fields) });
}

/** `v2` sem os passos de migração, mais as migrações dadas (1 → 2). */
function migrated(next: Spec, ...steps: SpecMigrationStep[]): Spec {
  return { ...next, migrations: [{ from: 1, to: 2, steps }] };
}

const v1 = spec(1);

function codes(changes: readonly SpecChange[]): string[] {
  return changes.map((c) => `${c.kind}:${c.code}`);
}

describe('diffSpecs: aditivas', () => {
  it('versões iguais não têm diferença', () => {
    expect(diffSpecs(v1, spec(2))).toEqual([]);
  });

  it('tipo novo (e só ele, sem repetir o que ele traz)', () => {
    const next = spec(2, [
      button(),
      badge,
      { id: 'chip', name: 'Chip', fields: [], component: 'components/chip.json' },
    ]);
    const [change, ...rest] = diffSpecs(v1, next);
    expect(rest).toEqual([]);
    expect(change).toMatchObject({
      kind: 'additive',
      code: 'added-type',
      path: 'layers[0].annotationTypes[2]',
      typeId: 'chip',
      message: 'o tipo "chip" é novo',
    });
  });

  it('campo opcional novo (e coluna opcional nova)', () => {
    const next = spec(2, [
      withFields((f) => [
        ...f.slice(0, 3),
        {
          key: 'rows',
          type: 'table',
          columns: [
            { key: 'col', type: 'string' },
            { key: 'kind', type: 'enum', options: ['a', 'b'] },
            { key: 'extra', type: 'number' },
          ],
        },
        { key: 'icon', type: 'string', required: false },
      ]),
      badge,
    ]);
    const changes = diffSpecs(v1, next);
    expect(changes).toEqual([
      {
        kind: 'additive',
        code: 'added-field',
        path: `${BTN_PATH}.fields[3].columns[2]`,
        typeId: 'button',
        fieldKey: 'rows.extra',
        message: 'a coluna "extra" do campo "rows" do tipo "button" é nova',
      },
      {
        kind: 'additive',
        code: 'added-field',
        path: `${BTN_PATH}.fields[4]`,
        typeId: 'button',
        fieldKey: 'icon',
        message: 'o campo "icon" do tipo "button" é novo',
      },
    ]);
  });

  it('opção nova de enum (campo e coluna)', () => {
    const next = spec(2, [
      withFields((f) => [
        f[0]!,
        { key: 'style', type: 'enum', options: ['primary', 'text', 'tonal'] },
        f[2]!,
        {
          key: 'rows',
          type: 'table',
          columns: [
            { key: 'col', type: 'string' },
            { key: 'kind', type: 'enum', options: ['a', 'b', 'c'] },
          ],
        },
      ]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'additive',
        code: 'added-option',
        path: `${BTN_PATH}.fields[1].options[2]`,
        typeId: 'button',
        fieldKey: 'style',
        option: 'tonal',
        message: 'o campo "style" do tipo "button" ganhou a opção "tonal"',
      },
      {
        kind: 'additive',
        code: 'added-option',
        path: `${BTN_PATH}.fields[3].columns[1].options[2]`,
        typeId: 'button',
        fieldKey: 'rows.kind',
        option: 'c',
        message: 'a coluna "kind" do campo "rows" do tipo "button" ganhou a opção "c"',
      },
    ]);
  });

  it('component, doc, exemplo e fonte novos; component trocado', () => {
    const before = spec(1, [button({ component: 'components/a.json' }), badge]);
    const next = spec(
      2,
      [
        button({
          component: 'components/b.json',
          examples: [{ name: 'basic', values: { label: 'OK' } }],
        }),
        { ...badge, component: 'components/badge.json', doc: 'docs/badge.md' },
      ],
      { fonts: [{ family: 'Roboto', file: 'fonts/Roboto.ttf', weight: 400 }] },
    );
    const changes = diffSpecs(before, next);
    expect(changes.map((c) => [c.code, c.path])).toEqual([
      ['changed-component', `${BTN_PATH}.component`],
      ['added-example', `${BTN_PATH}.examples[0]`],
      ['added-component', 'layers[0].annotationTypes[1].component'],
      ['added-doc', 'layers[0].annotationTypes[1].doc'],
      ['added-font', 'fonts[0]'],
    ]);
    expect(changes.every((c) => c.kind === 'additive')).toBe(true);
    expect(changes[0]?.message).toBe(
      'o componente do tipo "button" passou de "components/a.json" para "components/b.json"',
    );
  });

  it('exemplo e fonte que já existiam (por nome e por família+peso+estilo) não são novidade', () => {
    const font = { family: 'Roboto', file: 'fonts/Roboto.ttf', weight: 400 };
    const withExample = (): SpecAnnotationType =>
      button({ examples: [{ name: 'basic', values: { label: 'OK' } }] });
    const before = spec(1, [withExample(), badge], { fonts: [font] });
    const next = spec(2, [withExample(), badge], {
      fonts: [{ ...font, file: 'fonts/Roboto-v2.ttf' }],
    });
    expect(diffSpecs(before, next)).toEqual([]);
    const italic = spec(2, [withExample(), badge], {
      fonts: [font, { ...font, style: 'italic' }],
    });
    expect(diffSpecs(before, italic).map((c) => c.code)).toEqual(['added-font']);
  });

  it('o que fica fora do contrato nunca gera mudança', () => {
    const before = spec(1, [
      button({ description: 'a', allowedChildren: [], labelField: null }),
      badge,
    ]);
    const next = spec(
      2,
      [
        button({
          name: 'Botão',
          description: 'b',
          labelField: 'label',
          requiresOwner: false,
          code: { web: { symbol: 'Button' } },
          sources: [{ system: 'figma', name: 'DS/Button' }],
          fields: withFields((f) => [
            { ...f[0]!, label: 'Rótulo', description: 'x', tags: ['t'] } as SpecField,
            ...f.slice(1),
          ]).fields,
        }),
        badge,
      ],
      {
        description: 'nova',
        platforms: [{ id: 'web', name: 'Web' }],
      },
    );
    expect(diffSpecs(before, next)).toEqual([]);
  });

  it('tipo que mudou de camada não é quebra', () => {
    const layers: SpecLayer[] = [
      { id: 'c', name: 'C', color: '#1E88E5', annotationTypes: [button()] },
      { id: 'd', name: 'D', color: '#43A047', annotationTypes: [badge] },
    ];
    const before = spec(1, [], { layers });
    const next = spec(2, [], {
      layers: [
        { ...layers[0]!, annotationTypes: [button(), badge] },
        { ...layers[1]!, annotationTypes: [] },
      ],
    });
    expect(diffSpecs(before, next)).toEqual([]);
    expect(missingMigrations(before, next)).toEqual([]);
  });

  it('a ordem dos campos e dos tipos não importa (compara por id e key)', () => {
    const next = spec(2, [badge, withFields((f) => [...f].reverse())]);
    expect(diffSpecs(v1, next)).toEqual([]);
  });
});

describe('diffSpecs: quebras', () => {
  it('tipo removido', () => {
    const [change, ...rest] = diffSpecs(v1, spec(2, [button()]));
    expect(rest).toEqual([]);
    expect(change).toEqual({
      kind: 'breaking',
      code: 'removed-type',
      path: 'layers[0].annotationTypes[1]',
      typeId: 'badge',
      message:
        'o tipo "badge" foi removido; declare um passo "remove-type" ou "rename-type" em migrations',
    });
  });

  it('campo removido', () => {
    const next = spec(2, [withFields((f) => f.filter((x) => x.key !== 'label')), badge]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'removed-field',
        path: `${BTN_PATH}.fields[0]`,
        typeId: 'button',
        fieldKey: 'label',
        message:
          'o campo "label" do tipo "button" foi removido; declare um passo "remove-field" ou "rename-field" em migrations',
      },
    ]);
  });

  it('opção de enum removida', () => {
    const next = spec(2, [
      withFields((f) => [
        f[0]!,
        { key: 'style', type: 'enum', options: ['primary'] },
        ...f.slice(2),
      ]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'removed-option',
        path: `${BTN_PATH}.fields[1].options[1]`,
        typeId: 'button',
        fieldKey: 'style',
        option: 'text',
        message:
          'a opção "text" do campo "style" do tipo "button" foi removida; declare um passo "map-values" com "text" em values em migrations',
      },
    ]);
  });

  it('campo que passou a obrigatório', () => {
    const next = spec(2, [
      withFields((f) => [{ ...f[0]!, required: true } as SpecField, ...f.slice(1)]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'field-required',
        path: `${BTN_PATH}.fields[0]`,
        typeId: 'button',
        fieldKey: 'label',
        message:
          'o campo "label" do tipo "button" passou a ser obrigatório; declare um passo "fill-field" em migrations',
      },
    ]);
  });

  it('campo novo já obrigatório', () => {
    const next = spec(2, [
      withFields((f) => [...f, { key: 'icon', type: 'string', required: true }]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'field-required',
        path: `${BTN_PATH}.fields[4]`,
        typeId: 'button',
        fieldKey: 'icon',
        message:
          'o campo "icon" do tipo "button" é novo e já obrigatório; declare um passo "fill-field" em migrations',
      },
    ]);
  });

  it('type do campo trocado', () => {
    const next = spec(2, [
      withFields((f) => [f[0]!, f[1]!, { key: 'size', type: 'string' }, f[3]!]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'field-type',
        path: `${BTN_PATH}.fields[2]`,
        typeId: 'button',
        fieldKey: 'size',
        message:
          'o campo "size" do tipo "button" mudou de tipo ("number" para "string"); declare um passo "fill-field" em migrations',
      },
    ]);
  });

  it('coluna de table removida', () => {
    const next = spec(2, [
      withFields((f) => [
        ...f.slice(0, 3),
        {
          key: 'rows',
          type: 'table',
          columns: [{ key: 'kind', type: 'enum', options: ['a', 'b'] }],
        },
      ]),
      badge,
    ]);
    expect(diffSpecs(v1, next)).toEqual([
      {
        kind: 'breaking',
        code: 'removed-field',
        path: `${BTN_PATH}.fields[3].columns[0]`,
        typeId: 'button',
        fieldKey: 'rows.col',
        message:
          'a coluna "col" do campo "rows" do tipo "button" foi removida; declare um passo "remove-field" ou "rename-field" em migrations com field "rows.col"',
      },
    ]);
  });

  it('coluna com type trocado, coluna que passa a obrigatória e coluna nova obrigatória', () => {
    const next = spec(2, [
      withFields((f) => [
        ...f.slice(0, 3),
        {
          key: 'rows',
          type: 'table',
          columns: [
            { key: 'col', type: 'number' },
            { key: 'kind', type: 'enum', options: ['a', 'b'], required: true },
            { key: 'extra', type: 'string', required: true },
          ],
        },
      ]),
      badge,
    ]);
    const changes = diffSpecs(v1, next);
    expect(changes.map((c) => [c.code, c.fieldKey, c.path])).toEqual([
      ['field-type', 'rows.col', `${BTN_PATH}.fields[3].columns[0]`],
      ['field-required', 'rows.kind', `${BTN_PATH}.fields[3].columns[1]`],
      ['field-required', 'rows.extra', `${BTN_PATH}.fields[3].columns[2]`],
    ]);
    expect(changes[0]?.message).toBe(
      'a coluna "col" do campo "rows" do tipo "button" mudou de tipo ("string" para "number"); declare um passo "fill-field" em migrations com field "rows.col"',
    );
    expect(changes[2]?.message).toBe(
      'a coluna "extra" do campo "rows" do tipo "button" é nova e já obrigatória; declare um passo "fill-field" em migrations com field "rows.extra"',
    );
  });

  it('campo que virou table ou deixou de ser: só field-type, sem olhar o conteúdo', () => {
    const next = spec(2, [
      withFields((f) => [
        f[0]!,
        { key: 'style', type: 'string' },
        f[2]!,
        { key: 'rows', type: 'string' },
      ]),
      badge,
    ]);
    expect(codes(diffSpecs(v1, next))).toEqual([
      'breaking:field-type',
      'breaking:field-type',
    ]);
  });

  it('a lista segue a ordem do arquivo novo e depois a do anterior', () => {
    const next = spec(2, [
      withFields((f) => [
        { key: 'icon', type: 'string' },
        { ...f[2]!, type: 'string' } as SpecField,
        { key: 'style', type: 'enum', options: ['text', 'tonal'] },
        f[3]!,
      ]),
      { id: 'chip', name: 'Chip', fields: [] },
    ]);
    expect(diffSpecs(v1, next).map((c) => [c.code, c.fieldKey ?? c.typeId])).toEqual([
      ['added-field', 'icon'],
      ['field-type', 'size'],
      ['added-option', 'style'],
      ['added-type', 'chip'],
      ['removed-field', 'label'],
      ['removed-option', 'style'],
      ['removed-type', 'badge'],
    ]);
  });
});

describe('migrationChain', () => {
  const step: SpecMigrationStep = { op: 'remove-type', type: 'x', mode: 'delete' };
  const entry = (from: number, to: number): SpecMigration => ({
    from,
    to,
    steps: [step],
  });

  it('liga as entradas de from até a versão nova, em ordem', () => {
    const next = spec(3, [button()], { migrations: [entry(2, 3), entry(1, 2)] });
    expect(migrationChain(next, 1)).toEqual([entry(1, 2), entry(2, 3)]);
    expect(migrationChain(next, 2)).toEqual([entry(2, 3)]);
  });

  it('já na versão nova: cadeia vazia, mesmo sem migrations', () => {
    expect(migrationChain(spec(3), 3)).toEqual([]);
  });

  it('rompida: sem migrations, entrada do meio faltando, ou sem chegar à versão nova', () => {
    expect(migrationChain(spec(2), 1)).toBeUndefined();
    expect(
      migrationChain(spec(4, [button()], { migrations: [entry(1, 2), entry(3, 4)] }), 1),
    ).toBeUndefined();
    expect(
      migrationChain(spec(4, [button()], { migrations: [entry(1, 2), entry(2, 3)] }), 1),
    ).toBeUndefined();
  });

  it('versão aplicada que é maior que a nova, ou fora da cadeia, não tem cadeia', () => {
    expect(migrationChain(spec(2, [button()], { migrations: [entry(1, 2)] }), 3)).toBe(
      undefined,
    );
    expect(migrationChain(spec(3, [button()], { migrations: [entry(2, 3)] }), 1)).toBe(
      undefined,
    );
  });

  it('não entra em laço com entrada que aponta para si ou para trás', () => {
    expect(
      migrationChain(spec(3, [button()], { migrations: [entry(1, 1)] }), 1),
    ).toBeUndefined();
    expect(
      migrationChain(spec(3, [button()], { migrations: [entry(1, 2), entry(2, 1)] }), 1),
    ).toBeUndefined();
  });
});

describe('migrationFor e missingMigrations: cada quebra, com e sem a migração', () => {
  /** Verifica uma quebra: sem migração fica faltando; com `cover` não; com `wrong` continua. */
  function check(
    next: Spec,
    code: string,
    cover: SpecMigrationStep[],
    wrong: SpecMigrationStep[] = [],
  ): SpecChange {
    const [change] = missingMigrations(v1, next);
    if (!change) throw new Error('era para ter uma quebra');
    expect(change.code).toBe(code);
    expect(missingMigrations(v1, next)).toHaveLength(1);

    const covered = migrated(next, ...cover);
    // O formato aceita os passos que cobrem (inclusive `tabela.coluna`), não só o `Spec` montado.
    const parsed = parseSpec(JSON.parse(JSON.stringify(covered)));
    expect(parsed.ok, parsed.ok ? '' : parsed.errors.join('\n')).toBe(true);
    expect(missingMigrations(v1, covered)).toEqual([]);
    expect(migrationFor(covered, 1, change)).toEqual(cover[0]);
    if (wrong.length > 0) {
      const other = migrated(next, ...wrong);
      expect(missingMigrations(v1, other)).toEqual([change]);
      expect(migrationFor(other, 1, change)).toBeUndefined();
    }
    return change;
  }
  it('tipo removido: remove-type e rename-type cobrem', () => {
    const next = spec(2, [button(), { id: 'pill', name: 'Pill', fields: [] }]);
    const change = check(next, 'removed-type', [
      { op: 'remove-type', type: 'badge', mode: 'convert' },
    ]);
    expect(
      missingMigrations(
        v1,
        migrated(next, { op: 'rename-type', from: 'badge', to: 'pill' }),
      ),
    ).toEqual([]);
    // remove-type de outro tipo não serve
    expect(
      migrationFor(
        migrated(next, { op: 'remove-type', type: 'button', mode: 'delete' }),
        1,
        change,
      ),
    ).toBeUndefined();
  });

  it('campo removido: remove-field e rename-field cobrem; o tipo e o campo têm de bater', () => {
    const next = spec(2, [
      withFields((f) => [...f.slice(1), { key: 'text', type: 'string' }]),
      badge,
    ]);
    const change = check(
      next,
      'removed-field',
      [{ op: 'remove-field', type: 'button', field: 'label' }],
      [{ op: 'remove-field', type: 'badge', field: 'label' }],
    );
    const renamed = migrated(next, {
      op: 'rename-field',
      type: 'button',
      from: 'label',
      to: 'text',
    });
    expect(missingMigrations(v1, renamed)).toEqual([]);
    expect(migrationFor(renamed, 1, change)).toMatchObject({ op: 'rename-field' });
    expect(
      migrationFor(
        migrated(next, { op: 'remove-field', type: 'button', field: 'size' }),
        1,
        change,
      ),
    ).toBeUndefined();
  });

  it('opção removida: map-values com a opção entre as chaves de values', () => {
    const next = spec(2, [
      withFields((f) => [
        f[0]!,
        { key: 'style', type: 'enum', options: ['primary', 'tonal'] },
        ...f.slice(2),
      ]),
      badge,
    ]);
    const change = check(
      next,
      'removed-option',
      [{ op: 'map-values', type: 'button', field: 'style', values: { text: 'tonal' } }],
      // map-values do mesmo campo, mas sem a opção removida nas chaves: não cobre.
      [{ op: 'map-values', type: 'button', field: 'style', values: { other: 'tonal' } }],
    );
    expect(change.option).toBe('text');
    // as chaves, não os destinos: mapear PARA a opção removida não conta
    expect(
      migrationFor(
        migrated(next, {
          op: 'map-values',
          type: 'button',
          field: 'style',
          values: { other: 'text' },
        }),
        1,
        change,
      ),
    ).toBeUndefined();
  });

  it('campo que passou a obrigatório: fill-field cobre', () => {
    const next = spec(2, [
      withFields((f) => [{ ...f[0]!, required: true } as SpecField, ...f.slice(1)]),
      badge,
    ]);
    check(
      next,
      'field-required',
      [{ op: 'fill-field', type: 'button', field: 'label', default: '-' }],
      [{ op: 'fill-field', type: 'button', field: 'size', default: 0 }],
    );
  });

  it('campo novo obrigatório: fill-field cobre', () => {
    const next = spec(2, [
      withFields((f) => [...f, { key: 'icon', type: 'string', required: true }]),
      badge,
    ]);
    check(next, 'field-required', [
      { op: 'fill-field', type: 'button', field: 'icon', default: 'none' },
    ]);
  });

  it('type de campo trocado: fill-field cobre', () => {
    const next = spec(2, [
      withFields((f) => [f[0]!, f[1]!, { key: 'size', type: 'string' }, f[3]!]),
      badge,
    ]);
    check(
      next,
      'field-type',
      [{ op: 'fill-field', type: 'button', field: 'size', default: 'm' }],
      [{ op: 'remove-field', type: 'button', field: 'size' }],
    );
  });

  /** `button` com a tabela `rows` trocada por estas colunas. */
  const withColumns = (columns: SpecColumn[]): SpecAnnotationType =>
    withFields((f) => [...f.slice(0, 3), { key: 'rows', type: 'table', columns }]);

  /** Sem passo nenhum a quebra de coluna fica faltando, com o `fieldKey` `tabela.coluna`. */
  function expectMissing(next: Spec, code: string, fieldKey: string): SpecChange {
    const missing = missingMigrations(v1, next);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ kind: 'breaking', code, fieldKey });
    return missing[0] as SpecChange;
  }

  it('coluna removida: remove-field com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([{ key: 'kind', type: 'enum', options: ['a', 'b'] }]),
      badge,
    ]);
    const change = expectMissing(next, 'removed-field', 'rows.col');
    check(
      next,
      'removed-field',
      [{ op: 'remove-field', type: 'button', field: 'rows.col' }],
      // o nome da tabela, sem a coluna, não cobre
      [{ op: 'remove-field', type: 'button', field: 'rows' }],
    );
    expect(change.fieldKey).toBe('rows.col');
  });

  it('coluna renomeada: rename-field com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([
        { key: 'name', type: 'string' },
        { key: 'kind', type: 'enum', options: ['a', 'b'] },
      ]),
      badge,
    ]);
    expectMissing(next, 'removed-field', 'rows.col');
    check(
      next,
      'removed-field',
      [{ op: 'rename-field', type: 'button', from: 'rows.col', to: 'rows.name' }],
      [{ op: 'rename-field', type: 'button', from: 'col', to: 'name' }],
    );
  });

  it('coluna com type trocado: fill-field com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([
        { key: 'col', type: 'number' },
        { key: 'kind', type: 'enum', options: ['a', 'b'] },
      ]),
      badge,
    ]);
    expectMissing(next, 'field-type', 'rows.col');
    check(
      next,
      'field-type',
      [{ op: 'fill-field', type: 'button', field: 'rows.col', default: 0 }],
      [{ op: 'fill-field', type: 'button', field: 'rows', default: 0 }],
    );
  });

  it('coluna que passou a obrigatória: fill-field com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([
        { key: 'col', type: 'string', required: true },
        { key: 'kind', type: 'enum', options: ['a', 'b'] },
      ]),
      badge,
    ]);
    expectMissing(next, 'field-required', 'rows.col');
    check(
      next,
      'field-required',
      [{ op: 'fill-field', type: 'button', field: 'rows.col', default: '-' }],
      [{ op: 'fill-field', type: 'button', field: 'rows.kind', default: 'a' }],
    );
  });

  it('coluna nova obrigatória: fill-field com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([
        { key: 'col', type: 'string' },
        { key: 'kind', type: 'enum', options: ['a', 'b'] },
        { key: 'extra', type: 'number', required: true },
      ]),
      badge,
    ]);
    expectMissing(next, 'field-required', 'rows.extra');
    check(
      next,
      'field-required',
      [{ op: 'fill-field', type: 'button', field: 'rows.extra', default: 0 }],
      [{ op: 'fill-field', type: 'button', field: 'extra', default: 0 }],
    );
  });

  it('opção removida de coluna enum: map-values com tabela.coluna cobre', () => {
    const next = spec(2, [
      withColumns([
        { key: 'col', type: 'string' },
        { key: 'kind', type: 'enum', options: ['a', 'c'] },
      ]),
      badge,
    ]);
    const change = expectMissing(next, 'removed-option', 'rows.kind');
    expect(change.option).toBe('b');
    check(
      next,
      'removed-option',
      [{ op: 'map-values', type: 'button', field: 'rows.kind', values: { b: 'c' } }],
      // a coluna certa, mas sem a opção removida nas chaves: não cobre
      [{ op: 'map-values', type: 'button', field: 'rows.kind', values: { x: 'c' } }],
    );
  });

  it('migrationFor devolve undefined para mudança aditiva', () => {
    const next = migrated(
      spec(2, [button(), badge, { id: 'chip', name: 'Chip', fields: [] }]),
      {
        op: 'remove-type',
        type: 'chip',
        mode: 'delete',
      },
    );
    const [added] = diffSpecs(v1, next);
    expect(added?.kind).toBe('additive');
    expect(migrationFor(next, 1, added as SpecChange)).toBeUndefined();
  });
});

describe('cadeia de migrações no missingMigrations', () => {
  /** v1 → v3: removeu `badge` (v1 → v2) e o campo `size` (v2 → v3). */
  const v2 = spec(2, [button()]);
  const v3 = spec(3, [withFields((f) => f.filter((x) => x.key !== 'size'))]);
  const removeBadge: SpecMigrationStep = {
    op: 'remove-type',
    type: 'badge',
    mode: 'delete',
  };
  const removeSize: SpecMigrationStep = {
    op: 'remove-field',
    type: 'button',
    field: 'size',
  };

  it('duas entradas ligadas (1→2, 2→3) cobrem uma quebra cada', () => {
    const next: Spec = {
      ...v3,
      migrations: [
        { from: 1, to: 2, steps: [removeBadge] },
        { from: 2, to: 3, steps: [removeSize] },
      ],
    };
    expect(diffSpecs(v1, next).filter((c) => c.kind === 'breaking')).toHaveLength(2);
    expect(missingMigrations(v1, next)).toEqual([]);
    const [size, badgeChange] = diffSpecs(v1, next).filter((c) => c.kind === 'breaking');
    expect(migrationFor(next, 1, size as SpecChange)).toEqual(removeSize);
    expect(migrationFor(next, 1, badgeChange as SpecChange)).toEqual(removeBadge);
    // saindo da v2 só o 2→3 vale
    expect(migrationFor(next, 2, badgeChange as SpecChange)).toBeUndefined();
    expect(migrationFor(next, 2, size as SpecChange)).toEqual(removeSize);
    expect(missingMigrations(v2, next)).toEqual([]);
  });

  it('cadeia rompida (falta a entrada do meio) deixa tudo faltando', () => {
    const next: Spec = {
      ...v3,
      version: 4,
      migrations: [
        { from: 1, to: 2, steps: [removeBadge] },
        { from: 3, to: 4, steps: [removeSize] },
      ],
    };
    const missing = missingMigrations(v1, next);
    expect(missing.map((c) => c.code).sort()).toEqual(['removed-field', 'removed-type']);
    expect(missing).toEqual(diffSpecs(v1, next).filter((c) => c.kind === 'breaking'));
    for (const change of missing) expect(migrationFor(next, 1, change)).toBeUndefined();
  });

  it('entrada cujo from não é o da versão aplicada não serve', () => {
    const next: Spec = {
      ...v3,
      migrations: [{ from: 2, to: 3, steps: [removeBadge, removeSize] }],
    };
    // aplicada na v1: a cadeia começa em 1 e não existe
    expect(migrationChain(next, 1)).toBeUndefined();
    expect(
      missingMigrations(v1, next)
        .map((c) => c.code)
        .sort(),
    ).toEqual(['removed-field', 'removed-type']);
    // aplicada na v2: a entrada 2→3 serve para o que ela cobre
    expect(missingMigrations({ ...v1, version: 2 }, next)).toEqual([]);
  });

  it('sem migrations, toda quebra fica faltando; sem quebra, nada falta', () => {
    expect(missingMigrations(v1, spec(2, [button()])).map((c) => c.code)).toEqual([
      'removed-type',
    ]);
    expect(missingMigrations(v1, spec(2, [button(), badge]))).toEqual([]);
  });
});

describe('specializationUpdateImpact', () => {
  /** Projeto com `before` aplicada (camada `c`) e a camada `d` do projeto livre. */
  function projectWith(before: Spec): Project {
    return applySpecialization(emptyProject(), before, { newId: idGen('L') });
  }
  const layerC = (types: SpecAnnotationType[]): SpecLayer => ({
    id: 'c',
    name: 'Componentes',
    color: '#1E88E5',
    annotationTypes: types,
  });
  const layerE: SpecLayer = {
    id: 'e',
    name: 'Eventos',
    color: '#FB8C00',
    annotationTypes: [],
  };

  it('aditiva: nada em breaking, e as camadas continuam certas', () => {
    const before = spec(1, [], { layers: [layerC([button(), badge]), layerE] });
    const next = spec(2, [], {
      layers: [layerC([button(), badge, { id: 'chip', name: 'Chip', fields: [] }])],
    });
    const impact = specializationUpdateImpact(projectWith(before), next);
    expect(impact.comparable).toBe(true);
    expect(codes(impact.changes)).toEqual(['additive:added-type']);
    expect(impact.breaking).toEqual([]);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.migrations).toEqual([]);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers.map((l) => l.spec?.layerId)).toEqual(['e']);
    expect(impact.brokenRefs).toBe(0);
  });

  it('quebra coberta: breaking cheio, missingMigrations vazio e os passos da cadeia', () => {
    const before = spec(1, [], { layers: [layerC([button(), badge])] });
    const steps: SpecMigrationStep[] = [
      { op: 'remove-type', type: 'badge', mode: 'convert' },
    ];
    const next = spec(2, [], {
      layers: [layerC([button()]), layerE],
      migrations: [{ from: 1, to: 2, steps }],
    });
    const impact = specializationUpdateImpact(projectWith(before), next);
    expect(impact.comparable).toBe(true);
    expect(codes(impact.breaking)).toEqual(['breaking:removed-type']);
    expect(impact.breaking[0]?.typeId).toBe('badge');
    expect(impact.changes).toEqual(impact.breaking);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.migrations).toEqual(steps);
    expect(impact.addedLayers.map((l) => l.id)).toEqual(['e']);
    expect(impact.freedLayers).toEqual([]);
    expect(impact.brokenRefs).toBe(0);
  });

  it('quebra descoberta: aparece em missingMigrations, com mensagem e caminho', () => {
    const before = spec(1, [], { layers: [layerC([button(), badge])] });
    const next = spec(2, [], {
      layers: [layerC([withFields((f) => f.filter((x) => x.key !== 'label')), badge])],
      migrations: [
        { from: 1, to: 2, steps: [{ op: 'remove-type', type: 'badge', mode: 'delete' }] },
      ],
    });
    const impact = specializationUpdateImpact(projectWith(before), next);
    expect(impact.missingMigrations).toHaveLength(1);
    expect(impact.missingMigrations[0]).toMatchObject({
      code: 'removed-field',
      path: `${BTN_PATH}.fields[0]`,
      message: expect.stringContaining('declare um passo "remove-field"'),
    });
    expect(impact.breaking).toEqual(impact.missingMigrations);
    // os passos declarados são informados mesmo quando não cobrem tudo
    expect(impact.migrations).toHaveLength(1);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers).toEqual([]);
  });

  it('cópia indisponível (spec: null): não comparável, tudo vazio, o resto intacto', () => {
    const before = spec(1, [], { layers: [layerC([button(), badge]), layerE] });
    const p = projectWith(before);
    const noCopy: Project = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: null })),
    };
    const next = spec(2, [], { layers: [layerC([button()])] });
    const impact = specializationUpdateImpact(noCopy, next);
    expect(impact.comparable).toBe(false);
    expect(impact.changes).toEqual([]);
    expect(impact.breaking).toEqual([]);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.migrations).toEqual([]);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers.map((l) => l.spec?.layerId)).toEqual(['e']);
    expect(impact.brokenRefs).toBe(0);
  });
});
