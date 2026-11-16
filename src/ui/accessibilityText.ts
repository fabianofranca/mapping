// The text of the accessibility audit's warnings (stage #1127), always via `t()`.
import { t } from '../i18n';
import { actualUnitsOf, type AuditFinding } from '../model';
import { formatDensity } from './density';
import { locale } from '../store/settings';

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

/**
 * The text of a warning: the size in component units and the minimum, in units and in pixels of the
 * image. No platform unit name (dp, pt): the specialization's units are the component's.
 */
export function auditFindingText(finding: AuditFinding): string {
  const units = (value: number) => formatMeasure(value, 1);
  const pixels = (value: number) => formatMeasure(value, 0);
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
