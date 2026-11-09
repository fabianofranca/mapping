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

// Controles do canvas na revisão (HANDOFF-PROPOSALS 4.6 e 5.2): Atual / Proposto (P), a
// legenda das marcas (L) e "Comparar" na imagem trocada, que abre o ImageCompare.

/** O botão "Legenda das marcas", para onde o foco volta ao fechar a legenda. */
const legendToggle = createRef<HTMLButtonElement>();
/** O painel da legenda, para saber se o foco está dentro dele. */
const legendPanel = createRef<HTMLElement>();

/**
 * Alterna a legenda (botão e atalho L). Ao fechar com o foco dentro dela, devolve-o ao
 * botão que a abre: o painel sai do DOM e o foco cairia no body.
 */
export function toggleReviewLegend(ui: { readonly reviewLegend: Signal<boolean> }) {
  const open = ui.reviewLegend.peek();
  if (open && legendPanel.current?.contains(document.activeElement)) {
    legendToggle.current?.focus();
  }
  ui.reviewLegend.value = !open;
}

/**
 * Esc com a legenda aberta e o foco no botão que a abre ou no canvas (ou em nenhum controle):
 * fecha só a legenda e deixa o foco onde estava, para o Esc seguinte fazer o de antes (limpar a
 * seleção). Com o foco dentro da legenda quem fecha é o painel dela; em outro lugar (Propostas,
 * Detalhes) o Esc é de quem tem o foco. Devolve `true` quando consumiu o Esc.
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
  const { review, ui } = useEditor();
  const p = review.derived.proposal.value;
  const selection = ui.selection.value;
  // O projeto à vista: a marcação que só existe na proposta resolve pela prévia.
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

/** Atual / Proposto, a legenda e "Comparar" (barra dos breadcrumbs). */
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
 * Posiciona a legenda (que é `position: fixed`, para não ser recortada pelo canvas): o
 * canto superior esquerdo do canvas, a largura da coluna dele e a altura até o fim das
 * janelas (o topo da barra de status). Entrega as medidas ao CSS em variáveis; o espaço e a margem vêm dos
 * tokens, não daqui.
 */
function useLegendPlacement(legend: { readonly current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const el = legend.current;
    const area = el?.closest<HTMLElement>('[data-canvas-area]');
    if (!el || !area) return;
    const place = () => {
      const a = area.getBoundingClientRect();
      // O fim das janelas é o topo da barra de status.
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

/** Legenda das marcas do canvas (L), sobre o canvas e, se não couber nele, sobre as janelas. */
export function ReviewLegend() {
  const { review, ui } = useEditor();
  if (review.proposalId.value === null || !ui.reviewLegend.value) return null;
  return <LegendPanel />;
}

function LegendPanel() {
  const { ui } = useEditor();
  const panel = legendPanel;
  useLegendPlacement(panel);
  // Fechar (X ou Esc) devolve o foco ao botão que a abre, nunca ao body (etapa #515, FN1).
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

/** Diálogo "Comparar antes e depois" da imagem trocada, com a decisão da troca. */
export function CompareDialog() {
  const { review, ui, store, display } = useEditor();
  const decide = useDecide();
  const imageId = ui.compareImage.value;
  const p = review.derived.proposal.value;
  // A imagem "antes" é a do projeto confirmado por definição (não a da visão): é a base
  // da comparação com o arquivo proposto.
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
