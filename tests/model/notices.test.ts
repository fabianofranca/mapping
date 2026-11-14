// Specialization notices (v10): severity, order and which annotations each notice affects (AV1).
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  highestNotice,
  NOTICE_KINDS,
  noticeUsage,
  parseSpec,
  placedTypeNotices,
  setFieldValue,
  setTableCell,
  sortNotices,
  typeNotices,
  type Project,
  type Spec,
  type SpecAnnotationType,
  type SpecNotice,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

const n = (kind: SpecNotice['kind'], message: string = kind): SpecNotice => ({
  kind,
  message,
});

describe('severity and order', () => {
  it('the display order is removed, deprecated, diverges, pending', () => {
    expect(NOTICE_KINDS).toEqual(['removed', 'deprecated', 'diverges', 'pending']);
  });

  it('sortNotices sorts by kind and keeps the file order within the kind', () => {
    const list = [
      n('pending', 'p1'),
      n('diverges', 'd1'),
      n('removed', 'r1'),
      n('deprecated', 'e1'),
      n('pending', 'p2'),
      n('removed', 'r2'),
    ];
    expect(sortNotices(list).map((x) => x.message)).toEqual([
      'r1',
      'r2',
      'e1',
      'd1',
      'p1',
      'p2',
    ]);
    expect(list[0]?.message).toBe('p1');
  });
});

function fieldType(): SpecAnnotationType {
  return {
    id: 't',
    name: 'T',
    fields: [],
  };
}

describe('highestNotice', () => {
  it('no notices, null', () => {
    expect(highestNotice(fieldType())).toBeNull();
    expect(highestNotice({ ...fieldType(), notices: [] })).toBeNull();
  });

  it('counts the type, the fields and the columns', () => {
    const type: SpecAnnotationType = {
      ...fieldType(),
      notices: [n('pending', 'type')],
      fields: [
        { key: 'a', type: 'string', notices: [n('diverges', 'field')] },
        {
          key: 'tab',
          type: 'table',
          columns: [{ key: 'c', type: 'string', notices: [n('removed', 'column')] }],
        },
      ],
    };
    expect(highestNotice(type)).toMatchObject({ kind: 'removed', message: 'column' });
  });

  it('tie between deprecated and diverges: deprecated; within the kind, the file order', () => {
    const tie: SpecAnnotationType = {
      ...fieldType(),
      notices: [n('diverges', 'type')],
      fields: [{ key: 'a', type: 'string', notices: [n('deprecated', 'field')] }],
    };
    expect(highestNotice(tie)).toMatchObject({ kind: 'deprecated', message: 'field' });
    const sameKind: SpecAnnotationType = {
      ...fieldType(),
      fields: [
        { key: 'a', type: 'string', notices: [n('pending', 'field')] },
        {
          key: 'tab',
          type: 'table',
          columns: [{ key: 'c', type: 'string', notices: [n('pending', 'column')] }],
        },
      ],
      notices: [n('pending', 'type')],
    };
    expect(highestNotice(sameKind)?.message).toBe('type');
    expect(highestNotice({ ...sameKind, notices: undefined })?.message).toBe('field');
  });
});

function specOf(): Spec {
  const result = parseSpec({
    format: 'mapping-spec',
    formatVersion: 10,
    id: 'lib',
    name: 'Lib',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            notices: [
              { kind: 'deprecated', message: 'use Button2', since: '2026-05-01' },
            ],
            fields: [
              {
                key: 'label',
                type: 'string',
                notices: [{ kind: 'pending', message: 'label diverges', ref: 'X-1' }],
              },
              {
                key: 'rows',
                type: 'table',
                columns: [
                  {
                    key: 'a',
                    type: 'string',
                    notices: [{ kind: 'removed', message: 'column removed' }],
                  },
                  { key: 'b', type: 'string' },
                ],
              },
            ],
          },
          { id: 'card', name: 'Card', fields: [{ key: 'title', type: 'string' }] },
        ],
      },
      {
        id: 'ev',
        name: 'Events',
        color: '#43A047',
        annotationTypes: [
          {
            id: 'click',
            name: 'Click',
            fields: [{ key: 'x', type: 'string' }],
            notices: [{ kind: 'diverges', message: 'behavior differs' }],
          },
        ],
      },
    ],
  });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

