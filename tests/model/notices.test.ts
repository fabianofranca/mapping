// Avisos da especialização (v10): gravidade, ordem e que anotações cada aviso afeta (AV1).
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

describe('gravidade e ordem', () => {
  it('a ordem de exibição é removed, deprecated, diverges, pending', () => {
    expect(NOTICE_KINDS).toEqual(['removed', 'deprecated', 'diverges', 'pending']);
  });

  it('sortNotices ordena por kind e mantém a ordem do arquivo dentro do kind', () => {
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
  it('sem avisos, null', () => {
    expect(highestNotice(fieldType())).toBeNull();
    expect(highestNotice({ ...fieldType(), notices: [] })).toBeNull();
  });

  it('conta o tipo, os campos e as colunas', () => {
    const type: SpecAnnotationType = {
      ...fieldType(),
      notices: [n('pending', 'tipo')],
      fields: [
        { key: 'a', type: 'string', notices: [n('diverges', 'campo')] },
        {
          key: 'tab',
          type: 'table',
          columns: [{ key: 'c', type: 'string', notices: [n('removed', 'coluna')] }],
        },
      ],
    };
    expect(highestNotice(type)).toMatchObject({ kind: 'removed', message: 'coluna' });
  });

  it('empate entre deprecated e diverges: deprecated; dentro do kind, a ordem do arquivo', () => {
    const tie: SpecAnnotationType = {
      ...fieldType(),
      notices: [n('diverges', 'tipo')],
      fields: [{ key: 'a', type: 'string', notices: [n('deprecated', 'campo')] }],
    };
    expect(highestNotice(tie)).toMatchObject({ kind: 'deprecated', message: 'campo' });
    const sameKind: SpecAnnotationType = {
      ...fieldType(),
      fields: [
        { key: 'a', type: 'string', notices: [n('pending', 'campo')] },
        {
          key: 'tab',
          type: 'table',
          columns: [{ key: 'c', type: 'string', notices: [n('pending', 'coluna')] }],
        },
      ],
      notices: [n('pending', 'tipo')],
    };
    expect(highestNotice(sameKind)?.message).toBe('tipo');
    expect(highestNotice({ ...sameKind, notices: undefined })?.message).toBe('campo');
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
            notices: [{ kind: 'deprecated', message: 'use Botão2', since: '2026-05-01' }],
            fields: [
              {
                key: 'label',
                type: 'string',
                notices: [{ kind: 'pending', message: 'rótulo diverge', ref: 'X-1' }],
              },
              {
                key: 'rows',
                type: 'table',
                columns: [
                  {
                    key: 'a',
                    type: 'string',
                    notices: [{ kind: 'removed', message: 'coluna saiu' }],
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
        name: 'Eventos',
        color: '#43A047',
        annotationTypes: [
          {
            id: 'click',
            name: 'Click',
            fields: [{ key: 'x', type: 'string' }],
            notices: [{ kind: 'diverges', message: 'comportamento difere' }],
          },
        ],
      },
    ],
  });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

/** B1: botão vazio; B2: label preenchido; B3: tabela com linha com `a`; B4: linha só com `b`; C1: card; F1: livre. */
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
  p = setFieldValue(p, 'C1', 'title', 'Cartão');
  p = addTableRow(p, 'B3', 'rows', 'r1');
  p = setTableCell(p, 'B3', 'rows', 'r1', 'a', 'valor');
  p = addTableRow(p, 'B4', 'rows', 'r2');
  p = setTableCell(p, 'B4', 'rows', 'r2', 'b', 'outro');
  return p;
}

describe('noticeUsage', () => {
  it('lista os avisos na ordem da especialização e as anotações afetadas por escopo', () => {
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

  it('traz especialização, camada e o aviso inteiro', () => {
    const [first] = noticeUsage(project());
    expect(first).toMatchObject({
      specId: 'lib',
      layerId: 'ui',
      typeId: 'button',
      scope: 'type',
      notice: { kind: 'deprecated', message: 'use Botão2', since: '2026-05-01' },
    });
  });

  it('anotação livre e de outro tipo ficam fora; campo vazio não conta', () => {
    const usage = noticeUsage(project());
    const all = usage.flatMap((u) => u.annotationIds);
    expect(all).not.toContain('C1');
    const label = usage.find((u) => u.scope === 'field');
    expect(label?.annotationIds).toEqual(['B2']);
  });

  it('é memoizada pela versão do projeto', () => {
    const p = project();
    expect(noticeUsage(p)).toBe(noticeUsage(p));
    const other = setFieldValue(p, 'B1', 'label', 'Novo');
    expect(noticeUsage(other)).not.toBe(noticeUsage(p));
    expect(noticeUsage(other).find((u) => u.scope === 'field')?.annotationIds).toEqual([
      'B1',
      'B2',
    ]);
  });

  it('projeto sem especialização não tem avisos', () => {
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
        key: 'itens',
        type: 'table',
        columns: [{ key: 'rotulo', type: 'string', notices: [n('diverges', 'c1')] }],
      },
      { key: 'b', type: 'string', notices: [n('deprecated', 'b1')] },
    ],
    notices: [n('diverges', 't1')],
  } as unknown as SpecAnnotationType;

  it('devolve o lugar de cada aviso, na ordem do typeNotices (tipo, campos, colunas)', () => {
    const placed = placedTypeNotices(type);
    expect(placed.map((p) => [p.scope, p.key, p.column, p.notice.message])).toEqual([
      ['type', undefined, undefined, 't1'],
      ['field', 'a', undefined, 'a1'],
      ['field', 'a', undefined, 'a2'],
      ['field', 'b', undefined, 'b1'],
      ['column', 'itens', 'rotulo', 'c1'],
    ]);
    expect(placed.map((p) => p.notice)).toEqual(typeNotices(type));
  });

  it('tipo sem aviso devolve lista vazia', () => {
    expect(placedTypeNotices({ id: 't', name: 'T', fields: [] } as never)).toEqual([]);
  });
});
