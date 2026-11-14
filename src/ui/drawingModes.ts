import { t } from '../i18n';
import { drawingModesOf, type Project } from '../model';

/** The drawing modes that the applied specializations declare (`tokens.modes`), without repeats. */
export function declaredDrawingModes(project: Project): string[] {
  return drawingModesOf(project.specializations.map((s) => s.spec?.tokens));
}

/** Label of a drawing mode: `light`/`dark` come from `t()`; another mode appears as declared. */
export function drawingModeLabel(mode: string): string {
  if (mode === 'light') return t('drawingMode.light');
  if (mode === 'dark') return t('drawingMode.dark');
  return mode;
}
