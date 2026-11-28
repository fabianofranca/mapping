// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AuditFinding, TouchTargetOverlapFinding } from '../../src/model';
import { auditView, auditWarning } from '../../mcp/auditViews';
import type { Refs } from '../../mcp/items';

const refs = {
  ref: (kind: string, id: string) => `mapping://p/${kind}/${id}`,
} as unknown as Refs;

const finding = (width: number): AuditFinding =>
  ({
    code: 'touch-target-small',
    annotationId: 'a1',
    markingId: 'm1',
    actual: { width, height: 48 },
    min: { width: 48, height: 48 },
    minPx: { width: 126, height: 126 },
    density: 2.625,
  }) as unknown as AuditFinding;

describe('audit views: the rounded size never reads as meeting the minimum', () => {
  it('rounds the actual size down in the view and in the message', () => {
    // 125.9 px at 2.625 px per unit: a finding (1 px tolerance), 47.96 units.
    const [view] = auditView(refs, [finding(47.96)]);
    expect(view).toMatchObject({ actual: { width: 47.9, height: 48 } });
    expect(auditWarning(refs, finding(47.96)).message).toBe(
      '47.9 × 48; minimum 48 × 48 units (126 × 126 px at 2.625x)',
    );
  });

  it('keeps an exact size as it is', () => {
    const [view] = auditView(refs, [finding(36)]);
    expect(view).toMatchObject({ actual: { width: 36, height: 48 } });
  });
});

describe('audit views: the minimum is rounded like the size (D6)', () => {
  it('a fractional minimum reads as in the view', () => {
    const f = { ...finding(36), min: { width: 47.96, height: 47.96 } } as AuditFinding;
    const [view] = auditView(refs, [f]);
    expect(view).toMatchObject({ min: { width: 48, height: 48 } });
    expect(auditWarning(refs, f).message).toBe(
      '36 × 48; minimum 48 × 48 units (126 × 126 px at 2.625x)',
    );
  });
});

describe('audit views: touch-target-overlap (stage #1998, decision 8)', () => {
  const named = {
    ref: (kind: string, id: string) => `mapping://p/${kind}/${id}`,
    markingName: (id: string) => (id === 'm2' ? 'Icon B' : id),
  } as unknown as Refs;
  const overlap = (): TouchTargetOverlapFinding => ({
    code: 'touch-target-overlap',
    annotationId: 'a1',
    markingId: 'm1',
    other: { annotationId: 'a2', markingId: 'm2' },
    overlap: { width: 4, height: 48 },
    overlapPx: { width: 12, height: 144 },
    density: 3,
  });

  it('the audit entry names the other annotation and marking, with the sizes and the density', () => {
    expect(auditView(named, [overlap()])).toEqual([
      {
        code: 'touch-target-overlap',
        annotation: 'mapping://p/a/a1',
        other: { marking: 'mapping://p/m/m2', annotation: 'mapping://p/a/a2' },
        overlap: { width: 4, height: 48 },
        overlapPx: { width: 12, height: 144 },
        density: 3,
      },
    ]);
  });

  it('the overlap has one decimal and the density up to three', () => {
    const f: TouchTargetOverlapFinding = {
      ...overlap(),
      overlap: { width: 3.9166667, height: 48 },
      density: 2.625,
    };
    const [view] = auditView(named, [f]);
    expect(view).toMatchObject({ overlap: { width: 3.9, height: 48 }, density: 2.625 });
  });

  it('the warning adds the marking and a message that names the other marking', () => {
    const warning = auditWarning(named, overlap());
    expect(warning).toMatchObject({
      code: 'touch-target-overlap',
      annotation: 'mapping://p/a/a1',
      marking: 'mapping://p/m/m1',
      other: { marking: 'mapping://p/m/m2', annotation: 'mapping://p/a/a2' },
      message: 'overlaps the touch area of Icon B by 4 × 48 units (12 × 144 px at 3x)',
    });
  });
});
