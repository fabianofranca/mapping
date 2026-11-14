import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { READING_DIRECTIONS, type Project } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { directionLabel } from './readingDirections';

// Direção de leitura do projeto (schema v20), nas Configurações do editor: a que os componentes
// seguem, salvo nos containers que fixam a sua. Nenhuma marcação muda de lugar.

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
        // Sem direção gravada vale `ltr`.
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
