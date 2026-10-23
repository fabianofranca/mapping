import { useId, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import { ARROW_STYLES, type Arrow, type ArrowStyle, type Project } from '../model';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import type { ActionResult } from '../store/history';
import { showLayer, type AnnotationLocation } from '../store/ui';
import { AnnotationsPanel } from './AnnotationsPanel';
import { Button, IconButton, Segmented, TextField } from './controls';
import { useDetailsExtension } from './DetailsExtension';
import { DetailsIdentity } from './DetailsIdentity';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { arrowEnds, arrowText } from './labels';
import { Property, PropertyGrid } from './PropertyGrid';

interface ArrowPanelProps {
  readonly project: Project;
  readonly arrow: Arrow;
  readonly readOnly: boolean;
  readonly onDelete: (arrow: Arrow) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Mensagem de uma edição recusada da seta. */
export function arrowErrorMessage(code: string): string {
  return t(code === 'locked' ? 'arrow.error.locked' : 'arrow.error.generic');
}

/**
 * Detalhes da seta (decisão 14): identidade, seção Seta (nome, origem e destino, estilo),
 * anotações por camada no mesmo painel de sempre e exclusão. A seta é uma marcação que aponta:
 * as anotações dela se prendem pelo id, como as de uma marcação.
 */
export function ArrowPanel({
  project,
  arrow,
  readOnly,
  onDelete,
  onGoToAnnotation,
}: ArrowPanelProps) {
  const { actions, ui, derived } = useEditor();
  const ext = useDetailsExtension();
  // O Editor recria o painel (via `key`) ao trocar de seta, o que limpa o erro.
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  const report = (result: ActionResult): boolean => {
    setError(result.ok ? null : arrowErrorMessage(result.error));
    return result.ok;
  };

  const ends = arrowEnds(project, arrow);
  const identity = ext?.identity(arrow.id) ?? null;

  /** Seleciona a marcação da ponta (a seta fica à vista no canvas). */
  const selectEnd = (markingId: string) => {
    ui.selection.value = { kind: 'marking', id: markingId };
  };
  const endField = (label: TranslationKey, markingId: string, text: string) => {
    const exists = project.markings.some((m) => m.id === markingId);
    return (
      <Property label={t(label)}>
        {exists ? (
          <Button
            size="sm"
            variant="ghost"
            title={t('arrow.select', { name: text })}
            aria-label={t('arrow.select', { name: text })}
            onClick={() => selectEnd(markingId)}
          >
            {text}
          </Button>
        ) : (
          <span class="props-text muted">{text}</span>
        )}
      </Property>
    );
  };

  return (
    <div class="panel-details">
      <DetailsIdentity
        icon="arrow"
        name={arrowText(project, arrow)}
        sub={t('arrow.inView', { from: ends.from, to: ends.to })}
        id={arrow.id}
        flags={identity?.flags}
        struck={identity?.struck}
        actions={
          <IconButton
            icon={arrow.locked ? 'lock' : 'unlock'}
            label={t('arrow.lock')}
            tooltip={t(arrow.locked ? 'arrow.unlock' : 'arrow.lock')}
            shortcut={SHORTCUT_LABELS.toggleLock}
            pressed={arrow.locked}
            disabled={readOnly}
            onClick={() => report(actions.setArrowLocked(arrow.id, !arrow.locked))}
          />
        }
      />

      {ext?.header(arrow.id)}

      {arrow.locked && (
        <p class="notice notice-info" role="status">
          {t('arrow.lockNotice')}
        </p>
      )}

      <Section section={{ kind: 'arrow' }} title={t('arrow.section')} summary={ends.text}>
        <PropertyGrid>
          <Property label={t('arrow.name')} for={nameId}>
            <TextField
              id={nameId}
              size="sm"
              value={arrow.name ?? ''}
              placeholder={t('arrow.namePlaceholder')}
              disabled={readOnly}
              onCommit={(text) => {
                // Espaços em volta não contam como alteração.
                if ((text.trim() || null) === arrow.name) return false;
                return report(actions.setArrowName(arrow.id, text));
              }}
            />
          </Property>
          {endField('arrow.from', arrow.from, ends.from)}
          {endField('arrow.to', arrow.to, ends.to)}
          <Property label={t('arrow.style')}>
            <Segmented<ArrowStyle>
              label={t('arrow.style')}
              value={arrow.style}
              disabled={readOnly || arrow.locked}
              items={ARROW_STYLES.map((style) => ({
                id: style,
                label: t(`arrow.style.${style}` satisfies TranslationKey),
              }))}
              onSelect={(style) => {
                if (style !== arrow.style) report(actions.setArrowStyle(arrow.id, style));
              }}
            />
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
        marking={arrow}
        ownerKind="arrow"
        layers={derived.visibleLayers.value}
        activeLayer={derived.activeLayer.value}
        readOnly={readOnly}
        onShowLayer={(layerId) => showLayer(ui, layerId)}
        onGoToAnnotation={onGoToAnnotation}
        focusAnnotation={ui.focusAnnotation.value}
        onFocusDone={() => (ui.focusAnnotation.value = null)}
      />

      {ext?.others(arrow.id)}

      <div class="row">
        <Button
          variant="danger"
          disabled={readOnly || arrow.locked}
          title={arrow.locked ? t('lock.deleteBlocked') : undefined}
          onClick={() => onDelete(arrow)}
        >
          {t('arrow.delete')}
        </Button>
      </div>
    </div>
  );
}
