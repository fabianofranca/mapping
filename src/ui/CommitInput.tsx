import type { JSX } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { place } from './Popover';
import {
  filterSuggestions,
  replaceWord,
  toItems,
  wordAtCursor,
  containsWord,
  type SuggestionInput,
  type SuggestionItem,
} from './suggestions';

type InputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onInput' | 'onChange' | 'onKeyDown'
>;

interface CommitInputProps extends InputProps {
  readonly value: string;
  /**
   * Called on confirm (Enter or leaving the field) with a text different from the
   * current one. Returns `false` to discard the text and go back to the current value. The second argument
   * only comes when the person picked from the list an item with an `id` (target of `linkedRef`) whose label
   * is still a word of the text; in that case the confirmation happens even with the text equal to the current one.
   */
  readonly onCommit: (text: string, chosen?: SuggestionItem) => boolean;
  /**
   * Field suggestions (ARIA combobox). The list opens (typing, ↓, Ctrl+Space or a click on the empty field) with the
   * first item active, which returns to the first on every filtering; Enter with it open picks the
   * active one and does not save (with it closed, it saves). Picking replaces only the word under the cursor and does not
   * save: the next confirmation saves. It does not restrict the value. Without them, or with the field
   * `readOnly`/`disabled`, the field is the usual one.
   */
  readonly suggestions?: readonly SuggestionInput[];
}

/**
 * Text field that only saves on confirm: typing does not create an
 * undo entry per keystroke. It follows the external value (e.g. after an undo).
 *
 * Keyboard (`docs/ARCHITECTURE.md`, "Focus and keyboard"): Enter confirms and focus stays on the field
 * (stage 8, F5); Esc with something to revert goes back to the current value and stops there (it does not close the dialog
 * or the surrounding menu); with nothing to revert, it bubbles up.
 */
export function CommitInput({ suggestions, ...props }: CommitInputProps) {
  const enabled =
    suggestions !== undefined &&
    suggestions.length > 0 &&
    props.readOnly !== true &&
    props.disabled !== true;
  return enabled ? (
    <CommitInputBody {...props} suggestions={suggestions} />
  ) : (
    <CommitInputBody {...props} />
  );
}

