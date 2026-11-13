import { describe, expect, it } from 'vitest';
import {
  addTypedAnnotation,
  annotationNotices,
  buildNoticeList,
  changeNotices,
  type Change,
  noticeCounts,
  setFieldValue,
} from '../../src/model';
import { noticeProject } from '../components/noticeFixtures';
import { layerOf } from './specFixtures';

// Lista da janela Avisos (etapa #486, AV3): grupos por aviso, linhas por anotação e contagens.

const title = (g: { usage: { scope: string; key?: string; column?: string } }) =>
  [g.usage.scope, g.usage.key, g.usage.column].filter(Boolean).join(':');

describe('buildNoticeList', () => {
  it('ordena os grupos por gravidade e, depois, pela ordem da especialização', () => {
    const groups = buildNoticeList(noticeProject(), {});
    // removed (Gone) > deprecated (campo legacyStyle) > diverges (coluna) > pending (tipo Alert)
    expect(groups.map((g) => g.usage.notice.kind)).toEqual([
      'removed',
      'deprecated',
      'diverges',
      'pending',
    ]);
    expect(groups.map(title)).toEqual([
      'type',
      'field:legacyStyle',
      'column:events:handler',
      'type',
    ]);
  });

  it('traz as linhas de cada grupo: marcação, camada, anotação e valor no campo', () => {
    const groups = buildNoticeList(noticeProject(), {});
    const deprecated = groups[1]!;
    expect(deprecated.count).toBe(1);
    const [row] = deprecated.rows;
    expect(row?.annotation.id).toBe('AA');
    expect(row?.marking.id).toBe('M1');
    expect(row?.path.map((m) => m.id)).toEqual(['M1']);
    expect(row?.layer.name).toBe('Componentes');
    expect(row?.value).toBe('x');
    // aviso de tipo: sem valor
    expect(groups[0]!.rows[0]?.value).toBeUndefined();
    // aviso de coluna: as células com valor
    expect(groups[2]!.rows[0]?.value).toEqual(['onTap']);
  });

  it('filtra por kind', () => {
    const groups = buildNoticeList(noticeProject(), { kind: 'deprecated' });
    expect(groups.map((g) => g.usage.notice.kind)).toEqual(['deprecated']);
  });

  it('"Só avisos em uso" esconde o aviso que nenhuma anotação usa', () => {
    let p = noticeProject();
    p = setFieldValue(p, 'AA', 'legacyStyle', '');
    expect(
      buildNoticeList(p, { inUseOnly: true }).map((g) => g.usage.notice.kind),
    ).toEqual(['removed', 'diverges', 'pending']);
    const all = buildNoticeList(p, { inUseOnly: false });
    expect(all).toHaveLength(4);
    expect(all[1]!.rows).toEqual([]);
    expect(all[1]!.count).toBe(0);
  });

  it('"Só camadas visíveis" tira as linhas de camadas fora da lista', () => {
    const p = noticeProject();
    expect(buildNoticeList(p, { onlyLayers: [] })).toEqual([]);
    expect(buildNoticeList(p, { onlyLayers: p.layers }).length).toBe(4);
    expect(buildNoticeList(p, { onlyLayers: [], inUseOnly: false })).toHaveLength(4);
  });

  it('o aviso de campo vazio não afeta a anotação nem a lista', () => {
    const p = addTypedAnnotation(noticeProject(), {
      id: 'AA2',
      markingId: 'M1',
      layerId: layerOf(noticeProject(), 'avisos', 'componentes'),
      type: { specId: 'avisos', typeId: 'alert' },
      parentAnnotationId: null,
    });
    const groups = buildNoticeList(p, {});
    expect(
      groups
        .find((g) => g.usage.scope === 'type' && g.usage.notice.kind === 'pending')
        ?.rows.map((r) => r.annotation.id),
    ).toEqual(['AA', 'AA2']);
    expect(
      groups.find((g) => g.usage.key === 'legacyStyle')?.rows.map((r) => r.annotation.id),
    ).toEqual(['AA']);
  });
});

