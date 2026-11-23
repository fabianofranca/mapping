import { t } from '../i18n';
import type { ProjectContainer } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { axisLabel, drawingModeLabel, listedAxes } from './drawingModes';
import { Property } from './PropertyGrid';

interface ContainerDrawingModeFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
}

/**
 * Drawing mode of the container, one field per axis: "Follow the project" (empty value) removes only that
 * axis, or one entry of the axis. It only appears with declared axes or with a choice already set on the container.
 */
export function ContainerDrawingModeField({
  image,
  disabled,
}: ContainerDrawingModeFieldProps) {
  const { actions, store } = useEditor();
  const project = store.project.value;
  if (!project) return null;
  const axes = listedAxes(project, image.drawingMode);
  return (
    <>
      {[...axes].map(([axis, entries]) => {
        const fixed = image.drawingMode?.[axis] ?? null;
        const undeclared = fixed !== null && !entries.includes(fixed);
        const id = `${image.id}-drawing-axis-${axis}`;
        return (
          <Property
            key={axis}
            label={axisLabel(axis)}
            for={id}
            hint={t('drawingMode.containerHint')}
          >
            <Select
              id={id}
              size="sm"
              value={fixed ?? ''}
              disabled={disabled}
              onChange={(e) =>
                actions.setContainerDrawingAxis(
                  image.id,
                  axis,
                  e.currentTarget.value || null,
                )
              }
            >
              <option value="">{t('drawingMode.followProject')}</option>
              {entries.map((entry) => (
                <option key={entry} value={entry}>
                  {drawingModeLabel(entry)}
                </option>
              ))}
              {undeclared && (
                <option value={fixed}>
                  {t('drawingMode.undeclared', { mode: drawingModeLabel(fixed) })}
                </option>
              )}
            </Select>
          </Property>
        );
      })}
    </>
  );
}
