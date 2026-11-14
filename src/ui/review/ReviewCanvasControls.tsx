import type { Signal } from '@preact/signals';
import { createRef, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect } from 'preact/hooks';
import { arrowsBelongToEditor } from '../../app/shortcuts';
import { t } from '../../i18n';
import {
  arrowContainerId,
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

// Canvas controls in review (HANDOFF-PROPOSALS 4.6 and 5.2): Current / Proposed (P), the
// mark legend (L) and "Compare" on the swapped image, which opens the ImageCompare.

/** The "Mark legend" button, where focus returns to when the legend closes. */
const legendToggle = createRef<HTMLButtonElement>();
/** The legend panel, to know whether focus is inside it. */
const legendPanel = createRef<HTMLElement>();

/**
  * Toggles the legend (button and L shortcut). On closing with focus inside it, gives it back to
  * the button that opens it: the panel leaves the DOM and focus would fall on body.
 */
export function toggleReviewLegend(ui: { readonly reviewLegend: Signal<boolean> }) {
  const open = ui.reviewLegend.peek();
  if (open && legendPanel.current?.contains(document.activeElement)) {
    legendToggle.current?.focus();
  }
  ui.reviewLegend.value = !open;
}

/**
  * Esc with the legend open and focus on the button that opens it or on the canvas (or on no control):
  * closes only the legend and leaves focus where it was, so the next Esc does what it did before
  * (clear the selection). With focus inside the legend, the panel itself closes it; elsewhere
  * (Proposals, Details) Esc belongs to whoever has focus. Returns `true` when it consumed Esc.
 */
export function closeReviewLegendOnEscape(ui: {
  readonly reviewLegend: Signal<boolean>;
}): boolean {
  if (!ui.reviewLegend.peek()) return false;
  const active = document.activeElement;
  if (legendPanel.current?.contains(active)) return false;
  if (active !== legendToggle.current && !arrowsBelongToEditor(active)) return false;
  ui.reviewLegend.value = false;
  return true;
}

/** The image file swap not yet applied (the one "Compare" shows). */
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

/** Selected image (or that of the selected marking) which the proposal swaps. */
function useComparable(): string | null {
  const { review, ui } = useEditor();
  const p = review.derived.proposal.value;
  const selection = ui.selection.value;
  // The project in view: a marking that only exists in the proposal resolves through the preview.
  const project = review.derived.shownProject.value;
  if (!p || !selection || !project) return null;
  const resolved =
    selection.kind === 'image' ? null : resolveSelection(project, selection);
  const imageId =
    selection.kind === 'image'
      ? selection.id
      : ((resolved?.kind === 'arrow'
          ? arrowContainerId(project, resolved.arrow)
          : resolved?.image?.id) ??
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

/** Current / Proposed, the legend and "Compare" (breadcrumbs bar). */
export function ReviewCanvasControls() {
  const { review, ui } = useEditor();
  const comparable = useComparable();
  if (review.proposalId.value === null) return null;
  return (
    <span class="review-canvas-controls">
      <ReviewViewToggle />
      <IconButton
        icon="info"
        label={t('review.legend.open')}
        shortcut={REVIEW_KEYS.legend}
        pressed={ui.reviewLegend.value}
        buttonRef={legendToggle}
        onClick={() => toggleReviewLegend(ui)}
      />
      {comparable && (
        <IconButton
          icon="compare"
          label={t('review.compare.open')}
          text={t('review.compare.button')}
          onClick={() => (ui.compareImage.value = comparable)}
        />
      )}
    </span>
  );
}

/**
  * Positions the legend (which is `position: fixed`, so the canvas does not clip it): the
  * canvas's top-left corner, its column's width and the height down to the end of the
  * windows (the top of the status bar). Hands the measurements to the CSS in variables; the
  * spacing and margin come from the tokens, not from here.
 */
function useLegendPlacement(legend: { readonly current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const el = legend.current;
    const area = el?.closest<HTMLElement>('[data-canvas-area]');
    if (!el || !area) return;
    const place = () => {
      const a = area.getBoundingClientRect();
      // The end of the windows is the top of the status bar.
      const panes = area.closest<HTMLElement>('[data-panes]');
      const bottom = panes?.getBoundingClientRect().bottom ?? globalThis.innerHeight;
      el.style.setProperty('--legend-top', `${a.top}px`);
      el.style.setProperty('--legend-left', `${a.left}px`);
      el.style.setProperty('--legend-width', `${a.width}px`);
      el.style.setProperty('--legend-room', `${Math.max(0, bottom - a.top)}px`);
    };
    place();
    globalThis.addEventListener('resize', place);
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(area);
    return () => {
      globalThis.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [legend]);
}

/** Mark legend (L), over the canvas and, if it does not fit there, over the windows. */
export function ReviewLegend() {
  const { review, ui } = useEditor();
  if (review.proposalId.value === null || !ui.reviewLegend.value) return null;
  return <LegendPanel />;
}

function LegendPanel() {
  const { ui } = useEditor();
  const panel = legendPanel;
  useLegendPlacement(panel);
  // Closing (X or Esc) gives focus back to the button that opens it, never to body (stage #515, FN1).
  const close = () => {
    ui.reviewLegend.value = false;
    legendToggle.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
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
    <section
      class="review-legend"
      ref={panel}
      aria-label={t('review.legend.title')}
      onKeyDown={onKeyDown}
    >
      <header class="review-legend-head">
        <h2>{t('review.legend.title')}</h2>
        <IconButton
          icon="close"
          size="sm"
          label={t('review.legend.close')}
          onClick={close}
        />
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

/** "Compare before and after" dialog of the swapped image, with the swap's decision. */
export function CompareDialog() {
  const { review, ui, store, display } = useEditor();
  const decide = useDecide();
  const imageId = ui.compareImage.value;
  const p = review.derived.proposal.value;
  // The "before" image is the confirmed project's by definition (not the view's): it is the base
  // of the comparison with the proposed file.
  const project = store.committed.value;
  const change = p && imageId ? replaceChangeOf(p, imageId) : null;
  const image =
    project && imageId ? projectIndex(project).containers.get(imageId) : undefined;
  const newFile = change ? changeImageFile(change) : null;
  const afterPath = p && newFile ? proposalImagePath(p.id, newFile) : null;
  useEffect(() => {
    if (image?.file) display.ensure(image.file);
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
      actions={
        <>
          <div class="image-compare-decision">
            <ChangeKind type="replaced" />
            <span>{t('review.compare.decide')}</span>
            <DecisionControl
              variant="text"
              value={decision}
              name={name}
              acceptText={t('review.compare.accept')}
              rejectText={t('review.compare.reject')}
              disabled={p.status !== 'open'}
              onDecide={(state) => decide({ level: 'change', id: change.id }, state)}
            />
          </div>
          <Button onClick={close}>{t('common.close')}</Button>
        </>
      }
    >
      <ImageCompare
        before={image?.file ? bitmaps.get(image.file) : undefined}
        after={bitmaps.get(afterPath)}
        beforeName={image?.file ?? ''}
        afterName={newFile}
      />
    </Dialog>
  );
}
