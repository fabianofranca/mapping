import { useId, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import { ARROW_STYLES, type Arrow, type ArrowStyle, type Project } from '../model';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import type { ActionResult } from '../store/history';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationsPanel } from './AnnotationsPanel';
import { ThreadsSection } from './comments/ThreadsSection';
import { Button, HelpTip, IconButton, Segmented, TextField } from './controls';
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
  /** Opens the Settings (the notice about a thread without identity leads there). */
  readonly onOpenSettings?: () => void;
}

/** Message for a refused arrow edit. */
export function arrowErrorMessage(code: string): string {
  return t(code === 'locked' ? 'arrow.error.locked' : 'arrow.error.generic');
}

/**
 * Arrow Details (decision 14): identity, Arrow section (name, origin and destination, style),
 * annotations per layer in the same panel as always, and deletion. The arrow is a marking that points:
 * its annotations attach by id, like those of a marking.
 */
export function ArrowPanel({
  project,
  arrow,
  readOnly,
  onDelete,
  onGoToAnnotation,
  onOpenSettings,
}: ArrowPanelProps) {
  const { actions, ui, derived, layers } = useEditor();
  const ext = useDetailsExtension();
  // The Editor recreates the panel (via `key`) when switching arrows, which clears the error.
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  const report = (result: ActionResult): boolean => {
    setError(result.ok ? null : arrowErrorMessage(result.error));
    return result.ok;
  };

  const ends = arrowEnds(project, arrow);
  const identity = ext?.identity(arrow.id) ?? null;

  /** Selects the marking at the tip (the arrow stays in view on the canvas). */
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
          <>
            <span class="identity-lock">
              {arrow.locked && (
                <HelpTip name={t('lock.helpName')} text={t('arrow.lockNotice')} />
              )}
              <IconButton
                icon={arrow.locked ? 'lock' : 'unlock'}
                label={t('arrow.lock')}
                shortcut={SHORTCUT_LABELS.toggleLock}
                pressed={arrow.locked}
                disabled={readOnly}
                onClick={() => report(actions.setArrowLocked(arrow.id, !arrow.locked))}
              />
            </span>
          </>
        }
      />

      {ext?.header(arrow.id)}

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
                // Surrounding whitespace does not count as a change.
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
        readOnly={readOnly}
        onShowLayer={layers.show}
        onGoToAnnotation={onGoToAnnotation}
        focusAnnotation={ui.focusAnnotation.value}
        onFocusDone={() => (ui.focusAnnotation.value = null)}
      />

      <ThreadsSection
        itemId={arrow.id}
        anchor={{ kind: 'arrow', id: arrow.id }}
        onOpenSettings={onOpenSettings}
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
