import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { Project } from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { declaredDrawingModes } from './drawingModes';

// Modo do desenho do projeto (schema v18), nas Configurações do editor: escolhe o modo dos
// `tokens` das especializações aplicadas. Não depende do tema claro/escuro da interface.

interface DrawingModeSettingsProps {
  readonly project: Project;
  readonly readOnly: boolean;
}

/** `true` se há o que mostrar: algum modo declarado ou um modo gravado no projeto. */
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
  // Sem modo gravado vale o primeiro (o padrão das especializações).
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
            {mode}
          </option>
        ))}
        {undeclared && (
          <option value={stored}>{t('drawingMode.undeclared', { mode: stored })}</option>
        )}
      </Select>
    </section>
  );
}
