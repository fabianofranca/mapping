import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOG,
  applyFormatResult,
  approximateMeasurer,
  projectIndex,
  tableRows,
  type AppliedItem,
  type ComponentCatalog,
  type FormatApplyOutcome,
  type FormatOperation,
  type Project,
} from '../../src/model';
import { slotsLibrary, slotsProject } from '../mcp/slotsProject';
import { FORMAT_SPEC_ID, formatProject } from './formatFixtures';

// `applyFormatResult` (stage #2035, AF2): the six operations of a plugin result that `checkFormatResult`
// already accepted, applied through the same rules as the MCP batch, with the result's local aliases and
// the references of the plugin's input. All or nothing: the new project and what was created and changed,
// or the first operation that broke a rule, at its index.

function apply(
  project: Project,
  operations: FormatOperation[],
  options: { name?: string; catalog?: ComponentCatalog; warnings?: string[] } = {},
): FormatApplyOutcome {
  return applyFormatResult(
    project,
    { operations, ...(options.warnings ? { warnings: options.warnings } : {}) },
    {
      input: { project: { name: options.name ?? 'Demo' } },
      catalog: options.catalog ?? EMPTY_CATALOG,
      measure: approximateMeasurer,
    },
  );
}

function success(outcome: FormatApplyOutcome) {
  if (!outcome.ok) throw new Error(`expected success: ${JSON.stringify(outcome.error)}`);
  return outcome;
}

function failure(outcome: FormatApplyOutcome) {
  if (outcome.ok) throw new Error('expected an error');
  return outcome.error;
}

function kinds(items: readonly AppliedItem[]): string {
  return items.map((i) => i.kind).join('');
}

const op = (
  name: FormatOperation['op'],
  rest: Record<string, unknown>,
): FormatOperation => ({
  op: name,
  ...rest,
});

describe('applyFormatResult: creating', () => {
  it('creates a container, component markings (a slot child and an anchored one), annotations and an arrow', () => {
    const { catalog } = slotsLibrary();
    const base = slotsProject(() => undefined);
    const done = success(
      apply(
        base,
        [
          op('add_container', {
            as: '$screen',
            name: 'Home',
            width: 800,
            height: 600,
            background: '#FFFFFF',
          }),
          op('create_marking', {
            as: '$bar',
            container: '$screen',
            rect: { x: 100, y: 100, width: 360, height: 56 },
            annotation: { type: 'slots/bar' },
          }),
          op('create_marking', {
            as: '$pin',
            inside: '$bar',
            slot: 'actions',
            annotation: { type: 'slots/pin' },
          }),
          op('create_marking', {
            as: '$next',
            container: '$screen',
            anchor: { to: '$bar', side: 'end' },
            annotation: { type: 'slots/pin' },
          }),
          op('create_annotation', {
            as: '$remark',
            marking: '$bar',
            layer: 'Layer 1',
            name: 'Remark',
            entries: [{ key: 'color', value: 'red' }],
          }),
          op('create_arrow', { as: '$flow', from: '$bar', to: '$next', name: 'then' }),
        ],
        { name: 'Slots', catalog },
      ),
    );
    // container; bar + its annotation; pin + its annotation; next + its annotation; remark; the arrow
    expect(kinds(done.created)).toBe('imamamaam');
    expect(done.updated).toEqual([]);
    const index = projectIndex(done.project);
    const [container, bar, , pin, , next, , remark, arrow] = done.created;
    expect(index.containers.get(container!.id)?.name).toBe('Home');
    expect(index.markings.get(pin!.id)?.parentId).toBe(bar!.id);
    expect(index.markings.get(next!.id)?.anchor).toMatchObject({
      to: bar!.id,
      side: 'end',
    });
    expect(index.annotations.get(remark!.id)?.markingId).toBe(bar!.id);
    const made = index.arrows.get(arrow!.id);
    expect(made).toMatchObject({ from: bar!.id, to: next!.id, name: 'then' });
    // The input project is left as it was.
    expect(projectIndex(base).containers.has(container!.id)).toBe(false);
  });

  it('creates a typed annotation with a table whose rows a later operation reaches by the alias', () => {
    const done = success(
      apply(formatProject(), [
        op('create_annotation', {
          as: '$order',
          marking: 'mapping://Demo/m/m2',
          type: `${FORMAT_SPEC_ID}/class`,
          name: 'Order',
          values: {
            name: 'Order',
            parent: { annotation: 'mapping://Demo/a/a4' },
            attributes: [{ _as: '$total', name: 'total', type: 'Number' }],
          },
        }),
        op('update_annotation', {
          annotation: '$order',
          values: { attributes: [{ name: 'again', type: 'String' }] },
        }),
      ]),
    );
    const order = done.created[0]!;
    const annotation = projectIndex(done.project).annotations.get(order.id)!;
    expect(annotation.values?.parent).toEqual({ annotationId: 'A4' });
    expect(tableRows(annotation.values?.attributes).map((r) => r.name)).toEqual([
      'again',
    ]);
    // created and then changed by the result: not an update of an existing item
    expect(done.updated).toEqual([]);
  });
});

