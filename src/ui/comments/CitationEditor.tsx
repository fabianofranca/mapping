import type { Ref } from 'preact';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { t } from '../../i18n';
import {
  citationLabel,
  citationUrl,
  citeCandidates,
  composerToMarkdown,
  markdownToComposer,
  pasteToParts,
  resolveCitation,
  type CiteCandidate,
  type CitationTarget,
  type ComposerPart,
  type PasteResolver,
  type ThreadAnchor,
} from '../../model';
import { registerComposer } from '../../store/composerBridge';
import { CitePicker, optionId } from './CitePicker';
import {
  citationNameFallback,
  describeCitation,
  useCitationContext,
  type CitationUiContext,
} from './citationContext';
import {
  caretAcross,
  chipBeside,
  clearIfBlank,
  createChip,
  endPoint,
  insertBreak,
  insertNodes,
  isChip,
  placeChip,
  rangeIn,
  readParts,
  renderParts,
  setCaret,
  splitAt,
  syncFill,
  textNodes,
  triggerAt,
  updateChip,
  type ChipSpec,
  type Point,
  type Trigger,
} from './editorDom';

// The citation editor of the composer (Comments stage, CM5, decision 30): a `contenteditable`
// in place of the `TextArea`. The value remains a markdown string (`ui.threadDrafts`); the
// citation `[label](mapping://…)` appears as a chip. Enter breaks the line, Ctrl/Cmd+Enter sends,
// `@` opens the item picker, pasting enters as plain text (`mapping://` URLs become a chip).

interface CitationEditorProps {
  /** Accessible name of the field (and visible label): "Comment as …" / "Reply as …". */
  readonly label: string;
  /** The markdown (the draft); comes in and goes out as in the `TextArea`. */
  readonly value: string;
  readonly onInput: (value: string) => void;
  /** Ctrl/Cmd+Enter. */
  readonly onSubmit?: () => void;
  /** The thread's anchor: the "here" group of `@` is the annotations of its item. */
  readonly anchor: ThreadAnchor | null;
  /** In a reply, the thread itself is not offered for citing. */
  readonly excludeThreadId?: string;
  /** Reference to the field (the composer focuses it on mount). */
  readonly editorRef?: Ref<HTMLDivElement>;
}

type ChipPart = Extract<ComposerPart, { type: 'chip' }>;

// ------------------------------------------------------------------ chips

function chipSpec(ctx: CitationUiContext | null, url: string, label: string): ChipSpec {
  const view = describeCitation(ctx, url, label);
  return {
    url,
    name: view.name,
    broken: view.broken,
    ariaLabel: t('citation.chipLabel', { name: view.name }),
    title: t('citation.missing'),
  };
}

/** The chip of a target, with the current name; `null` if the target has no URL in the project. */
function chipFor(ctx: CitationUiContext, target: CitationTarget): HTMLElement | null {
  const url = citationUrl(ctx.projectName, ctx.project, ctx.threads, target);
  if (url === null) return null;
  const label = citationLabel(ctx, target, citationNameFallback());
  return createChip(document, chipSpec(ctx, url, label));
}

/** Updates the name and state of all chips; returns whether any changed. */
function refreshChips(root: HTMLElement, ctx: CitationUiContext | null): boolean {
  let changed = false;
  for (const chip of root.querySelectorAll<HTMLElement>('span[data-url]')) {
    if (!isChip(chip)) continue;
    const spec = chipSpec(ctx, chip.dataset.url ?? '', chip.dataset.label ?? '');
    changed = updateChip(chip, spec) || changed;
  }
  return changed;
}

/** The markdown of what is in the field (the chip stores the live label). */
function readMarkdown(root: HTMLElement): string {
  return composerToMarkdown(readParts(root), citationNameFallback());
}

// ------------------------------------------------------------------ value ⇄ DOM

/**
 * Keeps the DOM and the value in sync: the outside value only rebuilds the DOM when it differs from what the
 * field itself last emitted (otherwise the cursor would be lost); the chip names follow the
 * project. Returns `emit`, which reads the DOM and notifies the user when the markdown changed.
 */
function useDocSync(
  root: { readonly current: HTMLElement | null },
  ctx: CitationUiContext | null,
  value: string,
  onInput: (value: string) => void,
): () => void {
  const emitted = useRef<string | null>(null);
  const notify = useRef(onInput);
  notify.current = onInput;
  const emit = useRef(() => {
    const el = root.current;
    if (!el) return;
    const markdown = readMarkdown(el);
    if (markdown === emitted.current) return;
    emitted.current = markdown;
    notify.current(markdown);
  }).current;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (value !== emitted.current) {
      emitted.current = value;
      renderParts(el, markdownToComposer(value), (part: ChipPart) =>
        chipSpec(ctx, part.url, part.label),
      );
      if (el.ownerDocument.activeElement === el) {
        setCaret(el.ownerDocument, endPoint(el));
      }
    } else refreshChips(el, ctx);
    // An old draft, or a renamed target, stores the live label.
    emit();
    // `emit` and `root` are stable (references); only the value and the project redo the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ctx]);
  return emit;
}

// ------------------------------------------------------------------ the @ picker

