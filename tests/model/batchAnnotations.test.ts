import { describe, expect, it } from 'vitest';
import {
  BatchRuleError,
  ModelError,
  createBatchAnnotation,
  createBatchArrow,
  projectIndex,
  tableRows,
  updateBatchAnnotation,
  type AnnotationResolver,
  type JsonValue,
  type Project,
  type RowAliasTarget,
} from '../../src/model';
import { FORMAT_SPEC_ID, formatProject } from './formatFixtures';

// The annotation and arrow rules of the MCP batch (`create_annotation`, `update_annotation`,
// `create_arrow`) live in `src/model/batchAnnotations.ts`: pure functions over the project and a resolver
// the caller provides. A broken rule throws a `BatchRuleError` (or a `ModelError`) with the batch's code
// and message. The fixture is the format project: markings M1–M5, typed annotations A1, A3 (a `table` with
// `ref` columns and a `ref` field), A4, A5 (on the arrow R1), a free one F1 on M5.

const CLASS = `${FORMAT_SPEC_ID}/class`;

/** A resolver over ids and a dictionary of row aliases; every lookup fails the way the batch's would. */
function resolver(
  rowAliases: Record<string, RowAliasTarget> = {},
  taken: readonly string[] = [],
): AnnotationResolver {
  return {
    marking: (ref) => ref,
    annotation: (ref, p) => {
      if (!projectIndex(p).annotations.has(ref)) {
        throw new BatchRuleError('not-found', `annotation not found: ${ref}`);
      }
      return ref;
    },
    layer: (ref, p) => {
      const layer = projectIndex(p).layers.get(ref);
      if (!layer) throw new BatchRuleError('not-found', `layer not found: ${ref}`);
      return layer;
    },
    type: (ref) => {
      const [specId, typeId] = ref.split('/');
      return { specId: specId!, typeId: typeId! };
    },
    rowAlias: (name) => {
      const target = rowAliases[name];
      if (!target) {
        throw new BatchRuleError('unknown-alias', `unknown alias: ${name}`);
      }
      return target;
    },
    aliasTaken: (name) => taken.includes(name),
    markingLabel: (_p, id) => id,
  };
}

function thrown(run: () => unknown): BatchRuleError | ModelError {
  try {
    run();
  } catch (error) {
    if (error instanceof BatchRuleError || error instanceof ModelError) return error;
    throw error;
  }
  throw new Error('expected the rule to throw');
}

function annotationOf(p: Project, id: string) {
  const a = projectIndex(p).annotations.get(id);
  if (!a) throw new Error(`no annotation ${id}`);
  return a;
}

