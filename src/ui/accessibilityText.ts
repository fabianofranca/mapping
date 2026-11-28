// The text of the accessibility audit's warnings (stage #1127), always via `t()`.
import { t } from '../i18n';
import { actualUnitsOf, projectIndex, type AuditFinding, type Project } from '../model';
import { formatDensity } from './density';
import { locale } from '../store/settings';
import { markingLabel } from './labels';

/** A measure in the interface language, with up to `digits` decimals (36, 36,5 in pt-BR). */
function formatMeasure(value: number, digits: number): string {
  try {
    return new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits }).format(
      value,
    );
  } catch {
    return String(value);
  }
}

/** A key of a finding in a list: an overlap is one per neighbor, so the neighbor is part of it. */
export function auditFindingKey(finding: AuditFinding): string {
  const base = `${finding.annotationId}:${finding.code}`;
  return finding.code === 'touch-target-overlap'
    ? `${base}:${finding.other.annotationId}`
    : base;
}

/**
 * The text of a warning: the size in component units and the minimum, in units and in pixels of the
 * image (`touch-target-small`), or the intersection with the neighbor, named as the Tree shows it
 * (`touch-target-overlap`). No platform unit name (dp, pt): the specialization's units are the component's.
 */
export function auditFindingText(project: Project, finding: AuditFinding): string {
  const units = (value: number) => formatMeasure(value, 1);
  const pixels = (value: number) => formatMeasure(value, 0);
  if (finding.code === 'touch-target-overlap') {
    const other = projectIndex(project).markings.get(finding.other.markingId);
    return t('audit.touchTargetOverlap', {
      name: other ? markingLabel(project, other) : t('marking.unnamed'),
      width: units(finding.overlap.width),
      height: units(finding.overlap.height),
      pxWidth: pixels(finding.overlapPx.width),
      pxHeight: pixels(finding.overlapPx.height),
      density: formatDensity(finding.density),
    });
  }
  return t('audit.touchTargetSmall', {
    width: units(actualUnitsOf(finding.actual.width)),
    height: units(actualUnitsOf(finding.actual.height)),
    minWidth: units(finding.min.width),
    minHeight: units(finding.min.height),
    pxWidth: pixels(finding.minPx.width),
    pxHeight: pixels(finding.minPx.height),
    density: formatDensity(finding.density),
  });
}
