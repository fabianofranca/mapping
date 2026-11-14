import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  type Annotation,
  type Backlink,
  type JsonValue,
  type Project,
  type SpecSimpleColumn,
  projectIndex,
  refPathText,
} from '../model';
import type { ActionResult } from '../store/history';
import type { AnnotationLocation } from '../store/ui';
import { Segmented, Select, TextArea, TextField } from './controls';
import { markingLabel } from './labels';
import { mergeLinkedItems, type SuggestionItem } from './suggestions';
import { annotationSourceLabel } from './typedText';

// Shared pieces of the typed fields: the editor of a simple value (field or table cell)
// and the list of incoming references.

/** Segmented buttons up to this number of options; above it, a list. */
const SEGMENTED_MAX = 3;

export interface FieldContext {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

function valueText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Reads the typed number (accepts a decimal comma); `undefined` = invalid. */
export function parseNumberInput(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** A text with a line break, or longer than this, opens in the multi-line editor. */
export const MULTILINE_MIN_LENGTH = 60;
const MULTILINE_ROWS = 4;

/** Ignores the line break of the Enter that is still in progress (until its `keyup`). */
function swallowEnterOnce(el: HTMLTextAreaElement) {
  const block = (e: Event) => {
    if (
      e instanceof InputEvent &&
      e.inputType.startsWith('insert') &&
      e.inputType !== 'insertText'
    )
      e.preventDefault();
  };
  const stop = () => {
    el.removeEventListener('beforeinput', block);
    el.removeEventListener('keyup', stop);
  };
  el.addEventListener('beforeinput', block);
  el.addEventListener('keyup', stop);
  setTimeout(stop, 0);
}

interface MultilineProps {
  readonly id: string | undefined;
  readonly label: string;
  /** The current project value: what the field shows while the person has not edited. */
  readonly initial: string;
  /** Draft that is born already edited (what was typed before the Shift+Enter switch). */
  readonly startText?: string;
  readonly readOnly: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  /** Focuses on mount, with the cursor at the end (the Shift+Enter switch). */
  readonly autoFocus: boolean;
  /** Focus arrived mid-Enter: that same Enter's break does not enter the new field. */
  readonly swallowBreak?: boolean;
  readonly onCommit: (text: string) => void;
  /** Signals that Enter saved (the parent handles the focus if the editor switches). */
  readonly onEnterCommit?: () => void;
}

/**
 * Multi-line text: leaving the field saves. While the text has no break, Enter also
 * saves (as in the single-line field) and Shift+Enter breaks; with a break, Enter breaks.
 */
function MultilineEditor({
  id,
  label,
  initial,
  startText,
  readOnly,
  invalid,
  required,
  autoFocus,
  swallowBreak = false,
  onCommit,
  onEnterCommit,
}: MultilineProps) {
  // Draft + the project value it was typed over: if the project changed from outside
  // (undo, reload) or nothing was edited, the field shows the project's current value.
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(
    startText === undefined ? null : { base: initial, text: startText },
  );
  // The Shift+Enter switch saves the single-line field's text (the `change` of the input that
  // leaves the DOM) and the project value becomes the start of the draft: it stays valid.
  const draftHolds =
    draft !== null &&
    (draft.base === initial ||
      (startText !== undefined && draft.text === `${initial}\n`));
  const current = draftHolds && draft.text !== initial ? draft.text : initial;
  const area = useRef<HTMLTextAreaElement>(null);
  // Focus and cursor at the end only on mount: rendering while typing does not move them.
  useLayoutEffect(() => {
    const el = area.current;
    if (el === null || !autoFocus) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    if (swallowBreak) swallowEnterOnce(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TextArea
      id={id}
      aria-label={label}
      aria-required={required}
      rows={MULTILINE_ROWS}
      disabled={readOnly}
      invalid={invalid}
      value={current}
      onInput={(text) => setDraft({ base: initial, text })}
      onCommit={(text) => {
        // Leaving without editing does not save (nor the old value over a new one).
        if (text !== initial) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || readOnly) return;
        if (e.currentTarget.value.includes('\n')) return;
        e.preventDefault();
        onEnterCommit?.();
        onCommit(e.currentTarget.value);
      }}
      textAreaRef={area}
    />
  );
}

/**
 * Editor of an annotation `string` field: one line; opens in several lines when the text already
 * has a break or exceeds `MULTILINE_MIN_LENGTH`, or when the person presses Shift+Enter (what
 * was typed stays, with the break). Only in annotation fields: the table cell stays
 * single-line.
 */
export function StringEditor(props: SimpleEditorProps) {
  const { field, value, label, readOnly, id, invalid = false, onSet } = props;
  const text = valueText(value);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const multiline =
    draft !== null || text.includes('\n') || text.length > MULTILINE_MIN_LENGTH;
  const box = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  // Enter saved in the single-line field and the value now needs several lines: the TEXTAREA is
  // born focused.
  const focusMultiline = useRef(false);
  const focusOnMount = multiline && focusMultiline.current;
  useLayoutEffect(() => {
    if (multiline) focusMultiline.current = false;
  }, [multiline]);
  // Enter saved a short value and the editor went back to one line: the focus goes to the new
  // field.
  useLayoutEffect(() => {
    if (multiline || !refocus.current) return;
    refocus.current = false;
    // Only if the focus was still in this editor (the swapped field left it on `body`).
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const input = box.current?.querySelector('input');
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [multiline]);
  if (!multiline) {
    return (
      <div
        class="string-editor"
        ref={box}
        onFocusOut={() => {
          focusMultiline.current = false;
        }}
        onKeyDownCapture={(e) => {
          const input = e.target;
          if (e.key !== 'Enter' || readOnly || e.isComposing) return;
          if (!(input instanceof HTMLInputElement)) return;
          if (!e.shiftKey) {
            focusMultiline.current = true;
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setDraft(`${input.value}\n`);
        }}
      >
        <SimpleEditor {...props} />
      </div>
    );
  }
  return (
    <>
      <MultilineEditor
        id={id}
        label={label}
        initial={text}
        startText={draft ?? undefined}
        readOnly={readOnly}
        invalid={invalid || error !== null}
        required={field.required === true}
        autoFocus={draft !== null || focusOnMount}
        swallowBreak={focusOnMount}
        onEnterCommit={() => {
          refocus.current = true;
        }}
        onCommit={(typed) => {
          // The line break at the end (a stray Enter) is not part of the text: remove it, so that
          // a value such as an image URL does not go to disk with `\n`.
          const next = typed.replace(/[\r\n]+$/, '');
          const result = onSet(next === '' ? null : next);
          setError(result.ok ? null : t('typed.invalidValue'));
          if (result.ok) setDraft(null);
        }}
      />
      {error !== null && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export interface SimpleEditorProps {
  readonly field: SpecSimpleColumn;
  readonly value: JsonValue | undefined;
  /** Accessible name of the control. */
  readonly label: string;
  readonly readOnly: boolean;
  /** `id` of the control (the label of the property grid points to it). */
  readonly id?: string;
  /** Pending item in the value (empty required, nonexistent option…): invalid state. */
  readonly invalid?: boolean;
  /** Hint of the control (e.g. the reason for the pending item in a cell). */
  readonly title?: string;
  /** Saves the value (`null` clears). */
  readonly onSet: (value: JsonValue) => ActionResult;
  /**
   * `linkedRef` (`string` field): the targets of the sibling `ref` enter the list before the fixed
   * suggestions; when confirming with one of them chosen, `onSetLinked` saves the text and the
   * `ref` together.
   */
  readonly linked?: {
    readonly items: readonly SuggestionItem[];
    readonly onSetLinked: (text: JsonValue, itemId: string) => ActionResult;
  };
}

/** Editor of a simple field: text, number, date or options. */
export function SimpleEditor({
  field,
  value,
  label,
  readOnly,
  id,
  invalid = false,
  title,
  onSet,
  linked,
}: SimpleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const report = (result: ActionResult) => {
    setError(result.ok ? null : t('typed.invalidValue'));
    return result.ok;
  };
  const required = field.required === true;
  const text = valueText(value);
  const bad = invalid || error !== null;
  // Text and number may come out cut off in the cell ("ana@exe"): the whole value goes in the hint,
  // before the pending-item reason, if any (stage 7, finding A3).
  const fullTitle = [text, title ?? ''].filter((s) => s !== '').join('\n') || undefined;
  let editor;

  switch (field.type) {
    case 'string':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={fullTitle}
          aria-label={label}
          aria-required={required}
          disabled={readOnly}
          value={text}
          suggestions={
            linked
              ? mergeLinkedItems(linked.items, field.suggestions ?? [])
              : field.suggestions
          }
          onCommit={(next, chosen) => {
            const value = next === '' ? null : next;
            return report(
              linked && chosen?.id !== undefined
                ? linked.onSetLinked(value, chosen.id)
                : onSet(value),
            );
          }}
        />
      );
      break;
    case 'number':
      editor = (
        <TextField
          id={id}
          size="sm"
          invalid={bad}
          title={fullTitle}
          aria-label={label}
          aria-required={required}
          inputMode="decimal"
          disabled={readOnly}
          value={text}
          onCommit={(next) => {
            const parsed = parseNumberInput(next);
            if (parsed === undefined) {
              setError(t('typed.invalidNumber'));
              return false;
            }
            return report(onSet(parsed));
          }}
        />
      );
      break;
    case 'date':
      editor = (
        <TextField
          id={id}
          size="sm"
          type="date"
          invalid={bad}
          title={title}
          aria-label={label}
          aria-required={required}
          disabled={readOnly}
          value={text}
          onChange={(e) => {
            const next = e.currentTarget.value;
            report(onSet(next === '' ? null : next));
          }}
        />
      );
      break;
    case 'enum':
      editor =
        field.options.length <= SEGMENTED_MAX ? (
          <Segmented
            label={label}
            items={field.options.map((option) => ({ id: option, label: option }))}
            value={field.options.includes(text) ? text : null}
            invalid={bad}
            disabled={readOnly}
            // Optional: tapping the chosen option clears the field.
            onSelect={(option) => {
              if (text !== option) report(onSet(option));
              else if (!required) report(onSet(null));
            }}
          />
        ) : (
          <Select
            id={id}
            size="sm"
            invalid={bad}
            title={title}
            aria-label={label}
            aria-required={required}
            disabled={readOnly}
            value={field.options.includes(text) ? text : ''}
            onChange={(e) => {
              const next = e.currentTarget.value;
              report(onSet(next === '' ? null : next));
            }}
          >
            <option value="">{t('typed.enumNone')}</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        );
      break;
  }

  return (
    <>
      {editor}
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Who points to a tuple, row or field: "← Input input_name (Name)". Tapping goes to the origin. */
export function BacklinkList({
  project,
  backlinks,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly backlinks: readonly Backlink[];
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  if (backlinks.length === 0) return null;
  const markings = projectIndex(project).markings;
  return (
    <ul class="backlinks" aria-label={t('ref.backlinks')}>
      {backlinks.map((b) => {
        const source = annotationSourceLabel(project, b.source);
        const marking = markings.get(b.source.markingId);
        return (
          <li key={`${b.source.id}:${refPathText(b)}`}>
            <button
              type="button"
              class="link-button"
              title={t('ref.backlinkGo', { source })}
              onClick={() => onGoToAnnotation(b.source)}
            >
              {t('ref.backlink', {
                source,
                marking: marking ? markingLabel(project, marking) : '',
              })}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
