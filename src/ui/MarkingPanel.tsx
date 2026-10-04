import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  ancestorsOf,
  parentCandidates,
  type Marking,
  type Project,
  type ProjectImage,
  type Rect,
} from '../model';
import type { ActionResult } from '../store/history';
import { showLayer, type AnnotationLocation } from '../store/ui';
import { AnnotationsPanel } from './AnnotationsPanel';
import { Button, Select, TextField } from './controls';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { imageLabel, markingErrorMessage, markingLabel, markingPath } from './labels';
import { Property, PropertyGrid } from './PropertyGrid';

interface MarkingPanelProps {
  readonly project: Project;
  readonly marking: Marking;
  readonly image: ProjectImage;
  readonly readOnly: boolean;
  readonly onDelete: (marking: Marking) => void;
  readonly onSelectMarking: (markingId: string) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Resumo da seção Marcação recolhida: "X 112 · Y 236 · 346 × 84 px". */
export function rectSummary(rect: Rect): string {
  return t('marking.rectSummary', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

/**
 * Detalhes da marcação: identidade, seção Marcação (nome, pai, posição e tamanho),
 * revisão, anotações por camada e exclusão.
 */
export function MarkingPanel({
  project,
  marking,
  image,
  readOnly,
  onDelete,
  onSelectMarking,
  onGoToAnnotation,
}: MarkingPanelProps) {
  const { actions, ui, derived } = useEditor();
  // O Editor recria o painel (via `key`) ao trocar de marcação, o que limpa o erro.
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const parentId = useId();

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

  const rectField = (key: keyof Rect, short: string, label: string) => (
    <label class="props-pair-item" title={label}>
      <span class="props-pair-label" aria-hidden="true">
        {short}
      </span>
      <TextField
        size="sm"
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        aria-label={label}
        disabled={readOnly}
        value={String(marking.rect[key])}
        onCommit={(text) => commitRect(key, text)}
      />
    </label>
  );

  const candidates = parentCandidates(project, marking.id);
  const where = [
    imageLabel(image),
    ...ancestorsOf(project, marking.id).reverse().map(markingLabel),
  ].join(t('marking.pathSeparator'));

  return (
    <div class="panel-details">
      <DetailsIdentity
        icon="marking"
        name={markingLabel(marking)}
        sub={t('marking.inImage', { file: where })}
        id={marking.id}
      />

      {marking.needsReview && (
        <div class="notice" role="status">
          <strong>⚠ {t('marking.needsReview')}</strong>
          <p>{t('marking.reviewMessage')}</p>
          <Button
            variant="primary"
            disabled={readOnly}
            onClick={() => report(actions.confirmMarkingReview(marking.id))}
          >
            {t('marking.confirmReview')}
          </Button>
        </div>
      )}

      <Section
        section={{ kind: 'marking' }}
        title={t('marking.section')}
        summary={rectSummary(marking.rect)}
      >
        <PropertyGrid>
          <Property label={t('marking.name')} for={nameId}>
            <TextField
              id={nameId}
              size="sm"
              value={marking.name ?? ''}
              placeholder={t('marking.namePlaceholder')}
              disabled={readOnly}
              onCommit={(text) => {
                // Espaços em volta não contam como alteração.
                if ((text.trim() || null) === marking.name) return false;
                return report(actions.renameMarking(marking.id, text));
              }}
            />
          </Property>
          <Property label={t('marking.parent')} for={parentId}>
            <Select
              id={parentId}
              size="sm"
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
            </Select>
          </Property>
          <Property label={t('marking.position')} hint={t('marking.pixelsHint')}>
            <div class="props-pair">
              {rectField('x', t('marking.x'), t('marking.x'))}
              {rectField('y', t('marking.y'), t('marking.y'))}
            </div>
          </Property>
          <Property label={t('marking.size')} hint={t('marking.pixelsHint')}>
            <div class="props-pair">
              {rectField('width', t('marking.widthShort'), t('marking.width'))}
              {rectField('height', t('marking.heightShort'), t('marking.height'))}
            </div>
          </Property>
        </PropertyGrid>
      </Section>

      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}

      <AnnotationsPanel
        project={project}
        marking={marking}
        layers={derived.visibleLayers.value}
        activeLayer={derived.activeLayer.value}
        readOnly={readOnly}
        onShowLayer={(layerId) => showLayer(ui, layerId)}
        onSelectMarking={onSelectMarking}
        onGoToAnnotation={onGoToAnnotation}
        focusAnnotation={ui.focusAnnotation.value}
        onFocusDone={() => (ui.focusAnnotation.value = null)}
      />

      <div class="row">
        <Button variant="danger" disabled={readOnly} onClick={() => onDelete(marking)}>
          {t('marking.delete')}
        </Button>
      </div>
    </div>
  );
}
