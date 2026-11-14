import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { ProjectContainer } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { declaredDrawingModes, drawingModeLabel } from './drawingModes';
import { Property } from './PropertyGrid';

interface ContainerDrawingModeFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
}

/**
 * Drawing mode of the container (v18): "Follow the project" (empty value, `null`) or one of
 * the modes of the specializations. It only appears with declared modes or with a mode already
 * set on the container.
 */
export function ContainerDrawingModeField({
  image,
  disabled,
}: ContainerDrawingModeFieldProps) {
  const { actions, store } = useEditor();
  const id = useId();
  const project = store.project.value;
  const declared = project ? declaredDrawingModes(project) : [];
  const fixed = image.drawingMode ?? null;
  if (declared.length === 0 && fixed === null) return null;
  const undeclared = fixed !== null && !declared.includes(fixed);
  return (
    <Property
      label={t('drawingMode.label')}
      for={id}
      hint={t('drawingMode.containerHint')}
    >
      <Select
        id={id}
        size="sm"
        value={fixed ?? ''}
        disabled={disabled}
        onChange={(e) =>
          actions.setContainerDrawingMode(image.id, e.currentTarget.value || null)
        }
      >
        <option value="">{t('drawingMode.followProject')}</option>
        {declared.map((mode) => (
          <option key={mode} value={mode}>
            {drawingModeLabel(mode)}
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
}
