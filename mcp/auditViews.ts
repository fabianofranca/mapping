import {
  actualUnitsOf,
  densityText,
  type AuditFinding,
  type TouchTargetOverlapFinding,
  type TouchTargetSmallFinding,
} from '../src/model';
import type { Refs } from './items';

// The accessibility audit's warnings as the MCP shows them (stage #1128, decision 9 of #1081): `audit` in the
// annotation and marking views, and `touch-target-small` and `touch-target-overlap` in the `warnings` of
// `plan_changes` / `propose_changes`.

type Json = Record<string, unknown>;

/** One decimal, no trailing zero (`36`, `36.5`): a size in component units. */
const unitsOf = (n: number): number => Number(n.toFixed(1));

/** A size `{ width, height }` with each side rounded by `round`. */
const sizeOf = (
  size: { readonly width: number; readonly height: number },
  round: (n: number) => number,
): Json => ({ width: round(size.width), height: round(size.height) });

/** `touch-target-small`: the size in units, the minimum in units and in image pixels, and the density (pixels per unit). */
function smallView(refs: Refs, f: TouchTargetSmallFinding): Json {
  return {
    code: f.code,
    annotation: refs.ref('a', f.annotationId),
    actual: sizeOf(f.actual, actualUnitsOf),
    min: sizeOf(f.min, unitsOf),
    minPx: sizeOf(f.minPx, (n) => n),
    density: Number(f.density.toFixed(3)),
  };
}

/** `touch-target-overlap`: the other annotation and marking, the intersection in units (one decimal) and in pixels. */
function overlapView(refs: Refs, f: TouchTargetOverlapFinding): Json {
  return {
    code: f.code,
    annotation: refs.ref('a', f.annotationId),
    other: {
      marking: refs.ref('m', f.other.markingId),
      annotation: refs.ref('a', f.other.annotationId),
    },
    overlap: sizeOf(f.overlap, unitsOf),
    overlapPx: sizeOf(f.overlapPx, (n) => n),
    density: Number(f.density.toFixed(3)),
  };
}

/**
 * The audit's warnings of an annotation (`touch-target-small`, `touch-target-overlap`). A warning, not a pending
 * item: it is never in `issues`.
 */
export function auditView(refs: Refs, findings: readonly AuditFinding[]): Json[] {
  return findings.map((f) =>
    f.code === 'touch-target-overlap' ? overlapView(refs, f) : smallView(refs, f),
  );
}

/** The text of a warning: `36 × 40; minimum 44 × 44 units (132 × 132 px at 3x)`. */
function smallMessage(f: TouchTargetSmallFinding): string {
  const { actual, min, minPx } = f;
  return `${actualUnitsOf(actual.width)} × ${actualUnitsOf(actual.height)}; minimum ${unitsOf(min.width)} × ${unitsOf(min.height)} units (${minPx.width} × ${minPx.height} px at ${densityText(f.density)}x)`;
}

/** The text of an overlap: `overlaps the touch area of Icon B by 4 × 48 units (4 × 48 px at 1x)`. */
function overlapMessage(refs: Refs, f: TouchTargetOverlapFinding): string {
  const { overlap, overlapPx } = f;
  return `overlaps the touch area of ${refs.markingName(f.other.markingId)} by ${unitsOf(overlap.width)} × ${unitsOf(overlap.height)} units (${overlapPx.width} × ${overlapPx.height} px at ${densityText(f.density)}x)`;
}

const warningMessage = (refs: Refs, f: AuditFinding): string =>
  f.code === 'touch-target-overlap' ? overlapMessage(refs, f) : smallMessage(f);

/** A finding as an entry of the plan's `warnings`: the audit's fields plus the marking and a message. */
export function auditWarning(refs: Refs, finding: AuditFinding): Json {
  const [view] = auditView(refs, [finding]);
  const { code, annotation, ...rest } = view!;
  return {
    code,
    annotation,
    marking: refs.ref('m', finding.markingId),
    ...rest,
    message: warningMessage(refs, finding),
  };
}
