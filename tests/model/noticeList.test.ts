import { describe, expect, it } from 'vitest';
import {
  annotationNotices,
  auditedCount,
  changeNotices,
  type AccessibilityAudit,
  type AuditFinding,
  type Change,
} from '../../src/model';
import { noticeProject } from '../components/noticeFixtures';

// Notices helpers (stage #486, AV3; stage #2085): the notices of an annotation, the review's
// notices and the count of the Notices window (annotations with an accessibility warning).

const finding = (annotationId: string): AuditFinding => ({
  code: 'touch-target-small',
  annotationId,
  markingId: `M_${annotationId}`,
  actual: { width: 10, height: 10 },
  min: { width: 44, height: 44 },
  minPx: { width: 44, height: 44 },
  density: 1,
});

describe('auditedCount', () => {
  it('counts the annotations with at least one accessibility warning', () => {
    const audit: AccessibilityAudit = new Map([
      ['A', { issues: [], findings: [finding('A'), finding('A')] }],
      ['B', { issues: [], findings: [finding('B')] }],
      // only a pending item, no warning: not counted
      ['C', { issues: [], findings: [] }],
    ]);
    expect(auditedCount(audit)).toBe(2);
  });

  it('is 0 for an empty audit', () => {
    expect(auditedCount(new Map())).toBe(0);
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