/** B1: empty button; B2: filled label; B3: table with a row with `a`; B4: row with only `b`; C1: card; F1: free. */
function project(): Project {
  let p = applySpecialization(emptyProject(), specOf(), { newId: idGen('LS') });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  const ui = layerOf(p, 'lib', 'ui');
  const add = (id: string, typeId: string, x: number): void => {
    p = createMarking(p, {
      id: `M${id}`,
      containerId: 'I1',
      rect: { x, y: 0, width: 50, height: 50 },
      name: id,
    });
    p = addTypedAnnotation(p, {
      id,
      markingId: `M${id}`,
      layerId: ui,
      type: { specId: 'lib', typeId },
    });
  };
  add('B1', 'button', 0);
  add('B2', 'button', 100);
  add('B3', 'button', 200);
  add('B4', 'button', 300);
  add('C1', 'card', 400);
  p = setFieldValue(p, 'B2', 'label', 'Oi');
  p = setFieldValue(p, 'C1', 'title', 'Card');
  p = addTableRow(p, 'B3', 'rows', 'r1');
  p = setTableCell(p, 'B3', 'rows', 'r1', 'a', 'value');
  p = addTableRow(p, 'B4', 'rows', 'r2');
  p = setTableCell(p, 'B4', 'rows', 'r2', 'b', 'other');
  return p;
}

describe('noticeUsage', () => {
  it('lists the notices in specialization order and the annotations affected by scope', () => {
    const usage = noticeUsage(project());
    expect(
      usage.map((u) => [
        u.scope,
        u.typeId,
        u.key,
        u.column,
        u.notice.kind,
        u.annotationIds,
      ]),
    ).toEqual([
      ['type', 'button', undefined, undefined, 'deprecated', ['B1', 'B2', 'B3', 'B4']],
      ['field', 'button', 'label', undefined, 'pending', ['B2']],
      ['column', 'button', 'rows', 'a', 'removed', ['B3']],
      ['type', 'click', undefined, undefined, 'diverges', []],
    ]);
  });

  it('brings specialization, layer and the whole notice', () => {
    const [first] = noticeUsage(project());
    expect(first).toMatchObject({
      specId: 'lib',
      layerId: 'ui',
      typeId: 'button',
      scope: 'type',
      notice: { kind: 'deprecated', message: 'use Button2', since: '2026-05-01' },
    });
  });

  it('a free annotation and one of another type are left out; an empty field does not count', () => {
    const usage = noticeUsage(project());
    const all = usage.flatMap((u) => u.annotationIds);
    expect(all).not.toContain('C1');
    const label = usage.find((u) => u.scope === 'field');
    expect(label?.annotationIds).toEqual(['B2']);
  });

  it('is memoized by the project version', () => {
    const p = project();
    expect(noticeUsage(p)).toBe(noticeUsage(p));
    const other = setFieldValue(p, 'B1', 'label', 'Novo');
    expect(noticeUsage(other)).not.toBe(noticeUsage(p));
    expect(noticeUsage(other).find((u) => u.scope === 'field')?.annotationIds).toEqual([
      'B1',
      'B2',
    ]);
  });

  it('a project without a specialization has no notices', () => {
    expect(noticeUsage(emptyProject())).toEqual([]);
  });
});

describe('placedTypeNotices', () => {
  const type: SpecAnnotationType = {
    id: 't',
    name: 'T',
    fields: [
      { key: 'a', type: 'string', notices: [n('pending', 'a1'), n('removed', 'a2')] },
      {
        key: 'items',
        type: 'table',
        columns: [{ key: 'label', type: 'string', notices: [n('diverges', 'c1')] }],
      },
      { key: 'b', type: 'string', notices: [n('deprecated', 'b1')] },
    ],
    notices: [n('diverges', 't1')],
  } as unknown as SpecAnnotationType;

  it('returns the place of each notice, in typeNotices order (type, fields, columns)', () => {
    const placed = placedTypeNotices(type);
    expect(placed.map((p) => [p.scope, p.key, p.column, p.notice.message])).toEqual([
      ['type', undefined, undefined, 't1'],
      ['field', 'a', undefined, 'a1'],
      ['field', 'a', undefined, 'a2'],
      ['field', 'b', undefined, 'b1'],
      ['column', 'items', 'label', 'c1'],
    ]);
    expect(placed.map((p) => p.notice)).toEqual(typeNotices(type));
  });

  it('a type with no notice returns an empty list', () => {
    expect(placedTypeNotices({ id: 't', name: 'T', fields: [] } as never)).toEqual([]);
  });
});
