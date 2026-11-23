import { t } from '../i18n';
import {
  drawingAxesOf,
  type DrawingModeMap,
  type Project,
  type UndeclaredDrawingMode,
} from '../model';

/** The axis the editor lists until the full axes interface (NV5): `modes` of a specialization is the axis `mode`. */
export const MODE_AXIS = 'mode';

/** The axes that the applied specializations declare (`tokens.axes`, or `tokens.modes` as the axis `mode`). */
export function declaredDrawingAxes(
  project: Project,
): ReadonlyMap<string, readonly string[]> {
  return drawingAxesOf(project.specializations.map((s) => s.spec?.tokens));
}

/** The entries of the `mode` axis that the applied specializations declare, without repeats. */
export function declaredDrawingModes(project: Project): readonly string[] {
  return declaredDrawingAxes(project).get(MODE_AXIS) ?? [];
}

/** The entry a mode map stores on the `mode` axis. */
export function modeEntryOf(mode: DrawingModeMap | null | undefined): string | undefined {
  return mode?.[MODE_AXIS];
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