describe('createBatchAnnotation', () => {
  it('adds a typed annotation on a marking, in the type’s layer, with values', () => {
    const p = formatProject();
    const made = createBatchAnnotation(resolver(), p, {
      marking: 'M2',
      type: CLASS,
      name: 'Order',
      values: { name: 'Order', version: 3 },
    });
    const a = annotationOf(made.project, made.annotationId);
    expect(a.markingId).toBe('M2');
    expect(a.name).toBe('Order');
    expect(a.type).toEqual({ specId: FORMAT_SPEC_ID, typeId: 'class' });
    expect(a.values?.name).toBe('Order');
    expect(a.values?.version).toBe(3);
    expect(projectIndex(made.project).layers.get(a.layerId)?.name).toBe('Classes');
    expect(made.ownerId).toBeNull();
    expect(projectIndex(p).annotations.has(made.annotationId)).toBe(false);
  });

  it('adds a typed annotation on an arrow', () => {
    const made = createBatchAnnotation(resolver(), formatProject(), {
      marking: 'R1',
      type: `${FORMAT_SPEC_ID}/flow`,
      values: { note: 'async' },
    });
    const a = annotationOf(made.project, made.annotationId);
    expect(a.markingId).toBe('R1');
    expect(a.values?.note).toBe('async');
  });

  it('adds a free-form annotation with pairs and an owner of the same marking', () => {
    const made = createBatchAnnotation(resolver(), formatProject(), {
      marking: 'M5',
      layer: 'L1',
      name: 'Remark',
      entries: [{ key: 'color', value: 'red' }],
      owner: 'N1',
    });
    const a = annotationOf(made.project, made.annotationId);
    expect(a.type).toBeNull();
    expect(a.entries.map((e) => [e.key, e.value])).toEqual([['color', 'red']]);
    expect(a.parentAnnotationId).toBe('N1');
    expect(made.ownerId).toBe('N1');
  });

  it('sets the rows of a table and defines the alias of each row (`_as`)', () => {
    const made = createBatchAnnotation(resolver(), formatProject(), {
      marking: 'M2',
      type: CLASS,
      values: {
        attributes: [
          { _as: '$first', name: 'id', type: 'String' },
          { _as: '$second', name: 'total', type: 'Number' },
        ],
      },
    });
    const rows = tableRows(
      annotationOf(made.project, made.annotationId).values?.attributes,
    );
    expect(rows.map((r) => r.name)).toEqual(['id', 'total']);
    expect(made.rowAliases.map(([name]) => name)).toEqual(['$first', '$second']);
    expect(made.rowAliases[0]![1]).toEqual({
      kind: 'row',
      annotationId: made.annotationId,
      key: 'attributes',
      rowId: rows[0]!._id,
    });
  });

  it('turns the `ref` field and the `ref` cells into the model’s references', () => {
    const made = createBatchAnnotation(resolver(), formatProject(), {
      marking: 'M2',
      type: CLASS,
      values: {
        attributes: [{ name: 'copy', type: 'String', of: { annotation: 'A3' } }],
        parent: { annotation: 'A4' },
      },
    });
    const a = annotationOf(made.project, made.annotationId);
    expect(a.values?.parent).toEqual({ annotationId: 'A4' });
    expect(tableRows(a.values?.attributes)[0]!.of).toEqual({ annotationId: 'A3' });
  });

  it('refuses a free-form annotation without a layer (`layer-required`)', () => {
    const error = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), { marking: 'M2' }),
    );
    expect(error).toBeInstanceOf(BatchRuleError);
    expect(error.code).toBe('layer-required');
    expect(error.message).toBe(
      'free-form annotation: provide `layer` (or `type` for a typed annotation)',
    );
  });

  it('refuses `entries` on a typed annotation and `values` on a free-form one', () => {
    expect(
      thrown(() =>
        createBatchAnnotation(resolver(), formatProject(), {
          marking: 'M2',
          type: CLASS,
          entries: [{ key: 'a', value: 'b' }],
        }),
      ).code,
    ).toBe('typed-annotation');
    expect(
      thrown(() =>
        createBatchAnnotation(resolver(), formatProject(), {
          marking: 'M2',
          layer: 'L1',
          values: { name: 'x' },
        }),
      ).code,
    ).toBe('not-typed');
  });

  it('refuses a malformed `ref` value (`invalid-ref-value`) and an unknown pair (`not-found`)', () => {
    const bad = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { parent: { key: 'name' } as unknown as JsonValue },
      }),
    );
    expect(bad.code).toBe('invalid-ref-value');
    expect(bad.message).toBe('field parent: "annotation" is missing');
    const missing = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { parent: { annotation: 'F1', entry: 'nothing' } },
      }),
    );
    expect(missing.code).toBe('not-found');
    expect(missing.message).toBe('field parent: the annotation has no pair "nothing"');
  });

  it('refuses a row alias that is taken or written wrong', () => {
    const taken = thrown(() =>
      createBatchAnnotation(resolver({}, ['$row']), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { attributes: [{ _as: '$row', name: 'x' }] },
      }),
    );
    expect(taken.code).toBe('duplicate-alias');
    expect(taken.message).toBe('alias repeated in the batch: $row');
    const twice = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: {
          attributes: [
            { _as: '$row', name: 'x' },
            { _as: '$row', name: 'y' },
          ],
        },
      }),
    );
    expect(twice.code).toBe('duplicate-alias');
    const malformed = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { attributes: [{ _as: 'row', name: 'x' }] },
      }),
    );
    expect(malformed.code).toBe('invalid-alias');
    expect(malformed.message).toBe('field attributes: "_as" is an alias like "$row"');
  });

  it('refuses a table that is not a list of objects (`invalid-value`)', () => {
    const notList = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { attributes: 'x' },
      }),
    );
    expect(notList.code).toBe('invalid-value');
    expect(notList.message).toBe('field attributes: a table is a list of rows');
    const notRow = thrown(() =>
      createBatchAnnotation(resolver(), formatProject(), {
        marking: 'M2',
        type: CLASS,
        values: { attributes: ['x'] },
      }),
    );
    expect(notRow.message).toBe('field attributes: row 0 is not an object');
  });
});

