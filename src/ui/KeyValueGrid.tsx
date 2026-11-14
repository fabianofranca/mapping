import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ariaKeys, SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import {
  getBacklinks,
  type Annotation,
  type Backlink,
  type Entry,
  type Project,
} from '../model';
import type { AnnotationLocation } from '../store/ui';
import { ActionMenu } from './ActionMenu';
import { useCiteMenuItems } from './CiteMenuItems';
import { Button, IconButton, TextField } from './controls';
import { useDetailsExtension } from './DetailsExtension';
import { useEditor } from './EditorContext';
import { useFocusRequest } from './focus';
import { Icon } from './icons';
import { annotationErrorMessage } from './labels';
import { moveKeyDelta, useRowDrag, type RowDrag } from './rowDrag';
import { BacklinkList } from './FieldEditors';

// DS 2.0 KeyValueGrid: pairs of the free annotation in a grid with in-cell editing,
// drag handle (P6) and a ⋯ menu per row.

/** Alt+Enter: new pair or new row (DS 2.0, Shortcuts section). */
export function isNewRowKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

/**
 * The handle of row `index` (focus follows the moved row). Requested with `useFocusRequest`, it
 * is read in the commit that draws the list in the new order.
 */
export function gripAt(container: HTMLElement | null, index: number): HTMLElement | null {
  return (
    container
      ?.querySelectorAll<HTMLElement>('[data-drag-row]')
      [index]?.querySelector<HTMLElement>('[data-grip]') ?? null
  );
}

/** The event target is the row handle (the arrow keys alone move the row). */
export function isGrip(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.hasAttribute('data-grip');
}

interface EntryRowProps {
  /** `null` = new pair, not saved yet (it only exists on screen until it has a valid key). */
  readonly entry: Entry | null;
  readonly index: number;
  readonly count: number;
  readonly annotationId: string;
  readonly readOnly: boolean;
  readonly drag: RowDrag;
  /** Moves the saved pair to `to` (menu buttons, keyboard). */
  readonly onMove: (to: number) => void;
  /** Discards the new pair. */
  readonly onDiscard: () => void;
  /** New pair saved. */
  readonly onCreated: () => void;
  /** Removes the saved pair (with confirmation if it is the target of references). */
  readonly onRemove: () => void;
  /**
   * In place of the row's ⋯ menu (extension point of the Details: the review marker);
   * `undefined`, the menu.
   */
  readonly aside?: ComponentChildren;
  readonly children?: ComponentChildren;
}

/**
 * A key-value pair. Saves on leaving the field. If the key is empty or repeated,
 * shows the error on the row and keeps the typed text, without saving the pair.
 */
