import { t } from '../i18n';
import {
  drawingAxesOf,
  type DrawingModeMap,
  type Project,
  type UndeclaredDrawingMode,
} from '../model';

/** The axis that `modes` of a specialization stands for. */
export const MODE_AXIS = 'mode';

/** The axes that the applied specializations declare (`tokens.axes`, or `tokens.modes` as the axis `mode`). */
export function declaredDrawingAxes(
  project: Project,
): ReadonlyMap<string, readonly string[]> {
  return drawingAxesOf(project.specializations.map((s) => s.spec?.tokens));
}

/** Label of an axis: the `mode` axis keeps "Drawing mode", another one shows its name. */
export function axisLabel(axis: string): string {
  return axis === MODE_AXIS ? t('drawingMode.label') : axis;
}

/**
 * The axes to list: the declared ones, plus an axis the map stores that nothing declares (so its
 * undeclared entry can be seen and replaced). Each with its declared entries.
 */
export function listedAxes(
  project: Project,
  ...stored: ReadonlyArray<DrawingModeMap | null | undefined>
): ReadonlyMap<string, readonly string[]> {
  const out = new Map(declaredDrawingAxes(project));
  for (const map of stored) {
    for (const axis of Object.keys(map ?? {})) if (!out.has(axis)) out.set(axis, []);
  }
  return out;
}

/** An undeclared (axis, entry) as text: just the entry on the `mode` axis, `axis: entry` on another. */
export function undeclaredModeText(u: UndeclaredDrawingMode): string {
  return u.axis === MODE_AXIS ? drawingModeLabel(u.entry) : `${u.axis}: ${u.entry}`;
}

/** Label of a drawing mode: `light`/`dark` come from `t()`; another mode appears as declared. */
export function drawingModeLabel(mode: string): string {
  if (mode === 'light') return t('drawingMode.light');
  if (mode === 'dark') return t('drawingMode.dark');
  return mode;
}