function CommitInputBody({ value, onCommit, suggestions, ...rest }: CommitInputProps) {
  // The draft only holds while the external value is the same as when it was typed.
  const [draft, setDraft] = useState({ base: value, text: value });
  const text = draft.base === value ? draft.text : value;
  const setText = (next: string) => setDraft({ base: value, text: next });
  // The last save (over which value, with which text): the `change` the browser
  // fires after Enter, before rendering, carries the same text and does not save again.
  const combo = suggestions !== undefined;
  const listId = useId();
  const inputEl = useRef<HTMLInputElement>(null);
  const panelEl = useRef<HTMLDivElement>(null);
  const pendingCursor = useRef<number | null>(null);
  // Open list: the filtered word and the active item (always the first on open or filter; Enter with the list open picks).
  const [list, setList] = useState<{
    readonly word: string;
    readonly active: number;
    readonly exact: boolean;
  } | null>(null);
  const allItems = suggestions === undefined ? [] : toItems(suggestions);
  const shown = list === null ? [] : filterSuggestions(allItems, list.word, list.exact);
  const visible = list !== null && shown.length > 0;
  const active = visible ? Math.min(list.active, shown.length - 1) : -1;
  const closeList = () => setList(null);
  const openList = (at: number, index: number) => {
    const word = wordAtCursor(inputEl.current?.value ?? text, at).text;
    setList(
      filterSuggestions(allItems, word, true).length > 0
        ? { word, active: index, exact: true }
        : null,
    );
  };
  // Items with an `id` picked in this edit (and over which external value): reset on confirm,
  // on the Esc that reverts and when the external value changes.
  const chosen = useRef<{ readonly item: SuggestionItem; readonly base: string }[]>([]);
  const choose = (item: SuggestionItem) => {
    const el = inputEl.current;
    if (!el) return;
    if (item.id !== undefined) chosen.current.push({ item, base: value });
    const next = replaceWord(el.value, el.selectionStart ?? el.value.length, item.label);
    pendingCursor.current = next.cursor;
    setText(next.text);
    closeList();
  };

  // Changing the text from JS moves the cursor to the end: put it after the suggestion.
  useLayoutEffect(() => {
    const at = pendingCursor.current;
    if (at === null) return;
    pendingCursor.current = null;
    inputEl.current?.setSelectionRange(at, at);
  });
  useLayoutEffect(() => {
    const input = inputEl.current;
    const panel = panelEl.current;
    if (!visible || !input || !panel) return;
    panel.style.minWidth = `${input.offsetWidth}px`;
    place(input, panel, 'start');
    const follow = () => place(input, panel, 'start');
    document.addEventListener('scroll', follow, true);
    globalThis.addEventListener('resize', closeList);
    return () => {
      document.removeEventListener('scroll', follow, true);
      globalThis.removeEventListener('resize', closeList);
    };
  }, [visible, shown.length]);
  useLayoutEffect(() => {
    if (active < 0) return;
    const option = panelEl.current?.querySelector('[aria-selected="true"]');
    if (option && 'scrollIntoView' in option) option.scrollIntoView({ block: 'nearest' });
  }, [active, visible]);

  const committed = useRef<{ readonly base: string; readonly text: string } | null>(null);
  // The guard only holds while the external value is still the base of that save: if it changed (the
  // save arrived, normalized or not, or an undo), it is reset, and the same text
  // saves again. After rendering, the field shows the external value and the duplicated
  // `change` falls into `typed === value`. An `onCommit` that accepts without changing the value leaves the
  // guard until it changes: retyping the same text is ignored, but it would not save anything.
  if (committed.current && committed.current.base !== value) committed.current = null;

  // Reads the text from the field itself: the `change` may arrive before the rendering that
  // follows `input`, and `text` would still be the old value.
  const commit = (typed: string) => {
    // The last pick whose label is still a word of the text holds; the list is reset in any case.
    const picked = chosen.current
      .filter((c) => c.base === value && containsWord(typed, c.item.label))
      .pop()?.item;
    chosen.current = [];
    if (picked === undefined) {
      if (typed === value) return;
      if (committed.current?.base === value && committed.current.text === typed) return;
    }
    // Saved: the draft becomes the saved text. Without this, going back later to the value from
    // before (undo, clearing through another button) would reuse the old draft.
    if (picked === undefined ? onCommit(typed) : onCommit(typed, picked)) {
      committed.current = { base: value, text: typed };
      setDraft({ base: typed, text: typed });
    } else {
      setText(value);
    }
  };

  const input = (
    <input
      {...rest}
      ref={inputEl}
      value={text}
      {...(combo
        ? {
            role: 'combobox',
            'aria-autocomplete': 'list' as const,
            'aria-expanded': visible,
            'aria-controls': listId,
            'aria-activedescendant': active >= 0 ? `${listId}-${active}` : undefined,
            autoComplete: 'off',
          }
        : {})}
      onInput={(e) => {
        const el = e.currentTarget;
        setText(el.value);
        if (!combo) return;
        const word = wordAtCursor(el.value, el.selectionStart ?? el.value.length).text;
        const found = word !== '' && filterSuggestions(allItems, word).length > 0;
        setList(found ? { word, active: 0, exact: false } : null);
      }}
      onChange={(e) => commit(e.currentTarget.value)}
      onBlur={combo ? (e) => (closeList(), commit(e.currentTarget.value)) : undefined}
      onClick={
        combo
          ? (e) => {
              if (e.currentTarget.value === '') openList(0, 0);
            }
          : undefined
      }
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (combo) {
          const at = el.selectionStart ?? el.value.length;
          // Only keys without a modifier: Alt+Shift+↑/↓ moves the table row and Alt+Enter
          // creates a row (`TableField`), as without suggestions.
          const plain = !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
          if (plain && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            if (!visible) {
              if (e.key === 'ArrowDown') openList(at, 0);
            } else {
              const n = shown.length;
              const next =
                e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
              setList({ ...list, active: next });
            }
            return;
          }
          if (e.key === ' ' && e.ctrlKey) {
            e.preventDefault();
            openList(at, 0);
            return;
          }
          if (visible && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeList();
            return;
          }
          if (visible && plain && e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            const item = shown[active];
            if (item) choose(item);
            return;
          }
          if (visible && e.key === 'Tab') closeList();
          if (
            visible &&
            (e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight' ||
              e.key === 'Home' ||
              e.key === 'End')
          ) {
            closeList();
          }
        }
        // Also with Alt (new row): saves before the new row enters.
        if (e.key === 'Enter') commit(el.value);
        if (e.key === 'Escape' && (el.value !== value || chosen.current.length > 0)) {
          chosen.current = [];
          setText(value);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    />
  );
  if (!combo) return input;
  return (
    <>
      {input}
      {visible && (
        <div
          class="popover suggestions"
          id={listId}
          role="listbox"
          aria-label={t('suggestions.listLabel')}
          ref={panelEl}
          // Without taking focus out of the field.
          onMouseDown={(e) => e.preventDefault()}
        >
          {shown.map((item, index) => (
            <div
              key={index}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              class="suggestion"
              onClick={() => choose(item)}
            >
              <span class="suggestion-label">{item.label}</span>
              {item.detail !== undefined && (
                <span class="suggestion-detail">{item.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