describe('applyFormatResult: updating', () => {
  it('updates by the input’s reference and by code, and reports each existing item once', () => {
    const done = success(
      apply(formatProject(), [
        op('update_marking', { marking: 'mapping://Demo/m/m2', name: 'Renamed' }),
        op('update_annotation', { annotation: 'a3', values: { name: 'Customer' } }),
        op('update_marking', { marking: 'm2', name: 'Renamed twice' }),
      ]),
    );
    const index = projectIndex(done.project);
    expect(index.markings.get('M2')?.name).toBe('Renamed twice');
    expect(index.annotations.get('A3')?.values?.name).toBe('Customer');
    expect(done.created).toEqual([]);
    expect(done.updated).toEqual([
      { kind: 'm', id: 'M2' },
      { kind: 'a', id: 'A3' },
    ]);
  });

  it('keeps the rows of a table the result names by `_id` and drops the others', () => {
    const done = success(
      apply(formatProject(), [
        op('update_annotation', {
          annotation: 'a3',
          values: { attributes: [{ _id: 'R2', name: 'id', type: 'UUID' }] },
        }),
      ]),
    );
    const rows = tableRows(
      projectIndex(done.project).annotations.get('A3')?.values?.attributes,
    );
    expect(rows.map((r) => [r._id, r.type])).toEqual([['R2', 'UUID']]);
  });
});

describe('applyFormatResult: refusals', () => {
  it('an alias cited before it exists is an `unknown-alias` at that operation', () => {
    const error = failure(
      apply(formatProject(), [
        op('create_arrow', { from: '$ghost', to: 'mapping://Demo/m/m4' }),
      ]),
    );
    expect(error).toMatchObject({ index: 0, op: 'create_arrow', code: 'unknown-alias' });
    expect(error.message).toBe(
      'unknown alias: $ghost (create the item with "as" in an earlier operation)',
    );
  });

  it('an alias of another kind is `wrong-kind`', () => {
    const error = failure(
      apply(formatProject(), [
        op('add_container', { as: '$c', width: 100, height: 100, background: '#FFFFFF' }),
        op('create_arrow', { from: '$c', to: 'mapping://Demo/m/m4' }),
      ]),
    );
    expect(error).toMatchObject({ index: 1, code: 'wrong-kind' });
  });

  it('an unknown reference is `not-found`; another project’s is `project-mismatch`', () => {
    const missing = failure(
      apply(formatProject(), [
        op('update_marking', { marking: 'mapping://Demo/m/zz99', name: 'x' }),
      ]),
    );
    expect(missing).toMatchObject({ index: 0, code: 'not-found' });
    const other = failure(
      apply(formatProject(), [
        op('update_marking', { marking: 'mapping://Else/m/m2', name: 'x' }),
      ]),
    );
    expect(other).toMatchObject({ index: 0, code: 'project-mismatch' });
  });

  it('a rule broken at `operations[3]` gives the error there and leaves the project untouched', () => {
    const project = formatProject();
    const before = JSON.stringify(project);
    const outcome = apply(project, [
      op('add_container', {
        as: '$c',
        name: 'Fresh',
        width: 100,
        height: 100,
        background: '#FFFFFF',
      }),
      op('update_marking', { marking: 'm2', name: 'Changed' }),
      op('create_annotation', {
        as: '$a',
        marking: 'm2',
        type: `${FORMAT_SPEC_ID}/class`,
        values: { name: 'Ok' },
      }),
      op('create_annotation', { marking: 'm2' }),
      op('update_marking', { marking: 'm3', name: 'Never reached' }),
    ]);
    const error = failure(outcome);
    expect(error).toMatchObject({
      index: 3,
      op: 'create_annotation',
      code: 'layer-required',
      message: 'free-form annotation: provide `layer` (or `type` for a typed annotation)',
    });
    expect(outcome).not.toHaveProperty('project');
    expect(JSON.stringify(project)).toBe(before);
  });

  it('a result alias used twice is `duplicate-alias`', () => {
    const error = failure(
      apply(formatProject(), [
        op('add_container', { as: '$c', width: 100, height: 100, background: '#FFFFFF' }),
        op('add_container', { as: '$c', width: 100, height: 100, background: '#FFFFFF' }),
      ]),
    );
    expect(error).toMatchObject({ index: 1, code: 'duplicate-alias' });
    expect(error.message).toBe('alias repeated in the plugin result: $c');
  });

  it('the route of an arrow is refused (`invalid-arguments`)', () => {
    const error = failure(
      apply(formatProject(), [
        op('create_arrow', {
          from: 'm1',
          to: 'm4',
          points: [[0, 0]],
        }),
      ]),
    );
    expect(error).toMatchObject({ index: 0, code: 'invalid-arguments' });
  });

  it('a model rule (`ModelError`) keeps its code and carries the thrown error', () => {
    const error = failure(
      apply(formatProject(), [
        op('create_annotation', {
          marking: 'm2',
          type: `${FORMAT_SPEC_ID}/class`,
          values: { nothing: 1 },
        }),
      ]),
    );
    expect(error.index).toBe(0);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.code).not.toBe('plugin-output-invalid');
  });

  it('a value of the wrong type that trips a rule is `plugin-output-invalid` at its operation', () => {
    const error = failure(
      apply(formatProject(), [
        op('add_container', {
          name: 'ok',
          width: 100,
          height: 100,
          background: '#FFFFFF',
        }),
        op('create_annotation', { marking: 'm2', layer: 'L1', entries: 'not a list' }),
      ]),
    );
    expect(error.index).toBe(1);
    expect(error.code).toBe('plugin-output-invalid');
    expect(error.message.startsWith('operations[1].entries: ')).toBe(true);
    expect(error.details).toEqual({ path: 'operations[1].entries' });
  });
});

