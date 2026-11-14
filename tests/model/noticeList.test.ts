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

// Notices window list (stage #486, AV3): groups by notice, rows by annotation and counts.

const title = (g: { usage: { scope: string; key?: string; column?: string } }) =>
  [g.usage.scope, g.usage.key, g.usage.column].filter(Boolean).join(':');

describe('buildNoticeList', () => {
  it('sorts the groups by severity and then by specialization order', () => {
    const groups = buildNoticeList(noticeProject(), {});
    // removed (Gone) > deprecated (field legacyStyle) > diverges (column) > pending (type Alert)
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

  it('brings the rows of each group: marking, layer, annotation and field value', () => {
    const groups = buildNoticeList(noticeProject(), {});
    const deprecated = groups[1]!;
    expect(deprecated.count).toBe(1);
    const [row] = deprecated.rows;
    expect(row?.annotation.id).toBe('AA');
    expect(row?.marking.id).toBe('M1');
    expect(row?.path.map((m) => m.id)).toEqual(['M1']);
    // pt-BR kept: shared fixture data asserted by tests/components (noticeFixtures)
    expect(row?.layer.name).toBe('Componentes');
    expect(row?.value).toBe('x');
    // type notice: no value
    expect(groups[0]!.rows[0]?.value).toBeUndefined();
    // column notice: the cells with a value
    expect(groups[2]!.rows[0]?.value).toEqual(['onTap']);
  });

  it('filters by kind', () => {
    const groups = buildNoticeList(noticeProject(), { kind: 'deprecated' });
    expect(groups.map((g) => g.usage.notice.kind)).toEqual(['deprecated']);
  });

  it('"Only notices in use" hides the notice that no annotation uses', () => {
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

  it('"Only visible layers" drops the rows of layers outside the list', () => {
    const p = noticeProject();
    expect(buildNoticeList(p, { onlyLayers: [] })).toEqual([]);
    expect(buildNoticeList(p, { onlyLayers: p.layers }).length).toBe(4);
    expect(buildNoticeList(p, { onlyLayers: [], inUseOnly: false })).toHaveLength(4);
  });

  it('the empty-field notice affects neither the annotation nor the list', () => {
    const p = addTypedAnnotation(noticeProject(), {
      id: 'AA2',
      markingId: 'M1',
      // pt-BR kept: shared fixture data (noticeFixtures) asserted by tests/components
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
  it('counts the annotations with any notice, in total and by kind', () => {
    const counts = noticeCounts(noticeProject(), {});
    // AA (pending, deprecated, diverges) and AG (removed); AP has no notice
    expect(counts.total).toBe(2);
    expect(counts.byKind).toEqual({ removed: 1, deprecated: 1, diverges: 1, pending: 1 });
  });

  it('the total does not depend on the kind filter', () => {
    expect(noticeCounts(noticeProject(), { kind: 'removed' }).total).toBe(2);
  });

  it('with "Only notices in use" unchecked it counts the listed notices (groups), not the annotations', () => {
    // with no annotation having a notice: the list has one group per notice and the buttons cannot show 0
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

  it('a project with only pending notices and no annotations counts the groups', () => {
    const base = noticeProject();
    const p = { ...base, annotations: [], arrows: [] };
    const counts = noticeCounts(p, { inUseOnly: false });
    expect(counts.total).toBe(buildNoticeList(p, { inUseOnly: false }).length);
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.byKind.pending).toBe(1);
    // checked, it keeps counting annotations
    expect(noticeCounts(p, { inUseOnly: true })).toMatchObject({
      unit: 'annotations',
      total: 0,
    });
  });

  it('with the filter checked the unit is annotation', () => {
    expect(noticeCounts(noticeProject(), {}).unit).toBe('annotations');
  });

  it('a project with no notices has total 0', () => {
    expect(noticeCounts({ ...noticeProject(), specializations: [] }, {}).total).toBe(0);
  });
});

describe('annotationNotices', () => {
  it('lists the notices that affect the annotation', () => {
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

  it('creating the annotation brings every notice it starts to have', () => {
    expect(
      kinds(changeNotices(noticeProject(), change('annotation', 'create', null), '')),
    ).toEqual(['deprecated', 'diverges', 'pending']);
  });

  it("changing the type brings the type's notices", () => {
    expect(
      kinds(
        changeNotices(noticeProject(), change('annotation', 'update', 'type'), 'type'),
      ),
    ).toEqual(['pending']);
  });

  it("a field value brings the field's notice and its columns' notices", () => {
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

  it('other entities, fields and removals bring no notice', () => {
    const p = noticeProject();
    expect(changeNotices(p, change('marking', 'update', 'name'), 'name')).toEqual([]);
    expect(changeNotices(p, change('annotation', 'update', 'name'), 'name')).toEqual([]);
    expect(changeNotices(p, change('annotation', 'remove', null), '')).toEqual([]);
  });
});