interface PickerState {
  readonly trigger: Trigger;
  readonly active: number;
}

interface PickerControl {
  readonly visible: boolean;
  readonly candidates: readonly CiteCandidate[];
  readonly active: number;
  /** Rereads the cursor: opens, updates or closes the picker. */
  sync(): void;
  move(step: number): void;
  close(): void;
  /** Dismisses the current `@` until another appears. */
  dismiss(): void;
  pick(candidate: CiteCandidate | undefined): void;
}

function sameTrigger(a: Trigger, b: Trigger): boolean {
  return a.node === b.node && a.start === b.start && a.term === b.term;
}

function usePicker(
  root: { readonly current: HTMLElement | null },
  ctx: CitationUiContext | null,
  anchor: ThreadAnchor | null,
  excludeThreadId: string | undefined,
  afterEdit: () => void,
): PickerControl {
  const [state, setState] = useState<PickerState | null>(null);
  const dismissed = useRef<{ node: Node; start: number } | null>(null);
  const term = state?.trigger.term;
  const candidates = useMemo(
    () =>
      ctx === null || term === undefined
        ? []
        : citeCandidates(ctx, term, anchor, {
            unnamed: citationNameFallback(),
            excludeThreadId,
          }),
    [ctx, term, anchor, excludeThreadId],
  );
  const visible = state !== null && candidates.length > 0;
  const active = state === null ? 0 : Math.min(state.active, candidates.length - 1);

  const sync = () => {
    const el = root.current;
    const range = el ? rangeIn(el) : null;
    const trigger = range?.collapsed
      ? triggerAt(range.startContainer, range.startOffset)
      : null;
    const gone = dismissed.current;
    if (trigger === null) dismissed.current = null;
    if (
      trigger === null ||
      (gone?.node === trigger.node && gone.start === trigger.start)
    ) {
      return setState(null);
    }
    setState((prev) =>
      prev && sameTrigger(prev.trigger, trigger) ? prev : { trigger, active: 0 },
    );
  };

  const pick = (candidate: CiteCandidate | undefined) => {
    const el = root.current;
    if (!state || !el || !ctx || !candidate) return;
    const chip = chipFor(ctx, candidate.target);
    if (chip === null) return;
    const { trigger } = state;
    const { parent, ref } = splitAt({ node: trigger.node, offset: trigger.end });
    trigger.node.data = trigger.node.data.slice(0, trigger.start);
    setCaret(el.ownerDocument, placeChip(parent, ref, chip));
    setState(null);
    afterEdit();
  };

  return {
    visible,
    candidates,
    active,
    sync,
    move: (step) =>
      setState((prev) =>
        prev && candidates.length > 0
          ? { ...prev, active: (active + step + candidates.length) % candidates.length }
          : prev,
      ),
    close: () => setState(null),
    dismiss: () => {
      if (state)
        dismissed.current = { node: state.trigger.node, start: state.trigger.start };
      setState(null);
    },
    pick,
  };
}

// ------------------------------------------------------------------ bridge

/** Registers the field in the "Cite in the thread" bridge while it is mounted. */
function useBridge(insert: (target: CitationTarget) => void): void {
  const latest = useRef(insert);
  latest.current = insert;
  useEffect(() => registerComposer({ insert: (target) => latest.current(target) }), []);
}

// ------------------------------------------------------------------ keyboard

const hasModifier = (e: KeyboardEvent) =>
  e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
const isSend = (e: KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey);

interface Keys {
  readonly root: HTMLElement;
  readonly picker: PickerControl;
  readonly submit: () => void;
  readonly afterEdit: () => void;
}

/** ↑/↓ move, Enter chooses, Esc dismisses, Tab closes. `true` = the key belonged to the picker. */
function pickerKey(e: KeyboardEvent, keys: Keys): boolean {
  const { picker } = keys;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    picker.move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    picker.pick(picker.candidates[picker.active]);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    picker.dismiss();
  } else {
    if (e.key === 'Tab') picker.close();
    return false;
  }
  e.preventDefault();
  return true;
}

function lineBreak(keys: Keys): void {
  const { root } = keys;
  const range = rangeIn(root);
  range?.deleteContents();
  const point = range
    ? { node: range.startContainer, offset: range.startOffset }
    : endPoint(root);
  const { ref } = splitAt(point);
  setCaret(root.ownerDocument, insertBreak(root, ref));
  keys.afterEdit();
}

/** Backspace/Delete next to a chip deletes the whole chip. */
function deleteChip(e: KeyboardEvent, keys: Keys): void {
  const range = rangeIn(keys.root);
  if (!range?.collapsed) return;
  const dir = e.key === 'Backspace' ? 'back' : 'forward';
  const chip = chipBeside(range.startContainer, range.startOffset, dir);
  if (!chip) return;
  e.preventDefault();
  const point = caretAcross(chip, 'back');
  chip.remove();
  setCaret(keys.root.ownerDocument, point);
  keys.afterEdit();
}

