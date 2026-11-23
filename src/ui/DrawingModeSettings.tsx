import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { Project } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { axisLabel, drawingModeLabel, listedAxes } from './drawingModes';

// Drawing mode of the project (schema v18, per axis since v24), in the editor Settings: one list per
// axis of the `tokens` of the applied specializations. It does not depend on the interface's light/dark theme.

interface DrawingModeSettingsProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/** `true` if there is something to show: some declared axis or a choice saved in the project. */
export function hasDrawingModes(project: Project): boolean {
  return listedAxes(project, project.drawingMode).size > 0;
}

export function DrawingModeSettings({ project, readOnly }: DrawingModeSettingsProps) {
  const { actions } = useEditor();
  const titleId = useId();
  const axes = listedAxes(project, project.drawingMode);
  if (axes.size === 0) return null;
  return (
    <section class="repos" aria-labelledby={titleId}>
      <h3 id={titleId} class="repos-title">
        {t('drawingMode.title')}
      </h3>
      <p class="muted">{t('drawingMode.intro')}</p>
      {[...axes].map(([axis, entries]) => {
        const stored = project.drawingMode?.[axis];
        const undeclared = stored !== undefined && !entries.includes(stored);
        // Without a saved entry the axis default (its first entry) applies.
        return (
          <Select
            key={axis}
            label={axisLabel(axis)}
            value={stored ?? entries[0] ?? ''}
            disabled={readOnly}
            onChange={(e) => actions.setProjectDrawingAxis(axis, e.currentTarget.value)}
          >
            {entries.map((entry) => (
              <option key={entry} value={entry}>
                {drawingModeLabel(entry)}
              </option>
            ))}
            {undeclared && (
              <option value={stored}>
                {t('drawingMode.undeclared', { mode: drawingModeLabel(stored) })}
              </option>
            )}
          </Select>
        );
      })}
    </section>
  );
}
