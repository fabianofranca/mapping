// The text of the accessibility audit's warnings (stage #1127), always via `t()`.
import { t } from '../i18n';
import {
  actualUnitsOf,
  projectIndex,
  type AuditFinding,
  type AuditNeighbor,
  type Project,
} from '../model';
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

/** The neighbor's name as the Tree shows it, or the unnamed fallback. */
function neighborName(project: Project, neighbor: AuditNeighbor): string {
  const other = projectIndex(project).markings.get(neighbor.markingId);
  return other ? markingLabel(project, other) : t('marking.unnamed');
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
    return t('audit.touchTargetOverlap', {
      name: neighborName(project, finding.other),
      width: units(finding.overlap.width),
      height: units(finding.overlap.height),
      pxWidth: pixels(finding.overlapPx.width),
      pxHeight: pixels(finding.overlapPx.height),
      density: formatDensity(finding.density),
    });
  }
  const params = {
    width: units(actualUnitsOf(finding.actual.width)),
    height: units(actualUnitsOf(finding.actual.height)),
    minWidth: units(finding.min.width),
    minHeight: units(finding.min.height),
    pxWidth: pixels(finding.minPx.width),
    pxHeight: pixels(finding.minPx.height),
    density: formatDensity(finding.density),
  };
  if (finding.spacing === undefined) return t('audit.touchTargetSmall', params);
  return t('audit.touchTargetSmallSpacing', {
    ...params,
    name: neighborName(project, finding.spacing.other),
  });
}
