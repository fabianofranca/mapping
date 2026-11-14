import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { READING_DIRECTIONS, type ProjectContainer } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { Property } from './PropertyGrid';
import { directionLabel } from './readingDirections';

interface ContainerDirectionFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
}

/**
 * Reading direction of the container (v20): "Follows the project" (empty value, `null`) or one of the
 * two directions. Unlike the drawing mode, it always appears: it does not depend on a specialization.
 */
export function ContainerDirectionField({
  image,
  disabled,
}: ContainerDirectionFieldProps) {
  const { actions } = useEditor();
  const id = useId();
  return (
    <Property label={t('direction.label')} for={id} hint={t('direction.containerHint')}>
      <Select
        id={id}
        size="sm"
        value={image.direction ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const value = e.currentTarget.value;
          actions.setContainerDirection(
            image.id,
            READING_DIRECTIONS.find((d) => d === value) ?? null,
          );
        }}
      >
        <option value="">{t('direction.followProject')}</option>
        {READING_DIRECTIONS.map((direction) => (
          <option key={direction} value={direction}>
            {directionLabel(direction)}
          </option>
        ))}
      </Select>
    </Property>
  );
}
