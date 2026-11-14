import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { READING_DIRECTIONS, type Project } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { directionLabel } from './readingDirections';

// Project reading direction (schema v20), in the editor Settings: the one the components
// follow, except in containers that fix their own. No marking moves.

interface ProjectDirectionSettingsProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

export function ProjectDirectionSettings({
  project,
  readOnly,
}: ProjectDirectionSettingsProps) {
  const { actions } = useEditor();
  const titleId = useId();
  return (
    <section class="repos" aria-labelledby={titleId}>
      <h3 id={titleId} class="repos-title">
        {t('direction.title')}
      </h3>
      <p class="muted">{t('direction.intro')}</p>
      <Select
        label={t('direction.label')}
        // With no saved direction, `ltr` applies.
        value={project.direction ?? 'ltr'}
        disabled={readOnly}
        onChange={(e) => {
          const value = e.currentTarget.value;
          actions.setProjectDirection(
            READING_DIRECTIONS.find((d) => d === value) ?? null,
          );
        }}
      >
        {READING_DIRECTIONS.map((direction) => (
          <option key={direction} value={direction}>
            {directionLabel(direction)}
          </option>
        ))}
      </Select>
    </section>
  );
}