// The types of the values (stage #2035, AF4): a result comes from a plugin, so a wrong type is
// refused at its path before any rule reads it (a text where a number goes would otherwise be taken
// as truthy or coerced), all or nothing, with the project untouched.
describe('applyFormatResult: the types of the values', () => {
  const wrong: [string, FormatOperation, string][] = [
    [
      'a fractional rect side',
      op('create_marking', {
        container: 'c1',
        rect: { x: 1.5, y: 0, width: 20, height: 20 },
      }),
      'operations[0].rect.x',
    ],
    [
      'a text size',
      op('add_container', { width: '100', height: 100, background: '#FFFFFF' }),
      'operations[0].width',
    ],
    [
      'a size out of the range',
      op('add_container', { width: 20001, height: 100, background: '#FFFFFF' }),
      'operations[0].width',
    ],
    [
      'a text for a flag',
      op('update_marking', { marking: 'm2', locked: 'yes' }),
      'operations[0].locked',
    ],
    [
      'a number for a name',
      op('update_marking', { marking: 'm2', name: 5 }),
      'operations[0].name',
    ],
    [
      'a fractional move',
      op('update_marking', { marking: 'm2', move: { dx: 1.5, dy: 0 } }),
      'operations[0].move.dx',
    ],
    [
      'an unknown anchor side',
      op('update_marking', { marking: 'm2', anchor: { to: 'm3', side: 'sideways' } }),
      'operations[0].anchor.side',
    ],
    [
      'a list where the values go',
      op('create_annotation', { marking: 'm2', layer: 'L1', values: [1] }),
      'operations[0].values',
    ],
    [
      'an entry without a value',
      op('create_annotation', { marking: 'm2', layer: 'L1', entries: [{ key: 'k' }] }),
      'operations[0].entries[0].value',
    ],
    [
      'a number for an owner',
      op('update_annotation', { annotation: 'a3', owner: 3 }),
      'operations[0].owner',
    ],
    [
      'an unknown arrow style',
      op('create_arrow', { from: 'm1', to: 'm4', style: 'wavy' }),
      'operations[0].style',
    ],
    [
      'a number for an end',
      op('create_arrow', { from: 'm1', to: 4 }),
      'operations[0].to',
    ],
    [
      'a text for a source',
      op('create_marking', {
        container: 'c1',
        rect: { x: 0, y: 0, width: 20, height: 20 },
        source: 'figma',
      }),
      'operations[0].source',
    ],
  ];

  it.each(wrong)('refuses %s at its path', (_label, operation, path) => {
    const base = formatProject();
    const error = failure(apply(base, [operation]));
    expect(error.index).toBe(0);
    expect(error.code).toBe('plugin-output-invalid');
    expect(error.details).toEqual({ path });
    expect(error.message.startsWith(`${path}: `)).toBe(true);
  });

  it('names the operation that has the wrong type and leaves the project as it was', () => {
    const base = formatProject();
    const error = failure(
      apply(base, [
        op('update_marking', { marking: 'm2', name: 'fine' }),
        op('update_marking', { marking: 'm2', locked: 'yes' }),
      ]),
    );
    expect(error.index).toBe(1);
    expect(error.op).toBe('update_marking');
    expect(error.details).toEqual({ path: 'operations[1].locked' });
  });

  it('checks the types before the rules: a bad type wins over an unknown reference', () => {
    const error = failure(
      apply(formatProject(), [op('update_marking', { marking: 'nope', locked: 'yes' })]),
    );
    expect(error.code).toBe('plugin-output-invalid');
  });

  it('accepts null where the MCP does (a name, a source, an anchor, an owner, a role) and the plain values', () => {
    const done = success(
      apply(formatProject(), [
        op('update_marking', { marking: 'm2', name: null, source: null, anchor: null }),
        op('update_annotation', {
          annotation: 'f2',
          owner: null,
          role: null,
          entries: [{ key: 'k', value: 'v' }],
        }),
        op('create_arrow', { from: 'm1', to: 'm4', style: 'elbow', name: 'x' }),
        op('add_container', {
          width: 120,
          height: 80,
          background: '#FFFFFF',
          density: 2,
          direction: 'rtl',
          drawingMode: null,
          center: { x: 10, y: -5 },
          source: { system: 'figma', id: '1:2', url: null },
        }),
      ]),
    );
    expect(done.created.length).toBeGreaterThan(0);
  });
});

