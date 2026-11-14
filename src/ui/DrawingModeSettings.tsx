import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { Project } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { declaredDrawingModes, drawingModeLabel } from './drawingModes';

// Drawing mode of the project (schema v18), in the editor Settings: chooses the mode of the
// `tokens` of the applied specializations. It does not depend on the interface's light/dark theme.

interface DrawingModeSettingsProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/** `true` if there is something to show: some declared mode or a mode saved in the project. */
export function hasDrawingModes(project: Project): boolean {
  return declaredDrawingModes(project).length > 0 || project.drawingMode !== undefined;
}

export function DrawingModeSettings({ project, readOnly }: DrawingModeSettingsProps) {
  const { actions } = useEditor();
  const titleId = useId();
  const declared = declaredDrawingModes(project);
  const stored = project.drawingMode;
  if (!hasDrawingModes(project)) return null;
  const undeclared = stored !== undefined && !declared.includes(stored);
  // Without a saved mode the first one applies (the specializations' default).
  const value = stored ?? declared[0] ?? '';
  return (
    <section class="repos" aria-labelledby={titleId}>
      <h3 id={titleId} class="repos-title">
        {t('drawingMode.title')}
      </h3>
      <p class="muted">{t('drawingMode.intro')}</p>
      <Select
        label={t('drawingMode.label')}
        value={value}
        disabled={readOnly}
        onChange={(e) => actions.setProjectDrawingMode(e.currentTarget.value)}
      >
        {declared.map((mode) => (
          <option key={mode} value={mode}>
            {drawingModeLabel(mode)}
          </option>
        ))}
        {undeclared && (
          <option value={stored}>
            {t('drawingMode.undeclared', { mode: drawingModeLabel(stored) })}
          </option>
        )}
      </Select>
    </section>
  );
}