/** The arrows pass over the chip as over a single word. */
function crossChip(e: KeyboardEvent, keys: Keys): void {
  const range = rangeIn(keys.root);
  if (!range?.collapsed || hasModifier(e)) return;
  const dir = e.key === 'ArrowLeft' ? 'back' : 'forward';
  const chip = chipBeside(range.startContainer, range.startOffset, dir);
  if (!chip) return;
  e.preventDefault();
  setCaret(keys.root.ownerDocument, caretAcross(chip, dir));
  keys.picker.sync();
}

function onEditorKey(e: KeyboardEvent, keys: Keys): void {
  if (e.isComposing) return;
  if (isSend(e)) {
    e.preventDefault();
    keys.submit();
  } else if (keys.picker.visible && pickerKey(e, keys)) {
    return;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    lineBreak(keys);
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    deleteChip(e, keys);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    crossChip(e, keys);
  }
}

// ------------------------------------------------------------------ paste and insert

/** For pasting: the URL's target in the visible project, with the live label and the canonical URL. */
function pasteResolver(ctx: CitationUiContext | null): PasteResolver {
  return (parsed) => {
    if (ctx === null) return null;
    const resolution = resolveCitation(ctx, parsed.ref);
    if (!resolution.found) return null;
    const { target } = resolution;
    const url = citationUrl(ctx.projectName, ctx.project, ctx.threads, target);
    if (url === null) return null;
    return { url, label: citationLabel(ctx, target, citationNameFallback()) };
  };
}

function partNodes(
  ctx: CitationUiContext | null,
  parts: readonly ComposerPart[],
): Node[] {
  return parts.flatMap((part) =>
    part.type === 'chip'
      ? [createChip(document, chipSpec(ctx, part.url, part.label))]
      : textNodes(document, part.text),
  );
}

/** The insertion point: the field's selection (deleting the selected span) or its end. */
function insertionPoint(root: HTMLElement, useSelection: boolean): Point {
  const range = useSelection ? rangeIn(root) : null;
  if (!range) return endPoint(root);
  range.deleteContents();
  return { node: range.startContainer, offset: range.startOffset };
}

// ------------------------------------------------------------------ the component

function assignRef(
  ref: Ref<HTMLDivElement> | undefined,
  el: HTMLDivElement | null,
): void {
  if (typeof ref === 'function') ref(el);
  else if (ref) ref.current = el;
}

export function CitationEditor({
  label,
  value,
  onInput,
  onSubmit,
  anchor,
  excludeThreadId,
  editorRef,
}: CitationEditorProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const ctx = useCitationContext();
  const listId = useId();
  const hintId = `${listId}-hint`;

  const emit = useDocSync(root, ctx, value, onInput);
  const afterEditRef = useRef(() => {});
  const picker = usePicker(root, ctx, anchor, excludeThreadId, () =>
    afterEditRef.current(),
  );
  const afterEdit = () => {
    const el = root.current;
    if (el) syncFill(el);
    emit();
    picker.sync();
  };
  afterEditRef.current = afterEdit;

  useBridge((target) => {
    const el = root.current;
    const chip = el && ctx ? chipFor(ctx, target) : null;
    if (!el || chip === null) return;
    const focused = el.ownerDocument.activeElement === el;
    const { parent, ref } = splitAt(insertionPoint(el, focused));
    el.focus();
    setCaret(el.ownerDocument, placeChip(parent, ref, chip));
    afterEdit();
  });

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const el = root.current;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!el || text === '') return;
    const nodes = partNodes(ctx, pasteToParts(text, pasteResolver(ctx)));
    const { parent, ref } = splitAt(insertionPoint(el, true));
    setCaret(el.ownerDocument, insertNodes(parent, ref, nodes));
    afterEdit();
  };

  const showing = picker.visible;
  return (
    <div class="field">
      <span aria-hidden="true">{label}</span>
      <div
        ref={(el) => {
          root.current = el;
          assignRef(editorRef, el);
        }}
        class="input input-area citation-editor"
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-describedby={hintId}
        aria-autocomplete="list"
        aria-controls={showing ? listId : undefined}
        aria-activedescendant={showing ? optionId(listId, picker.active) : undefined}
        contenteditable="true"
        tabIndex={0}
        onInput={(e) => {
          const el = e.currentTarget;
          const { inputType } = e as InputEvent;
          if (typeof inputType === 'string' && inputType.startsWith('delete'))
            clearIfBlank(el);
          afterEdit();
        }}
        onBeforeInput={(e) => {
          // No formatting (bold, italic…): the field only stores text and chips.
          if (e.inputType.startsWith('format')) e.preventDefault();
        }}
        onKeyDown={(e) => {
          const el = root.current;
          if (el)
            onEditorKey(e, { root: el, picker, submit: () => onSubmit?.(), afterEdit });
        }}
        onKeyUp={picker.sync}
        onClick={picker.sync}
        onPaste={onPaste}
        onDrop={(e) => e.preventDefault()}
      />
      <span id={hintId} class="visually-hidden">
        {t('thread.editorHint')}
      </span>
      {showing && (
        <CitePicker
          id={listId}
          anchor={root.current}
          candidates={picker.candidates}
          active={picker.active}
          onPick={picker.pick}
          onClose={picker.close}
        />
      )}
    </div>
  );
}