function EntryRow({
  entry,
  index,
  count,
  annotationId,
  readOnly,
  drag,
  onMove,
  onDiscard,
  onCreated,
  onRemove,
  aside,
  children,
}: EntryRowProps) {
  const { actions } = useEditor();
  const citeItems = useCiteMenuItems();
  const base = entry ? `${entry.key}\u0000${entry.value}` : '';
  const [draft, setDraft] = useState({
    base,
    key: entry?.key ?? '',
    value: entry?.value ?? '',
  });
  // The error belongs to the pair (by id; the new pair, with no id, uses `null`), not to the
  // position: when removing a
  // row, the message does not pass to the pair that takes its place.
  const owner = entry?.id ?? null;
  const [errorState, setErrorState] = useState<{
    readonly owner: string | null;
    readonly message: string;
  } | null>(null);
  const error = errorState?.owner === owner ? errorState.message : null;
  const setError = (message: string | null) =>
    setErrorState(message === null ? null : { owner, message });
  // The draft only counts while the saved pair is the same (e.g. it disappears after an undo).
  const current =
    draft.base === base
      ? draft
      : { base, key: entry?.key ?? '', value: entry?.value ?? '' };

  const edit = (patch: Partial<Pick<typeof draft, 'key' | 'value'>>) =>
    setDraft({ ...current, ...patch });

  // The last save (on which pair, with which text): the `change` that the browser fires
  // after Enter, before rendering, carries the same text and does not save again (one
  // undo entry). The guard only holds while the saved pair (`''` in the new pair) is still
  // its base: if it changed (the save arrived, or an undo), it is reset, as in
  // `CommitInput`; after rendering, the duplicate `change` exits through the first line.
  const committed = useRef<{
    readonly base: string;
    readonly key: string;
    readonly value: string;
  } | null>(null);
  if (committed.current && committed.current.base !== base) committed.current = null;
  const commit = () => {
    if (entry && current.key === entry.key && current.value === entry.value) {
      setError(null);
      return;
    }
    if (
      committed.current?.key === current.key &&
      committed.current.value === current.value
    )
      return;
    // New pair still empty: nothing to save or to complain about.
    if (!entry && current.key.trim() === '' && current.value === '') return;
    const next = { key: current.key, value: current.value };
    const result = entry
      ? actions.updateEntry(annotationId, entry.id, next)
      : actions.addEntry(annotationId, next);
    if (result.ok) {
      committed.current = { base, ...next };
      // Saved: the draft becomes the saved pair. Without this, undo (the pair returns to the
      // previous one) would reuse the draft, as in `CommitInput`.
      setDraft({ base: `${next.key}\u0000${next.value}`, ...next });
      setError(null);
      if (!entry) onCreated();
    } else {
      setError(annotationErrorMessage(result.error));
    }
  };

  /**
   * Enter saves and the focus stays in the field; Esc with something to revert returns to the
   * saved pair (in the new pair, discards the row) and stops there; with nothing to revert, it
   * bubbles up (stage 8, F5).
   */
  const onFieldKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.altKey) commit();
    if (e.key !== 'Escape') return;
    const pending =
      !entry ||
      error !== null ||
      current.key !== entry.key ||
      current.value !== entry.value;
    if (!pending) return;
    setDraft({ base, key: entry?.key ?? '', value: entry?.value ?? '' });
    setError(null);
    if (!entry) onDiscard();
    e.preventDefault();
    e.stopPropagation();
  };

  const onRowKeyDown = (e: KeyboardEvent) => {
    if (!entry || readOnly) return;
    const onGrip = isGrip(e.target);
    const delta = moveKeyDelta(e, onGrip);
    if (delta === 0) return;
    e.preventDefault();
    const to = index + delta;
    if (to >= 0 && to < count) onMove(to);
  };

  const dragging = drag.state?.from === index;

  return (
    <div
      class={dragging ? 'grid-row kv-row is-dragging' : 'grid-row kv-row'}
      role="row"
      data-drag-row={entry ? '' : undefined}
      data-new-row={entry ? undefined : ''}
      data-entry={entry?.id}
      data-drop={entry ? drag.drop(index, count) : undefined}
      aria-invalid={error !== null || undefined}
      onKeyDown={onRowKeyDown}
    >
      <span class="grid-cell grid-cell-grip" role="cell">
        {entry && !readOnly && (
          <button
            type="button"
            class="grid-grip"
            data-grip=""
            aria-label={t('annotation.dragEntry', { key: entry.key })}
            title={t('annotation.dragHint')}
            {...drag.handle(index)}
          >
            <Icon name="grip" />
          </button>
        )}
      </span>
      <span class="grid-cell grid-cell-key" role="cell">
        <TextField
          size="sm"
          invalid={error !== null}
          aria-label={t('annotation.key')}
          placeholder={t('annotation.key')}
          disabled={readOnly}
          value={current.key}
          onInput={(e) => edit({ key: e.currentTarget.value })}
          onChange={commit}
          onKeyDown={(e) => {
            // Enter on the Key saves (on leaving the field) and moves to the Value of the same
            // row.
            if (e.key === 'Enter' && !e.altKey) {
              const row = e.currentTarget.closest('[role="row"]');
              const value = row?.querySelector<HTMLElement>('[data-kv-value]');
              if (value) {
                e.preventDefault();
                value.focus();
                return;
              }
            }
            onFieldKeyDown(e);
          }}
        />
      </span>
      <span class="grid-cell" role="cell">
        <TextField
          size="sm"
          aria-label={t('annotation.value')}
          data-kv-value=""
          placeholder={t('annotation.value')}
          disabled={readOnly}
          value={current.value}
          onInput={(e) => edit({ value: e.currentTarget.value })}
          onChange={commit}
          onKeyDown={onFieldKeyDown}
        />
      </span>
      <span class="grid-cell grid-cell-menu" role="cell">
        {aside !== undefined ? (
          aside
        ) : entry ? (
          <ActionMenu
            label={t('annotation.entryActions', { key: entry.key })}
            items={[
              {
                label: t('annotation.moveEntryUp'),
                disabled: readOnly || index === 0,
                onSelect: () => onMove(index - 1),
              },
              {
                label: t('annotation.moveEntryDown'),
                disabled: readOnly || index === count - 1,
                onSelect: () => onMove(index + 1),
              },
              {
                label: t('annotation.removeEntry'),
                danger: true,
                disabled: readOnly,
                onSelect: onRemove,
              },
              ...citeItems(
                { kind: 'entry', annotationId, entryId: entry.id },
                { kind: 'entry', annotationId, entryId: entry.id },
              ),
            ]}
          />
        ) : (
          <IconButton
            icon="close"
            label={t('annotation.removeEntry')}
            disabled={readOnly}
            onClick={onDiscard}
          />
        )}
      </span>
      {error && (
        <p class="field-error grid-row-note" role="alert">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

interface KeyValueGridProps {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onRemoveEntry: (entryId: string) => void;
}

/** A pair that left (extension point of the Details): struck through, where it used to be. */
function RemovedEntryRow({
  entry,
  aside,
}: {
  readonly entry: Entry;
  readonly aside: ComponentChildren;
}) {
  return (
    <div class="grid-row kv-row is-removed" role="row">
      <span class="grid-cell grid-cell-grip" role="cell" />
      <span class="grid-cell grid-cell-key" role="cell">
        <del class="grid-cell-text">{entry.key}</del>
      </span>
      <span class="grid-cell" role="cell">
        <del class="grid-cell-text">{entry.value}</del>
      </span>
      <span class="grid-cell grid-cell-menu" role="cell">
        {aside}
      </span>
    </div>
  );
}

/** Received references, grouped by pair id (once per render, not once per pair). */
function backlinksByEntry(backlinks: readonly Backlink[]): Map<string, Backlink[]> {
  const byEntry = new Map<string, Backlink[]>();
  for (const b of backlinks) {
    if (!('entryId' in b.ref)) continue;
    const list = byEntry.get(b.ref.entryId);
    if (list) list.push(b);
    else byEntry.set(b.ref.entryId, [b]);
  }
  return byEntry;
}

/** Pairs of a free annotation, with the references received per pair. */
export function KeyValueGrid({
  project,
  annotation,
  readOnly,
  onGoToAnnotation,
  onRemoveEntry,
}: KeyValueGridProps) {
  const { actions } = useEditor();
  const ext = useDetailsExtension();
  const [adding, setAdding] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const count = annotation.entries.length;
  const backlinks = getBacklinks(project, annotation.id);

  const requestFocus = useFocusRequest();
  const addButton = useRef<HTMLButtonElement>(null);

  const move = (from: number, to: number, focus: boolean) => {
    const entry = annotation.entries[from];
    if (!entry || from === to) return;
    actions.moveEntry(annotation.id, entry.id, to);
    if (focus) requestFocus(() => gripAt(grid.current, to));
  };
  const drag = useRowDrag(grid, (from, to) => move(from, to, false));

  // New pair: the focus goes to the key, in the commit that draws the row.
  useLayoutEffect(() => {
    if (!adding) return;
    grid.current?.querySelector<HTMLElement>('[data-new-row] input')?.focus();
  }, [adding]);

  const startAdding = () => {
    if (!readOnly) setAdding(true);
  };

  // Single list, with the new pair at the position it will have once saved: the row
  // keeps the same key (and the focus) when the key is saved and focus moves on to the value.
  const receivedByEntry = backlinksByEntry(backlinks);
  const rows = annotation.entries.map((entry, index) => {
    const received = receivedByEntry.get(entry.id) ?? [];
    return (
      <EntryRow
        key={`${annotation.id}:${index}`}
        entry={entry}
        index={index}
        count={count}
        annotationId={annotation.id}
        readOnly={readOnly}
        drag={drag}
        onMove={(to) => move(index, to, true)}
        onDiscard={() => undefined}
        onCreated={() => undefined}
        onRemove={() => onRemoveEntry(entry.id)}
        aside={ext ? ext.mark(annotation.id, `entries.${entry.id}`) : undefined}
      >
        {received.length > 0 && (
          <div class="grid-row-note">
            <BacklinkList
              project={project}
              backlinks={received}
              onGoToAnnotation={onGoToAnnotation}
            />
          </div>
        )}
      </EntryRow>
    );
  });
  // The pairs that left, struck through where they used to be.
  for (const removed of ext?.removedEntries(annotation.id) ?? []) {
    rows.splice(
      Math.min(removed.index, rows.length),
      0,
      <RemovedEntryRow
        key={`removed:${removed.entry.id}`}
        entry={removed.entry}
        aside={ext?.mark(annotation.id, `entries.${removed.entry.id}`)}
      />,
    );
  }
  if (adding) {
    rows.push(
      <EntryRow
        key={`${annotation.id}:${count}`}
        entry={null}
        index={count}
        count={count}
        annotationId={annotation.id}
        readOnly={readOnly}
        drag={drag}
        onMove={() => undefined}
        onDiscard={() => {
          setAdding(false);
          // The discarded row had the focus: it stays on the "+ Pair" button.
          requestFocus(() => addButton.current);
        }}
        onCreated={() => setAdding(false)}
        onRemove={() => undefined}
      />,
    );
  }

  return (
    <div
      class="kv"
      onKeyDown={(e) => {
        if (!isNewRowKey(e)) return;
        e.preventDefault();
        startAdding();
      }}
    >
      {rows.length > 0 && (
        <div
          class="grid kv-grid"
          role="table"
          aria-label={t('annotation.pairs')}
          ref={grid}
        >
          <div class="grid-row grid-head" role="row">
            <span role="columnheader" aria-hidden="true" />
            <span class="grid-cell" role="columnheader">
              {t('annotation.key')}
            </span>
            <span class="grid-cell" role="columnheader">
              {t('annotation.value')}
            </span>
            {ext ? (
              <span role="columnheader" class="visually-hidden">
                {ext.markColumn}
              </span>
            ) : (
              <span role="columnheader" aria-hidden="true" />
            )}
          </div>
          {rows}
        </div>
      )}
      <div class="grid-foot">
        <Button
          size="sm"
          class="button-link"
          title={`${t('annotation.addEntry')}  ${SHORTCUT_LABELS.newRow}`}
          aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.newRow)}
          disabled={readOnly || adding}
          buttonRef={addButton}
          onClick={startAdding}
        >
          {t('annotation.addEntry')}
        </Button>
      </div>
    </div>
  );
}
