import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Rect } from '../../model';
import { projectIndex, typeOfAnnotation } from '../../model';
import { t } from '../../i18n';
import { dismissQuick, type QuickReviewView } from '../../store/quickReview';
import { showToast } from '../../store/ui';
import { Button, IconButton } from '../controls';
import { useEditor, type EditorContextValue } from '../EditorContext';
import { conversationFocusTarget } from '../toolWindowLayout';
import { RevisedFlag } from './RevisedFlag';
import { openReviewIn, useReviewCommands } from './useReviewCommands';

// The quick review bar (stage #1932, QR3, decisions 14 to 21): Reject · Review… · Accept under the
// ghost the canvas draws for a small proposal of the open conversation, the tag at the ghost's
// corner and the live region. It exists only while `quick.current` is not `null`. It is positioned
// from `view.quickReviewBox` through the `style` object (no `style=""`).

interface BarSize {
  readonly width: number;
  readonly height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * The bar's top-left: below the box, above it when it does not fit, clamped to the canvas area and,
 * when something else sits there (the minimap, the corner notices), moved beside or past it so
 * that nothing covers the bar and the bar covers nothing (finding CL1.2 and CL1.3 of #2743).
 */
export function barPosition(
  box: Rect,
  bar: BarSize,
  area: BarSize,
  gap: number,
  avoid: readonly Rect[] = [],
): { readonly left: number; readonly top: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const place = (left: number, top: number) => ({
    left: clamp(left, area.width - bar.width),
    top: clamp(top, area.height - bar.height),
  });
  const below = box.y + box.height + gap;
  const fits = below + bar.height <= area.height;
  const bases = fits
    ? [below, box.y - gap - bar.height]
    : [box.y - gap - bar.height, below];
  const candidates: { left: number; top: number }[] = [];
  for (const top of bases) {
    candidates.push(place(box.x, top));
    for (const a of avoid) {
      candidates.push(place(a.x - gap - bar.width, top));
      candidates.push(place(box.x, a.y - gap - bar.height));
      candidates.push(place(box.x, a.y + a.height + gap));
    }
  }
  const free = candidates.find((c) =>
    avoid.every((a) => !overlaps({ x: c.left, y: c.top, ...bar }, a)),
  );
  return free ?? candidates[0] ?? place(box.x, below);
}

/** The ghost's name: the marking's, else its typed annotation's type, else "{count} items". */
function tagName(view: QuickReviewView): string {
  const ids = [...view.created, ...view.changed];
  if (ids.length !== 1) return t('review.quick.tagItems', { count: ids.length });
  const index = projectIndex(view.preview);
  const marking = view.preview.markings.find((m) => m.id === ids[0]);
  if (marking?.name) return marking.name;
  for (const a of index.annotationsByMarking.get(ids[0] ?? '') ?? []) {
    const type = typeOfAnnotation(view.preview, a);
    if (type) return type.type.name;
  }
  return t('review.quick.tagItems', { count: 1 });
}

function countsText(view: QuickReviewView): string {
  const created = view.created.length;
  const changed = view.changed.length;
  if (changed === 0 && created === 1) return t('review.quick.countOne');
  if (changed === 0) return t('review.quick.countMany', { count: created });
  return t('review.quick.countMixed', { created, changed });
}

/** The agent's name: the proposal's author, else the author of the message that linked it. */
function agentName(view: QuickReviewView, editor: EditorContextValue): string {
  if (view.proposal.author) return view.proposal.author;
  const thread = editor.session.threads.list.value.find((x) => x.id === view.threadId);
  const message = thread?.messages.find((m) => m.proposal === view.proposal.id);
  return message?.author.name ?? '';
}

/** Rejects: hides the ghost and puts the focus in the conversation. */
function rejectAndFocus(editor: EditorContextValue, view: QuickReviewView): void {
  dismissQuick(editor.ui, view.proposal.id, view.proposal.revisions?.length ?? 0);
  queueMicrotask(() => conversationFocusTarget()?.focus());
}

function Tag({ view, box }: { readonly view: QuickReviewView; readonly box: Rect }) {
  const { ui } = useEditor();
  const peek = ui.quickPeek.value;
  const text = peek
    ? t('review.quick.tagPeek')
    : t('review.quick.tag', { name: tagName(view) });
  return (
    <span
      class="quick-tag"
      data-peek={peek ? '' : undefined}
      style={{ left: `${box.x}px`, top: `${box.y}px` }}
    >
      {text}
    </span>
  );
}

/** The peek: the real look shows while the pointer or the focus is inside the bar. */
function usePeek(ref: { readonly current: HTMLElement | null }): void {
  const { ui } = useEditor();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      ui.quickPeek.value = true;
    };
    const off = (e: Event) => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (!next || !el.contains(next)) ui.quickPeek.value = false;
    };
    const leave = () => {
      ui.quickPeek.value = false;
    };
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('focusin', on);
      el.removeEventListener('focusout', off);
      el.removeEventListener('pointerenter', on);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref, ui]);
}

