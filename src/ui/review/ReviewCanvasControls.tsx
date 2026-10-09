import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { t } from '../../i18n';
import {
  changeImageFile,
  projectIndex,
  proposalImagePath,
  type Change,
  type Proposal,
} from '../../model';
import { resolveSelection } from '../../store/ui';
import { Button, IconButton, Segmented } from '../controls';
import { Dialog } from '../Dialog';
import { useEditor } from '../EditorContext';
import { Icon } from '../icons';
import { imageLabel } from '../labels';
import { ChangeKind } from './ChangeKind';
import { DecisionControl, REVIEW_KEYS } from './DecisionControl';
import { ImageCompare } from './ImageCompare';
import { useDecide } from './useReview';

// Controles do canvas na revisão (HANDOFF-PROPOSALS 4.6 e 5.2): Atual / Proposto (P), a
// legenda das marcas (L) e "Comparar" na imagem trocada, que abre o ImageCompare.

/** A troca de arquivo da imagem ainda não aplicada (a que "Comparar" mostra). */
export function replaceChangeOf(p: Proposal, imageId: string): Change | null {
  return (
    p.changes.find(
      (c) =>
        c.entity === 'image' &&
        c.entityId === imageId &&
        c.kind === 'update' &&
        c.field === 'file' &&
        !Object.hasOwn(p.applied, c.id),
    ) ?? null
  );
}

/** Imagem selecionada (ou a da marcação selecionada) que a proposta troca. */
function useComparable(): string | null {
  const { review, ui, store } = useEditor();
  const p = review.derived.proposal.value;
  const selection = ui.selection.value;
  const project = store.committed.value;
  if (!p || !selection || !project) return null;
  const imageId =
    selection.kind === 'image'
      ? selection.id
      : (resolveSelection(project, selection)?.image.id ??
        p.changes.find((c) => c.markingId === selection.id)?.imageId ??
        null);
  return imageId && replaceChangeOf(p, imageId) ? imageId : null;
}

export function ReviewViewToggle() {
  const { review } = useEditor();
  return (
    <Segmented
      label={t('review.view.label')}
      value={review.view.value}
      onSelect={(view) => review.setView(view)}
      items={[
        {
          id: 'current',
          label: t('review.view.current'),
          shortcut: REVIEW_KEYS.toggleView,
        },
        {
          id: 'proposed',
          label: t('review.view.proposed'),
          shortcut: REVIEW_KEYS.toggleView,
        },
      ]}
    />
  );
}

/** Atual / Proposto, a legenda e "Comparar" (barra dos breadcrumbs, no desktop). */
export function ReviewCanvasControls({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const { review, ui } = useEditor();
  const comparable = useComparable();
  if (review.proposalId.value === null) return null;
  return (
    <span class="review-canvas-controls">
      <ReviewViewToggle />
      <IconButton
        icon="info"
        label={t('review.legend.open')}
        shortcut={compact ? undefined : REVIEW_KEYS.legend}
        pressed={ui.reviewLegend.value}
        onClick={() => (ui.reviewLegend.value = !ui.reviewLegend.peek())}
      />
      {comparable && (
        <IconButton
          icon="compare"
          label={t('review.compare.open')}
          text={compact ? undefined : t('review.compare.button')}
          onClick={() => (ui.compareImage.value = comparable)}
        />
      )}
    </span>
  );
}

/** Legenda das marcas do canvas (L), sobre o canvas. */
export function ReviewLegend() {
  const { review, ui } = useEditor();
  if (review.proposalId.value === null || !ui.reviewLegend.value) return null;
  const close = () => (ui.reviewLegend.value = false);
  const rows: readonly [ComponentChildren, string][] = [
    [<ChangeKind type="created" size="sm" decorative />, t('review.legend.created')],
    [<ChangeKind type="moved" size="sm" decorative />, t('review.legend.moved')],
    [<ChangeKind type="removed" size="sm" decorative />, t('review.legend.removed')],
    [<ChangeKind type="changed" size="sm" decorative />, t('review.legend.changed')],
    [<ChangeKind type="replaced" size="sm" decorative />, t('review.legend.replaced')],
    [
      <span class="legend-glyph legend-glyph-warn">
        <Icon name="warning" />
      </span>,
      t('review.legend.conflict'),
    ],
    [
      <span class="legend-glyph legend-glyph-rejected">
        <Icon name="close" />
      </span>,
      t('review.legend.rejected'),
    ],
    [
      <span class="legend-glyph legend-glyph-invalid">
        <Icon name="warning" />
      </span>,
      t('review.legend.invalid'),
    ],
    [
      <span class="legend-glyph">
        <Icon name="lock" />
      </span>,
      t('review.legend.locked'),
    ],
  ];
  return (
    <section class="review-legend" aria-label={t('review.legend.title')}>
      <header class="review-legend-head">
        <h2>{t('review.legend.title')}</h2>
        <IconButton icon="close" size="sm" label={t('dialog.close')} onClick={close} />
      </header>
      <ul>
        {rows.map(([glyph, text]) => (
          <li key={text}>
            {glyph}
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p class="muted">{t('review.legend.note')}</p>
    </section>
  );
}

/** Diálogo "Comparar antes e depois" da imagem trocada, com a decisão da troca. */
export function CompareDialog() {
  const { review, ui, store, display } = useEditor();
  const decide = useDecide();
  const imageId = ui.compareImage.value;
  const p = review.derived.proposal.value;
  const project = store.committed.value;
  const change = p && imageId ? replaceChangeOf(p, imageId) : null;
  const image =
    project && imageId ? projectIndex(project).images.get(imageId) : undefined;
  const newFile = change ? changeImageFile(change) : null;
  const afterPath = p && newFile ? proposalImagePath(p.id, newFile) : null;
  useEffect(() => {
    if (image) display.ensure(image.file);
    if (afterPath) display.ensure(afterPath);
  }, [image, afterPath, display]);
  if (!imageId || !p || !change || !afterPath || !newFile) return null;
  const close = () => (ui.compareImage.value = null);
  const bitmaps = display.images.value;
  const name = image ? imageLabel(image) : imageId;
  const decision = p.decisions[change.id]?.state ?? null;
  return (
    <Dialog
      title={t('review.compare.title', { name })}
      size="lg"
      onCancel={close}
      actions={<Button onClick={close}>{t('common.close')}</Button>}
    >
      <ImageCompare
        before={image ? bitmaps.get(image.file) : undefined}
        after={bitmaps.get(afterPath)}
        beforeName={image?.file ?? ''}
        afterName={newFile}
      />
      <div class="image-compare-decision">
        <ChangeKind type="replaced" />
        <span>{t('review.compare.decide')}</span>
        <DecisionControl
          variant="text"
          value={decision}
          name={t('review.compare.decisionName', { name })}
          acceptText={t('review.compare.accept')}
          rejectText={t('review.compare.reject')}
          disabled={p.status !== 'open'}
          onDecide={(state) => decide({ level: 'change', id: change.id }, state)}
        />
      </div>
    </Dialog>
  );
}
