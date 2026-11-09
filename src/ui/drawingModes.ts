import { t } from '../i18n';
import { drawingModesOf, type Project } from '../model';

/** Os modos do desenho que as especializações aplicadas declaram (`tokens.modes`), sem repetir. */
export function declaredDrawingModes(project: Project): string[] {
  return drawingModesOf(project.specializations.map((s) => s.spec?.tokens));
}

/** Rótulo de um modo do desenho: `light`/`dark` vêm de `t()`; outro modo aparece como declarado. */
export function drawingModeLabel(mode: string): string {
  if (mode === 'light') return t('drawingMode.light');
  if (mode === 'dark') return t('drawingMode.dark');
  return mode;
}