describe('applyFormatResult: a drawingMode text in add_container', () => {
  const withAxes = (): Project =>
    ({
      ...formatProject(),
      specializations: [{ spec: { tokens: { axes: { theme: ['light', 'dark'] } } } }],
    }) as unknown as Project;

  const pinned = (project: Project, drawingMode: unknown) => {
    const done = success(
      apply(project, [
        op('add_container', {
          width: 10,
          height: 10,
          background: '#FFFFFF',
          drawingMode,
        }),
      ]),
    );
    const id = done.created.find((c) => c.kind === 'i')?.id;
    return done.project.containers.find((c) => c.id === id)?.drawingMode;
  };

  it('sets the entry on every declared axis that has it, like the MCP does', () => {
    expect(pinned(withAxes(), 'dark')).toEqual({ theme: 'dark' });
  });

  it('keeps { mode: s } when no declared axis has the entry', () => {
    expect(pinned(withAxes(), 'sepia')).toEqual({ mode: 'sepia' });
  });

  it('a map is pinned as it is', () => {
    expect(pinned(withAxes(), { theme: 'dark' })).toEqual({ theme: 'dark' });
  });
});

describe('applyFormatResult: what comes back', () => {
  it('returns the plugin’s warnings as the result carried them', () => {
    const done = success(
      apply(formatProject(), [op('update_marking', { marking: 'm2', name: 'x' })], {
        warnings: ['line 4 skipped', 'unknown key "extra"'],
      }),
    );
    expect(done.warnings).toEqual(['line 4 skipped', 'unknown key "extra"']);
  });

  it('returns no warnings for a result without them, and the notes of the rules', () => {
    const done = success(
      apply(formatProject(), [op('update_marking', { marking: 'm2', name: 'x' })]),
    );
    expect(done.warnings).toEqual([]);
    expect(done.notes).toEqual([]);
    expect(done.rolesCleared).toEqual([]);
  });

  it('an empty result gives the same project', () => {
    const project = formatProject();
    const done = success(apply(project, []));
    expect(done.project).toBe(project);
    expect(done.created).toEqual([]);
    expect(done.updated).toEqual([]);
  });
});