describe('updateBatchAnnotation', () => {
  it('changes a value and reports it', () => {
    const made = updateBatchAnnotation(resolver(), formatProject(), {
      annotation: 'A3',
      values: { name: 'Customer' },
    });
    expect(annotationOf(made.project, 'A3').values?.name).toBe('Customer');
    expect(made.changes).toEqual(['fields name']);
  });

  it('replaces the rows of a table, keeping a row by its `_id` and aliasing a new one', () => {
    const made = updateBatchAnnotation(resolver(), formatProject(), {
      annotation: 'A3',
      values: {
        attributes: [
          { _id: 'R2', name: 'id', type: 'UUID' },
          { _as: '$added', name: 'created', type: 'Date' },
        ],
      },
    });
    const rows = tableRows(annotationOf(made.project, 'A3').values?.attributes);
    expect(rows.map((r) => [r._id, r.name])).toEqual([
      ['R2', 'id'],
      [rows[1]!._id, 'created'],
    ]);
    expect(rows[1]!._id).not.toBe('R1');
    expect(made.rowAliases.map(([name]) => name)).toEqual(['$added']);
  });

  it('refuses a row `_id` the table does not have', () => {
    const error = thrown(() =>
      updateBatchAnnotation(resolver(), formatProject(), {
        annotation: 'A3',
        values: { attributes: [{ _id: 'R9', name: 'x' }] },
      }),
    );
    expect(error.code).toBe('not-found');
    expect(error.message).toBe('field attributes: row R9 does not exist');
  });

  it('refuses a row alias that belongs to another table in a `ref` value', () => {
    const alias: RowAliasTarget = {
      kind: 'row',
      annotationId: 'A1',
      key: 'attributes',
      rowId: 'R1',
    };
    const error = thrown(() =>
      updateBatchAnnotation(resolver({ $r: alias }), formatProject(), {
        annotation: 'A3',
        values: { parent: { annotation: 'A3', key: 'attributes', row: '$r' } },
      }),
    );
    expect(error.code).toBe('invalid-ref-value');
    expect(error.message).toBe('field parent: row $r belongs to another table');
  });

  it('changes the owner and removes it with `null`', () => {
    const moved = updateBatchAnnotation(resolver(), formatProject(), {
      annotation: 'F1',
      owner: 'N1',
    });
    expect(annotationOf(moved.project, 'F1').parentAnnotationId).toBe('N1');
    expect(moved.changes[0]).toMatch(/^owner /);
    const freed = updateBatchAnnotation(resolver(), moved.project, {
      annotation: 'F1',
      owner: null,
    });
    expect(annotationOf(freed.project, 'F1').parentAnnotationId).toBeNull();
    expect(freed.changes).toEqual(['no owner']);
  });

  it('changes the name and the pairs of a free-form annotation', () => {
    const made = updateBatchAnnotation(resolver(), formatProject(), {
      annotation: 'F2',
      name: 'Renamed',
      entries: [{ key: 'k', value: 'v' }],
    });
    const a = annotationOf(made.project, 'F2');
    expect(a.name).toBe('Renamed');
    expect(a.entries.map((e) => e.key)).toEqual(['k']);
    expect(made.changes).toEqual(['name "Renamed"', '1 pair(s)']);
  });

  it('refuses an unknown annotation with the resolver’s error', () => {
    const error = thrown(() =>
      updateBatchAnnotation(resolver(), formatProject(), { annotation: 'A99' }),
    );
    expect(error.code).toBe('not-found');
    expect(error.message).toBe('annotation not found: A99');
  });
});

describe('createBatchArrow', () => {
  it('creates an arrow between two markings, with a style and a name', () => {
    const made = createBatchArrow(resolver(), formatProject(), {
      from: 'M2',
      to: 'M4',
      name: 'calls',
    });
    expect(made.from).toBe('M2');
    expect(made.to).toBe('M4');
    const arrow = projectIndex(made.project).arrows.get(made.id);
    expect(arrow?.name).toBe('calls');
    expect(arrow?.from).toBe('M2');
    expect(arrow?.to).toBe('M4');
  });

  it('refuses `points`: the route belongs to the person', () => {
    const error = thrown(() =>
      createBatchArrow(resolver(), formatProject(), {
        from: 'M2',
        to: 'M4',
        points: [[0, 0]],
      }),
    );
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      "`points` is not accepted: the arrow's route belongs to the person (the server only provides the endpoints and the style)",
    );
  });
});