describe('noticeCounts', () => {
  it('conta as anotações com algum aviso, no total e por kind', () => {
    const counts = noticeCounts(noticeProject(), {});
    // AA (pending, deprecated, diverges) e AG (removed); AP não tem aviso
    expect(counts.total).toBe(2);
    expect(counts.byKind).toEqual({ removed: 1, deprecated: 1, diverges: 1, pending: 1 });
  });

  it('o total não depende do filtro de kind', () => {
    expect(noticeCounts(noticeProject(), { kind: 'removed' }).total).toBe(2);
  });

  it('com "Só avisos em uso" desmarcado conta os avisos listados (grupos), não as anotações', () => {
    // sem nenhuma anotação com aviso: a lista tem um grupo por aviso e os botões não podem dar 0
    let p = noticeProject();
    p = setFieldValue(p, 'AA', 'legacyStyle', '');
    const groups = buildNoticeList(p, { inUseOnly: false });
    const counts = noticeCounts(p, { inUseOnly: false });
    expect(counts.unit).toBe('notices');
    expect(counts.total).toBe(groups.length);
    expect(counts.byKind).toEqual({ removed: 1, deprecated: 1, diverges: 1, pending: 1 });
    for (const kind of ['removed', 'deprecated', 'diverges', 'pending'] as const)
      expect(counts.byKind[kind]).toBe(
        buildNoticeList(p, { inUseOnly: false, kind }).length,
      );
  });

  it('um projeto só com avisos pending e sem anotações conta os grupos', () => {
    const base = noticeProject();
    const p = { ...base, annotations: [], arrows: [] };
    const counts = noticeCounts(p, { inUseOnly: false });
    expect(counts.total).toBe(buildNoticeList(p, { inUseOnly: false }).length);
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.byKind.pending).toBe(1);
    // marcado, segue contando anotações
    expect(noticeCounts(p, { inUseOnly: true })).toMatchObject({
      unit: 'annotations',
      total: 0,
    });
  });

  it('com o filtro marcado a unidade é anotação', () => {
    expect(noticeCounts(noticeProject(), {}).unit).toBe('annotations');
  });

  it('um projeto sem avisos tem total 0', () => {
    expect(noticeCounts({ ...noticeProject(), specializations: [] }, {}).total).toBe(0);
  });
});

describe('annotationNotices', () => {
  it('lista os avisos que afetam a anotação', () => {
    const p = noticeProject();
    expect(
      annotationNotices(p, 'AA')
        .map((u) => u.notice.kind)
        .sort(),
    ).toEqual(['deprecated', 'diverges', 'pending']);
    expect(annotationNotices(p, 'AP')).toEqual([]);
    expect(annotationNotices(p, 'nope')).toEqual([]);
  });
});

describe('changeNotices', () => {
  const change = (
    entity: Change['entity'],
    kind: Change['kind'],
    field: string | null,
  ): Change => ({
    id: 'c1',
    kind,
    entity,
    entityId: 'AA',
    imageId: 'I1',
    markingId: 'M1',
    field,
    from: null,
    to: null,
  });
  const kinds = (list: readonly { notice: { kind: string } }[]) =>
    list.map((u) => u.notice.kind).sort();

  it('a criação da anotação traz todos os avisos que ela passa a ter', () => {
    expect(
      kinds(changeNotices(noticeProject(), change('annotation', 'create', null), '')),
    ).toEqual(['deprecated', 'diverges', 'pending']);
  });

  it('a troca de tipo traz os avisos do tipo', () => {
    expect(
      kinds(
        changeNotices(noticeProject(), change('annotation', 'update', 'type'), 'type'),
      ),
    ).toEqual(['pending']);
  });

  it('o valor de um campo traz o aviso do campo e os das colunas dele', () => {
    const p = noticeProject();
    expect(
      kinds(
        changeNotices(
          p,
          change('annotation', 'update', 'values.legacyStyle'),
          'values.legacyStyle',
        ),
      ),
    ).toEqual(['deprecated']);
    expect(
      kinds(
        changeNotices(
          p,
          change('annotation', 'update', 'values.events'),
          'values.events',
        ),
      ),
    ).toEqual(['diverges']);
  });

  it('outras entidades, campos e remoções não trazem aviso', () => {
    const p = noticeProject();
    expect(changeNotices(p, change('marking', 'update', 'name'), 'name')).toEqual([]);
    expect(changeNotices(p, change('annotation', 'update', 'name'), 'name')).toEqual([]);
    expect(changeNotices(p, change('annotation', 'remove', null), '')).toEqual([]);
  });
});
