import { actualUnitsOf, densityText, type AuditFinding } from '../src/model';
import type { Refs } from './items';

// The accessibility audit's warnings as the MCP shows them (stage #1128, decision 9 of #1081): `audit` in the
// annotation and marking views, and `touch-target-small` in the `warnings` of `plan_changes` / `propose_changes`.

type Json = Record<string, unknown>;

/** One decimal, no trailing zero (`36`, `36.5`): a size in component units. */
const unitsOf = (n: number): number => Number(n.toFixed(1));

/** A size `{ width, height }` with each side rounded by `round`. */
const sizeOf = (
  size: { readonly width: number; readonly height: number },
  round: (n: number) => number,
): Json => ({ width: round(size.width), height: round(size.height) });

/**
 * The audit's warnings (`touch-target-small`) of an annotation: the size in component units, the minimum in
 * units and in image pixels, and the density (pixels per unit). A warning, not a pending item: it is never in
 * `issues`.
 */
export function auditView(refs: Refs, findings: readonly AuditFinding[]): Json[] {
  return findings.map((f) => ({
    code: f.code,
    annotation: refs.ref('a', f.annotationId),
    actual: sizeOf(f.actual, actualUnitsOf),
    min: sizeOf(f.min, unitsOf),
    minPx: sizeOf(f.minPx, (n) => n),
    density: Number(f.density.toFixed(3)),
  }));
}

/** The text of a warning: `36 × 40; minimum 44 × 44 units (132 × 132 px at 3x)`. */
function warningMessage(f: AuditFinding): string {
  const { actual, min, minPx } = f;
  return `${actualUnitsOf(actual.width)} × ${actualUnitsOf(actual.height)}; minimum ${unitsOf(min.width)} × ${unitsOf(min.height)} units (${minPx.width} × ${minPx.height} px at ${densityText(f.density)}x)`;
}

/** A finding as an entry of the plan's `warnings`: the audit's fields plus the marking and a message. */
export function auditWarning(refs: Refs, finding: AuditFinding): Json {
  const [view] = auditView(refs, [finding]);
  const { code, annotation, ...rest } = view!;
  return {
    code,
    annotation,
    marking: refs.ref('m', finding.markingId),
    ...rest,
    message: warningMessage(finding),
  };
}
