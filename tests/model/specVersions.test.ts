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
import { withoutMessageCode } from '../support/withoutMessageCode';
import { emptyProject } from './fixtures';

// Version contract: `diffSpecs` (additive or breaking), `migrationChain`/`migrationFor` (what the
// `migrations` cover), `missingMigrations` and `specializationUpdateImpact`. The structural
// rules of the `migrations` (a single file) are in specMigrations.test.ts.

const BTN_PATH = 'layers[0].annotationTypes[0]';

/** Without the interface message code: the tests compare the text. */
const plain = (changes: readonly SpecChange[]) => changes.map(withoutMessageCode);

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
    layers: [{ id: 'c', name: 'Components', color: '#1E88E5', annotationTypes: types }],
    ...over,
  };
}

/** `button` with the fields replaced by `change(fields)`. */
function withFields(change: (fields: SpecField[]) => SpecField[]): SpecAnnotationType {
  return button({ fields: change(button().fields) });
}

/** `v2` without the migration steps, plus the given migrations (1 → 2). */
function migrated(next: Spec, ...steps: SpecMigrationStep[]): Spec {
  return { ...next, migrations: [{ from: 1, to: 2, steps }] };
}

const v1 = spec(1);

function codes(changes: readonly SpecChange[]): string[] {
  return changes.map((c) => `${c.kind}:${c.code}`);
}

