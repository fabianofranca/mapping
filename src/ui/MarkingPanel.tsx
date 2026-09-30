import { useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import {
  parentCandidates,
  type Layer,
  type Marking,
  type Project,
  type ProjectImage,
  type Rect,
} from '../model';
import type { ActionResult } from '../store/history';
import type { ProjectActions } from '../store/project';
import { AnnotationsPanel } from './AnnotationsPanel';
import { CommitInput } from './CommitInput';
import { markingErrorMessage, markingPath } from './labels';

interface MarkingPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  readonly image: ProjectImage;
  /** Camadas visíveis e camada ativa (estado da UI). */
  readonly visibleLayers: readonly Layer[];
  readonly activeLayer: Layer | null;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  readonly onDelete: (marking: Marking) => void;
}

const RECT_FIELDS: readonly { key: keyof Rect; label: TranslationKey }[] = [
  { key: 'x', label: 'marking.x' },
  { key: 'y', label: 'marking.y' },
  { key: 'width', label: 'marking.width' },
  { key: 'height', label: 'marking.height' },
];

/** Detalhes da marcação: nome, ajuste fino do retângulo, pai, revisão e exclusão. */
export function MarkingPanel({
  project,
  marking,
  image,
  visibleLayers,
  activeLayer,
  actions,
  readOnly,
  onDelete,
}: MarkingPanelProps) {
  // O Editor recria o painel (via `key`) ao trocar de marcação, o que limpa o erro.
  const [error, setError] = useState<string | null>(null);

  const report = (result: ActionResult): boolean => {
    setError(result.ok ? null : markingErrorMessage(result.error));
    return result.ok;
  };

  const commitRect = (key: keyof Rect, text: string): boolean => {
    const value = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(value)) {
      setError(markingErrorMessage('rect-not-integer'));
      return false;
    }
    // Fora dos limites, o valor é ajustado ao limite; o campo mostra o valor gravado.
    report(actions.adjustMarkingRect(marking.id, key, value));
    return false;
  };

  const candidates = parentCandidates(project, marking.id);

  return (
    <div class="panel-details">
      <div class="panel-heading">
        <strong class="panel-name">{markingPath(project, marking)}</strong>
        <span class="muted">{t('marking.inImage', { file: image.file })}</span>
      </div>

      {marking.needsReview && (
        <div class="notice" role="status">
          <strong>⚠ {t('marking.needsReview')}</strong>
          <p>{t('marking.reviewMessage')}</p>
          <button
            type="button"
            class="button button-primary"
            disabled={readOnly}
            onClick={() => report(actions.confirmMarkingReview(marking.id))}
          >
            {t('marking.confirmReview')}
          </button>
        </div>
      )}

      <label class="field">
        {t('marking.name')}
        <CommitInput
          class="input"
          value={marking.name ?? ''}
          placeholder={t('marking.namePlaceholder')}
          disabled={readOnly}
          onCommit={(text) => {
            // Espaços em volta não contam como alteração.
            if ((text.trim() || null) === marking.name) return false;
            return report(actions.renameMarking(marking.id, text));
          }}
        />
      </label>

      <AnnotationsPanel
        project={project}
        marking={marking}
        layers={visibleLayers}
        activeLayer={activeLayer}
        actions={actions}
        readOnly={readOnly}
      />

      <fieldset class="rect-fields" disabled={readOnly}>
        <legend>{t('marking.rect')}</legend>
        {RECT_FIELDS.map(({ key, label }) => (
          <label key={key} class="field">
            {t(label)}
            <CommitInput
              class="input"
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={String(marking.rect[key])}
              onCommit={(text) => commitRect(key, text)}
            />
          </label>
        ))}
      </fieldset>

      <label class="field">
        {t('marking.parent')}
        <select
          class="input"
          value={marking.parentId ?? ''}
          disabled={readOnly}
          onChange={(e) => {
            const value = e.currentTarget.value;
            report(actions.setMarkingParent(marking.id, value === '' ? null : value));
          }}
        >
          <option value="">{t('marking.noParent')}</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {markingPath(project, m)}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}

      <div class="row">
        <button
          type="button"
          class="button button-danger"
          disabled={readOnly}
          onClick={() => onDelete(marking)}
        >
          {t('marking.delete')}
        </button>
      </div>
    </div>
  );
}