/** Accept: the toast on success, the usual refusal text otherwise. */
function useAccept(title: string): () => Promise<void> {
  const { quick, ui } = useEditor();
  const { report } = useReviewCommands();
  return async () => {
    const result = await quick.accept();
    if (!result) return;
    if (result.ok) showToast(ui, t('review.quick.applied', { title }));
    else report(result.error, result.path);
  };
}

function Head({ view }: { readonly view: QuickReviewView }) {
  const editor = useEditor();
  return (
    <div class="quick-bar-head">
      <b>{t('review.quick.title')}</b>
      <span class="muted">
        {t('review.quick.from', { agent: agentName(view, editor) })}
        {countsText(view)}
      </span>
      {view.revised > 0 && <RevisedFlag badge={{ kind: 'contains' }} />}
    </div>
  );
}

function Actions({ view, box }: { readonly view: QuickReviewView; readonly box: Rect }) {
  const editor = useEditor();
  const { quick, view: canvasView, canvas } = editor;
  const accept = useAccept(view.proposal.title);
  const open = view.blocked === null;
  const busy = quick.accepting.value;
  const locate = () => {
    // The box is in CSS px of the canvas host; the view centers on canvas units.
    const vp = canvasView.viewport.peek();
    canvas.current?.centerOnPoint({
      x: (box.x + box.width / 2 - vp.x) / vp.scale,
      y: (box.y + box.height / 2 - vp.y) / vp.scale,
    });
  };
  return (
    <div class="quick-bar-actions">
      <IconButton icon="locate" label={t('review.quick.locate')} onClick={locate} />
      {open && (
        <Button disabled={busy} onClick={() => rejectAndFocus(editor, view)}>
          {t('review.quick.reject')}
        </Button>
      )}
      <Button
        disabled={busy}
        onClick={() => openReviewIn(editor, view.proposal.id, view.threadId)}
      >
        {t('review.quick.review')}
      </Button>
      {open && (
        <Button variant="primary" disabled={busy} onClick={accept}>
          {t('review.quick.accept')}
        </Button>
      )}
    </div>
  );
}

/** The other overlays of the canvas area (the minimap, the corner notices), in the area's px. */
function measureAvoid(el: HTMLElement): Rect[] {
  const parent = el.offsetParent;
  if (!parent) return [];
  const origin = parent.getBoundingClientRect();
  const others = parent.querySelectorAll('.minimap, .canvas-corner > *');
  return [...others].map((o) => {
    const r = o.getBoundingClientRect();
    return {
      x: r.left - origin.left,
      y: r.top - origin.top,
      width: r.width,
      height: r.height,
    };
  });
}

const sameRects = (a: readonly Rect[], b: readonly Rect[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.x === b[i]?.x &&
      r.y === b[i]?.y &&
      r.width === b[i]?.width &&
      r.height === b[i]?.height,
  );

/** What the bar keeps clear of; measured again when the area's children or their style change. */
function useAvoid(ref: { readonly current: HTMLElement | null }): readonly Rect[] {
  const [avoid, setAvoid] = useState<readonly Rect[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const update = () => {
      const next = measureAvoid(el);
      setAvoid((prev) => (sameRects(prev, next) ? prev : next));
    };
    update();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(update);
    observer.observe(parent, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => observer.disconnect();
  }, [ref]);
  return avoid;
}

function Bar({ view, box }: { readonly view: QuickReviewView; readonly box: Rect }) {
  const editor = useEditor();
  const { ui, view: canvasView } = editor;
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<BarSize>({ width: 0, height: 0 });
  usePeek(ref);
  const avoid = useAvoid(ref);
  // The bar's own size places it: measured after each change of what it shows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, [view.blocked, view.revised]);
  const gap = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--space-2'),
  );
  const pos = barPosition(
    box,
    size,
    canvasView.size.value,
    Number.isNaN(gap) ? 0 : gap,
    avoid,
  );
  const { title } = view.proposal;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || view.blocked !== null) return;
    e.preventDefault();
    e.stopPropagation();
    rejectAndFocus(editor, view);
  };
  return (
    <>
      <Tag view={view} box={box} />
      <div
        ref={ref}
        class="quick-bar"
        role="group"
        aria-label={t('review.quick.groupLabel', { title })}
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onKeyDown={onKeyDown}
      >
        <Head view={view} />
        {view.blocked !== null && (
          <p class="quick-bar-reason">{t(`review.quick.block.${view.blocked}`)}</p>
        )}
        <Actions view={view} box={box} />
        <p class="quick-bar-hint muted">
          {ui.quickPeek.value ? t('review.quick.hintPeek') : t('review.quick.hint')}
        </p>
      </div>
      <div
        key={view.proposal.revisions?.length ?? 0}
        class="visually-hidden"
        role="status"
        aria-live="polite"
      >
        {t('review.quick.live', { title })}
      </div>
    </>
  );
}

export function QuickReviewBar() {
  const { quick, view: canvasView } = useEditor();
  const view = quick.current.value;
  const box = canvasView.quickReviewBox.value;
  if (view === null || box === null) return null;
  return <Bar view={view} box={box} />;
}