describe('diffSpecs: additive', () => {
  it('equal versions have no difference', () => {
    expect(diffSpecs(v1, spec(2))).toEqual([]);
  });

  it('new type (and only it, without repeating what it brings)', () => {
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
      message: 'the type "chip" is new',
    });
  });

  it('new optional field (and new optional column)', () => {
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
    expect(plain(changes)).toEqual([
      {
        kind: 'additive',
        code: 'added-field',
        path: `${BTN_PATH}.fields[3].columns[2]`,
        typeId: 'button',
        fieldKey: 'rows.extra',
        message: 'the column "extra" of the field "rows" of the type "button" is new',
      },
      {
        kind: 'additive',
        code: 'added-field',
        path: `${BTN_PATH}.fields[4]`,
        typeId: 'button',
        fieldKey: 'icon',
        message: 'the field "icon" of the type "button" is new',
      },
    ]);
  });

  it('new enum option (field and column)', () => {
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
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'additive',
        code: 'added-option',
        path: `${BTN_PATH}.fields[1].options[2]`,
        typeId: 'button',
        fieldKey: 'style',
        option: 'tonal',
        message: 'the field "style" of the type "button" gained the option "tonal"',
      },
      {
        kind: 'additive',
        code: 'added-option',
        path: `${BTN_PATH}.fields[3].columns[1].options[2]`,
        typeId: 'button',
        fieldKey: 'rows.kind',
        option: 'c',
        message:
          'the column "kind" of the field "rows" of the type "button" gained the option "c"',
      },
    ]);
  });

  it('notices (adding, changing, removing) stay outside the contract: they do not generate a SpecChange', () => {
    const notice = { kind: 'deprecated', message: 'use another' } as const;
    const withNotices = (message: string): SpecAnnotationType =>
      button({
        notices: [{ ...notice, message }],
        fields: button().fields.map((f) =>
          f.type === 'table'
            ? {
                ...f,
                notices: [{ ...notice, message }],
                columns: f.columns.map((c) => ({
                  ...c,
                  notices: [{ ...notice, message }],
                })),
              }
            : { ...f, notices: [{ ...notice, message }] },
        ),
      });
    const plain = spec(1, [button(), badge]);
    const noticed = spec(2, [withNotices('a'), badge]);
    expect(diffSpecs(plain, noticed)).toEqual([]);
    expect(diffSpecs(noticed, plain)).toEqual([]);
    expect(diffSpecs(noticed, spec(3, [withNotices('b'), badge]))).toEqual([]);
    expect(missingMigrations(noticed, plain)).toEqual([]);
  });

  it('appliesTo changed on an existing type is additive; equal to the default does not count', () => {
    const before = spec(1, [button(), badge]);
    const same = spec(2, [button({ appliesTo: ['marking'] }), badge]);
    expect(diffSpecs(before, same)).toEqual([]);
    const next = spec(2, [button({ appliesTo: ['arrow', 'marking'] }), badge]);
    const changes = diffSpecs(before, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'additive',
      code: 'changed-applies-to',
      path: `${BTN_PATH}.appliesTo`,
      typeId: 'button',
    });
    expect(missingMigrations(before, next)).toEqual([]);
  });

  it('new component, doc, example and font; changed component', () => {
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
      'the component of the type "button" changed from "components/a.json" to "components/b.json"',
    );
  });

  it('an example and a font that already existed (by name and by family+weight+style) are not new', () => {
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

  it('what stays outside the contract never generates a change', () => {
    const before = spec(1, [
      button({ description: 'a', allowedChildren: [], labelField: null }),
      badge,
    ]);
    const next = spec(
      2,
      [
        button({
          name: 'Button',
          description: 'b',
          labelField: 'label',
          requiresOwner: false,
          code: { web: { symbol: 'Button' } },
          sources: [{ system: 'figma', name: 'DS/Button' }],
          fields: withFields((f) => [
            { ...f[0]!, label: 'Label', description: 'x', tags: ['t'] } as SpecField,
            ...f.slice(1),
          ]).fields,
        }),
        badge,
      ],
      {
        description: 'new',
        platforms: [{ id: 'web', name: 'Web' }],
      },
    );
    expect(diffSpecs(before, next)).toEqual([]);
  });

  it('a type that changed layer is not a break', () => {
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

  it('the order of fields and types does not matter (compares by id and key)', () => {
    const next = spec(2, [badge, withFields((f) => [...f].reverse())]);
    expect(plain(diffSpecs(v1, next))).toEqual([]);
  });
});

describe('diffSpecs: breaks', () => {
  it('removed type', () => {
    const [change, ...rest] = diffSpecs(v1, spec(2, [button()]));
    expect(rest).toEqual([]);
    expect(plain(change === undefined ? [] : [change])[0]).toEqual({
      kind: 'breaking',
      code: 'removed-type',
      path: 'layers[0].annotationTypes[1]',
      typeId: 'badge',
      message:
        'the type "badge" was removed; declare a "remove-type" or "rename-type" step in migrations',
    });
  });

  it('removed field', () => {
    const next = spec(2, [withFields((f) => f.filter((x) => x.key !== 'label')), badge]);
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'removed-field',
        path: `${BTN_PATH}.fields[0]`,
        typeId: 'button',
        fieldKey: 'label',
        message:
          'the field "label" of the type "button" was removed; declare a "remove-field" or "rename-field" step in migrations',
      },
    ]);
  });

  it('removed enum option', () => {
    const next = spec(2, [
      withFields((f) => [
        f[0]!,
        { key: 'style', type: 'enum', options: ['primary'] },
        ...f.slice(2),
      ]),
      badge,
    ]);
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'removed-option',
        path: `${BTN_PATH}.fields[1].options[1]`,
        typeId: 'button',
        fieldKey: 'style',
        option: 'text',
        message:
          'the option "text" of the field "style" of the type "button" was removed; declare a "map-values" step with "text" in values in migrations',
      },
    ]);
  });

  it('field that became required', () => {
    const next = spec(2, [
      withFields((f) => [{ ...f[0]!, required: true } as SpecField, ...f.slice(1)]),
      badge,
    ]);
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'field-required',
        path: `${BTN_PATH}.fields[0]`,
        typeId: 'button',
        fieldKey: 'label',
        message:
          'the field "label" of the type "button" became required; declare a "fill-field" step in migrations',
      },
    ]);
  });

  it('new field already required', () => {
    const next = spec(2, [
      withFields((f) => [...f, { key: 'icon', type: 'string', required: true }]),
      badge,
    ]);
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'field-required',
        path: `${BTN_PATH}.fields[4]`,
        typeId: 'button',
        fieldKey: 'icon',
        message:
          'the field "icon" of the type "button" is new and already required; declare a "fill-field" step in migrations',
      },
    ]);
  });

  it('changed field type', () => {
    const next = spec(2, [
      withFields((f) => [f[0]!, f[1]!, { key: 'size', type: 'string' }, f[3]!]),
      badge,
    ]);
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'field-type',
        path: `${BTN_PATH}.fields[2]`,
        typeId: 'button',
        fieldKey: 'size',
        message:
          'the field "size" of the type "button" changed type ("number" to "string"); declare a "fill-field" step in migrations',
      },
    ]);
  });

  it('removed table column', () => {
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
    expect(plain(diffSpecs(v1, next))).toEqual([
      {
        kind: 'breaking',
        code: 'removed-field',
        path: `${BTN_PATH}.fields[3].columns[0]`,
        typeId: 'button',
        fieldKey: 'rows.col',
        message:
          'the column "col" of the field "rows" of the type "button" was removed; declare a "remove-field" or "rename-field" step in migrations with field "rows.col"',
      },
    ]);
  });

  it('column with a changed type, a column that becomes required and a new required column', () => {
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
      'the column "col" of the field "rows" of the type "button" changed type ("string" to "number"); declare a "fill-field" step in migrations with field "rows.col"',
    );
    expect(changes[2]?.message).toBe(
      'the column "extra" of the field "rows" of the type "button" is new and already required; declare a "fill-field" step in migrations with field "rows.extra"',
    );
  });

  it('field that became a table or stopped being one: only field-type, without looking at the content', () => {
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

  it('the list follows the order of the new file and then that of the previous one', () => {
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

  it('links the entries from `from` to the new version, in order', () => {
    const next = spec(3, [button()], { migrations: [entry(2, 3), entry(1, 2)] });
    expect(migrationChain(next, 1)).toEqual([entry(1, 2), entry(2, 3)]);
    expect(migrationChain(next, 2)).toEqual([entry(2, 3)]);
  });

  it('already at the new version: empty chain, even without migrations', () => {
    expect(migrationChain(spec(3), 3)).toEqual([]);
  });

  it('broken: without migrations, a middle entry missing, or without reaching the new version', () => {
    expect(migrationChain(spec(2), 1)).toBeUndefined();
    expect(
      migrationChain(spec(4, [button()], { migrations: [entry(1, 2), entry(3, 4)] }), 1),
    ).toBeUndefined();
    expect(
      migrationChain(spec(4, [button()], { migrations: [entry(1, 2), entry(2, 3)] }), 1),
    ).toBeUndefined();
  });

  it('an applied version greater than the new one, or outside the chain, has no chain', () => {
    expect(migrationChain(spec(2, [button()], { migrations: [entry(1, 2)] }), 3)).toBe(
      undefined,
    );
    expect(migrationChain(spec(3, [button()], { migrations: [entry(2, 3)] }), 1)).toBe(
      undefined,
    );
  });

  it('does not loop with an entry that points to itself or backwards', () => {
    expect(
      migrationChain(spec(3, [button()], { migrations: [entry(1, 1)] }), 1),
    ).toBeUndefined();
    expect(
      migrationChain(spec(3, [button()], { migrations: [entry(1, 2), entry(2, 1)] }), 1),
    ).toBeUndefined();
  });
});

describe('migrationFor and missingMigrations: each break, with and without the migration', () => {
  /** Checks a break: without a migration it is missing; with `cover` it is not; with `wrong` it remains. */
  function check(
    next: Spec,
    code: string,
    cover: SpecMigrationStep[],
    wrong: SpecMigrationStep[] = [],
  ): SpecChange {
    const [change] = missingMigrations(v1, next);
    if (!change) throw new Error('was supposed to have a break');
    expect(change.code).toBe(code);
    expect(missingMigrations(v1, next)).toHaveLength(1);

    const covered = migrated(next, ...cover);
    // The format accepts the steps that cover (including `table.column`), not only the assembled `Spec`.
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
  it('removed type: remove-type and rename-type cover', () => {
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
    // remove-type of another type does not work
    expect(
      migrationFor(
        migrated(next, { op: 'remove-type', type: 'button', mode: 'delete' }),
        1,
        change,
      ),
    ).toBeUndefined();
  });

  it('removed field: remove-field and rename-field cover; the type and the field must match', () => {
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

  it('removed option: map-values with the option among the keys of values', () => {
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
      // map-values of the same field, but without the removed option in the keys: does not cover.
      [{ op: 'map-values', type: 'button', field: 'style', values: { other: 'tonal' } }],
    );
    expect(change.option).toBe('text');
    // the keys, not the targets: mapping TO the removed option does not count
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

  it('field that became required: fill-field covers', () => {
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

  it('new required field: fill-field covers', () => {
    const next = spec(2, [
      withFields((f) => [...f, { key: 'icon', type: 'string', required: true }]),
      badge,
    ]);
    check(next, 'field-required', [
      { op: 'fill-field', type: 'button', field: 'icon', default: 'none' },
    ]);
  });

  it('changed field type: fill-field covers', () => {
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

  /** `button` with the table `rows` replaced by these columns. */
  const withColumns = (columns: SpecColumn[]): SpecAnnotationType =>
    withFields((f) => [...f.slice(0, 3), { key: 'rows', type: 'table', columns }]);

  /** Without any step the column break is missing, with the `fieldKey` `table.column`. */
  function expectMissing(next: Spec, code: string, fieldKey: string): SpecChange {
    const missing = missingMigrations(v1, next);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ kind: 'breaking', code, fieldKey });
    return missing[0] as SpecChange;
  }

  it('removed column: remove-field with table.column covers', () => {
    const next = spec(2, [
      withColumns([{ key: 'kind', type: 'enum', options: ['a', 'b'] }]),
      badge,
    ]);
    const change = expectMissing(next, 'removed-field', 'rows.col');
    check(
      next,
      'removed-field',
      [{ op: 'remove-field', type: 'button', field: 'rows.col' }],
      // the table name, without the column, does not cover
      [{ op: 'remove-field', type: 'button', field: 'rows' }],
    );
    expect(change.fieldKey).toBe('rows.col');
  });

  it('renamed column: rename-field with table.column covers', () => {
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

  it('column with a changed type: fill-field with table.column covers', () => {
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

  it('column that became required: fill-field with table.column covers', () => {
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

  it('new required column: fill-field with table.column covers', () => {
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

  it('removed option of an enum column: map-values with table.column covers', () => {
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
      // the right column, but without the removed option in the keys: does not cover
      [{ op: 'map-values', type: 'button', field: 'rows.kind', values: { x: 'c' } }],
    );
  });

  it('migrationFor returns undefined for an additive change', () => {
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

describe('migration chain in missingMigrations', () => {
  /** v1 → v3: removed `badge` (v1 → v2) and the field `size` (v2 → v3). */
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

  it('two linked entries (1→2, 2→3) cover one break each', () => {
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
    // leaving v2 only 2→3 counts
    expect(migrationFor(next, 2, badgeChange as SpecChange)).toBeUndefined();
    expect(migrationFor(next, 2, size as SpecChange)).toEqual(removeSize);
    expect(missingMigrations(v2, next)).toEqual([]);
  });

  it('a broken chain (the middle entry is missing) leaves everything missing', () => {
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

  it('an entry whose from is not that of the applied version does not work', () => {
    const next: Spec = {
      ...v3,
      migrations: [{ from: 2, to: 3, steps: [removeBadge, removeSize] }],
    };
    // applied at v1: the chain starts at 1 and does not exist
    expect(migrationChain(next, 1)).toBeUndefined();
    expect(
      missingMigrations(v1, next)
        .map((c) => c.code)
        .sort(),
    ).toEqual(['removed-field', 'removed-type']);
    // applied at v2: the 2→3 entry works for what it covers
    expect(missingMigrations({ ...v1, version: 2 }, next)).toEqual([]);
  });

  it('without migrations, every break is missing; without a break, nothing is missing', () => {
    expect(missingMigrations(v1, spec(2, [button()])).map((c) => c.code)).toEqual([
      'removed-type',
    ]);
    expect(missingMigrations(v1, spec(2, [button(), badge]))).toEqual([]);
  });
});

describe('specializationUpdateImpact', () => {
  /** Project with `before` applied (layer `c`) and the layer `d` of the free project. */
  function projectWith(before: Spec): Project {
    return applySpecialization(emptyProject(), before, { newId: idGen('L') });
  }
  const layerC = (types: SpecAnnotationType[]): SpecLayer => ({
    id: 'c',
    name: 'Components',
    color: '#1E88E5',
    annotationTypes: types,
  });
  const layerE: SpecLayer = {
    id: 'e',
    name: 'Eventos',
    color: '#FB8C00',
    annotationTypes: [],
  };

  it('additive: nothing in breaking, and the layers stay right', () => {
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

  it('a layer that disappears (changed id, same types) is not additive: the annotations become free', () => {
    const before = spec(1, [], { layers: [layerC([button(), badge])] });
    const next = spec(2, [], {
      layers: [{ ...layerC([button(), badge]), id: 'screens', name: 'Telas' }],
    });
    const impact = specializationUpdateImpact(projectWith(before), next);
    expect(impact.comparable).toBe(true);
    expect(impact.breaking).toEqual([]);
    expect(impact.freedLayers.map((l) => l.spec?.layerId)).toEqual(['c']);
    expect(impact.additive).toBe(false);
  });

  it('covered break: full breaking, empty missingMigrations and the chain steps', () => {
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

  it('uncovered break: appears in missingMigrations, with message and path', () => {
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
      message: expect.stringContaining('declare a "remove-field"'),
    });
    expect(impact.breaking).toEqual(impact.missingMigrations);
    // the declared steps are reported even when they do not cover everything
    expect(impact.migrations).toHaveLength(1);
    expect(impact.addedLayers).toEqual([]);
    expect(impact.freedLayers).toEqual([]);
  });

  it('unavailable copy (spec: null): not comparable, everything empty, the rest intact', () => {
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

// ---------------------------------------------------------------------------------------
// Link roles (`childRoles`, formatVersion 11 and 12): stage #557
// ---------------------------------------------------------------------------------------

describe('diffSpecs: roles (childRoles)', () => {
  const role = (id: string, over: Record<string, string> = {}) => ({
    id,
    name: id.toUpperCase(),
    ...over,
  });

  /** Owner with the given roles (`undefined` = no `childRoles`). */
  function card(
    roles?: readonly string[],
    over: Partial<SpecAnnotationType> = {},
  ): SpecAnnotationType {
    return {
      id: 'card',
      name: 'Card',
      allowedChildren: ['badge'],
      fields: [],
      ...(roles === undefined ? {} : { childRoles: roles.map((r) => role(r)) }),
      ...over,
    };
  }

  const at = (version: number, types: SpecAnnotationType[]): Spec =>
    spec(version, types, { formatVersion: 12 });
  const CARD_PATH = 'layers[0].annotationTypes[0]';

  it('a role that leaves: removed-role at the path of the previous version, with role', () => {
    const changes = diffSpecs(
      at(1, [card(['a', 'b', 'c']), badge]),
      at(2, [card(['a', 'c']), badge]),
    );
    expect(plain(changes)).toEqual([
      {
        kind: 'breaking',
        code: 'removed-role',
        path: `${CARD_PATH}.childRoles[1]`,
        typeId: 'card',
        role: 'b',
        message:
          'the role "b" of the type "card" was removed; declare a "rename-role" or "remove-role" step in migrations (formatVersion 12)',
      },
    ]);
  });

  it('a type that loses all childRoles: one removed-role per role and no other', () => {
    const changes = diffSpecs(at(1, [card(['a', 'b']), badge]), at(2, [card(), badge]));
    expect(changes.map((c) => [c.kind, c.code, c.path, c.role])).toEqual([
      ['breaking', 'removed-role', `${CARD_PATH}.childRoles[0]`, 'a'],
      ['breaking', 'removed-role', `${CARD_PATH}.childRoles[1]`, 'b'],
    ]);
  });

  it('a type that starts to have childRoles: only roles-required, at the childRoles path of the new one', () => {
    const changes = diffSpecs(at(1, [card(), badge]), at(2, [card(['a', 'b']), badge]));
    expect(plain(changes)).toEqual([
      {
        kind: 'breaking',
        code: 'roles-required',
        path: `${CARD_PATH}.childRoles`,
        typeId: 'card',
        message:
          'the type "card" now has roles; declare a "set-role" step in migrations (formatVersion 12)',
      },
    ]);
  });

  it('a new role in a type that already had roles: additive added-role, with role', () => {
    const changes = diffSpecs(
      at(1, [card(['a']), badge]),
      at(2, [card(['a', 'b']), badge]),
    );
    expect(plain(changes)).toEqual([
      {
        kind: 'additive',
        code: 'added-role',
        path: `${CARD_PATH}.childRoles[1]`,
        typeId: 'card',
        role: 'b',
        message: 'the type "card" gained the role "b"',
      },
    ]);
    expect(
      missingMigrations(at(1, [card(['a']), badge]), at(2, [card(['a', 'b']), badge])),
    ).toEqual([]);
  });

  it('the same rules apply with both versions at formatVersion 11', () => {
    const v11 = (version: number, types: SpecAnnotationType[]): Spec =>
      spec(version, types, { formatVersion: 11 });
    expect(
      codes(diffSpecs(v11(1, [card(['a', 'b']), badge]), v11(2, [card(['a']), badge]))),
    ).toEqual(['breaking:removed-role']);
    expect(
      codes(diffSpecs(v11(1, [card(), badge]), v11(2, [card(['a']), badge]))),
    ).toEqual(['breaking:roles-required']);
  });

  it('name, description, order of the roles, childRolesLabel, allowedChildren and groups generate nothing', () => {
    const before = at(1, [
      card(['a', 'b'], {
        childRolesLabel: 'Papel',
        groups: ['g'],
      }),
      badge,
    ]);
    const next = at(2, [
      card(['b', 'a'], {
        childRolesLabel: 'Slot',
        allowedChildren: ['badge', { layer: 'outra' }],
        groups: ['h'],
        childRoles: [
          role('b', { name: 'Other name', description: 'new description' }),
          role('a', { description: 'd' }),
        ],
      }),
      badge,
    ]);
    expect(diffSpecs(before, next)).toEqual([]);
    expect(missingMigrations(before, next)).toEqual([]);
  });

  it('a renamed owner (different ids) is not compared: only removed-type and added-type', () => {
    const before = at(1, [card(['a', 'b']), badge]);
    const next = at(2, [{ ...card(['a', 'c']), id: 'panel', name: 'Panel' }, badge]);
    expect(diffSpecs(before, next).map((c) => [c.code, c.typeId, c.role])).toEqual([
      ['added-type', 'panel', undefined],
      ['removed-type', 'card', undefined],
    ]);
  });

  it('the order: added-role and roles-required after the new examples; removed-role after the removed fields and options', () => {
    const before = at(1, [
      card(['a', 'b'], {
        fields: [
          { key: 'gone', type: 'string' },
          { key: 'kind', type: 'enum', options: ['x', 'y'] },
        ],
      }),
      { id: 'panel', name: 'Panel', allowedChildren: ['badge'], fields: [] },
      badge,
    ]);
    const next = at(2, [
      card(['a', 'c'], {
        fields: [{ key: 'kind', type: 'enum', options: ['x', 'z'] }],
        examples: [{ name: 'ex', values: {} }],
      }),
      { ...card(['p']), id: 'panel', name: 'Panel' },
      badge,
    ]);
    expect(
      diffSpecs(before, next).map((c) => [
        c.code,
        c.typeId,
        c.role ?? c.fieldKey ?? c.option,
      ]),
    ).toEqual([
      ['added-option', 'card', 'kind'],
      ['added-example', 'card', undefined],
      ['added-role', 'card', 'c'],
      ['roles-required', 'panel', undefined],
      ['removed-field', 'card', 'gone'],
      ['removed-option', 'card', 'kind'],
      ['removed-role', 'card', 'b'],
    ]);
  });
});

describe('migrationFor and missingMigrations: roles', () => {
  const owner = (roles?: readonly string[]): SpecAnnotationType => ({
    id: 'card',
    name: 'Card',
    allowedChildren: ['badge'],
    fields: [],
    ...(roles === undefined
      ? {}
      : { childRoles: roles.map((id) => ({ id, name: id.toUpperCase() })) }),
  });
  const at = (version: number, roles?: readonly string[], extra: SpecMigration[] = []) =>
    spec(version, [owner(roles), badge], { formatVersion: 12, migrations: extra });
  const steps = (...list: SpecMigrationStep[]): SpecMigration[] => [
    { from: 1, to: 2, steps: list },
  ];

  const lost = at(1, ['a', 'b']);
  const lostNext = (list: SpecMigrationStep[] = []) => at(2, ['a'], steps(...list));
  const required = at(1);
  const requiredNext = (list: SpecMigrationStep[] = []) => at(2, ['a'], steps(...list));

  it('removed-role: rename-role{from} and remove-role{role} cover; without a step it is missing', () => {
    const [change] = missingMigrations(lost, lostNext());
    expect(change?.code).toBe('removed-role');
    expect(missingMigrations(lost, lostNext())).toHaveLength(1);
    const rename: SpecMigrationStep = {
      op: 'rename-role',
      type: 'card',
      from: 'b',
      to: 'a',
    };
    const remove: SpecMigrationStep = {
      op: 'remove-role',
      type: 'card',
      role: 'b',
      mode: 'clear',
    };
    for (const step of [rename, remove]) {
      const next = lostNext([step]);
      expect(missingMigrations(lost, next)).toEqual([]);
      expect(migrationFor(next, 1, change as SpecChange)).toEqual(step);
    }
    expect(missingMigrations(lost, lostNext([{ ...remove, mode: 'unlink' }]))).toEqual(
      [],
    );
  });

  it('removed-role: the type and the role must match; set-role does not cover', () => {
    const [change] = missingMigrations(lost, lostNext()) as [SpecChange];
    const wrong: SpecMigrationStep[] = [
      { op: 'rename-role', type: 'outro', from: 'b', to: 'a' },
      { op: 'rename-role', type: 'card', from: 'z', to: 'a' },
      { op: 'remove-role', type: 'outro', role: 'b', mode: 'clear' },
      { op: 'remove-role', type: 'card', role: 'z', mode: 'unlink' },
      { op: 'set-role', type: 'card', role: 'a' },
      { op: 'remove-field', type: 'card', field: 'b' },
    ];
    for (const step of wrong) {
      const next = lostNext([step]);
      expect(missingMigrations(lost, next), step.op).toEqual([change]);
      expect(migrationFor(next, 1, change)).toBeUndefined();
    }
  });

  it('roles-required: any set-role of the type covers (with or without childType)', () => {
    const [change] = missingMigrations(required, requiredNext()) as [SpecChange];
    expect(change.code).toBe('roles-required');
    for (const step of [
      { op: 'set-role', type: 'card', role: 'a' },
      { op: 'set-role', type: 'card', role: 'a', childType: 'badge' },
    ] satisfies SpecMigrationStep[]) {
      const next = requiredNext([step]);
      expect(missingMigrations(required, next)).toEqual([]);
      expect(migrationFor(next, 1, change)).toEqual(step);
    }
  });

  it('roles-required: set-role of another type, rename-role and remove-role do not cover', () => {
    const [change] = missingMigrations(required, requiredNext()) as [SpecChange];
    const wrong: SpecMigrationStep[] = [
      { op: 'set-role', type: 'outro', role: 'a' },
      { op: 'rename-role', type: 'card', from: 'x', to: 'a' },
      { op: 'remove-role', type: 'card', role: 'x', mode: 'clear' },
    ];
    for (const step of wrong) {
      const next = requiredNext([step]);
      expect(missingMigrations(required, next), step.op).toEqual([change]);
      expect(migrationFor(next, 1, change)).toBeUndefined();
    }
  });

  it('a broken chain leaves the role break uncovered', () => {
    const next = spec(3, [owner(['a']), badge], {
      formatVersion: 12,
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-role', type: 'card', role: 'b', mode: 'clear' }],
        },
      ],
    });
    expect(migrationChain(next, 1)).toBeUndefined();
    const missing = missingMigrations(lost, next);
    expect(missing.map((c) => c.code)).toEqual(['removed-role']);
    expect(migrationFor(next, 1, missing[0] as SpecChange)).toBeUndefined();
  });

  it('a chain of two entries: each covers a role break', () => {
    const v1 = at(1, ['a', 'b', 'c']);
    const next = spec(3, [owner(['a']), badge], {
      formatVersion: 12,
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-role', type: 'card', role: 'b', mode: 'clear' }],
        },
        {
          from: 2,
          to: 3,
          steps: [{ op: 'rename-role', type: 'card', from: 'c', to: 'a' }],
        },
      ],
    });
    expect(diffSpecs(v1, next).map((c) => c.role)).toEqual(['b', 'c']);
    expect(missingMigrations(v1, next)).toEqual([]);
  });
});
