import { drawingModesOf, type Project } from '../model';

/** Os modos do desenho que as especializações aplicadas declaram (`tokens.modes`), sem repetir. */
export function declaredDrawingModes(project: Project): string[] {
  return drawingModesOf(project.specializations.map((s) => s.spec?.tokens));
}
