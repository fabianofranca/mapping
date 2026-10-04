import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t } from '../i18n';
import { getBacklinks, type Annotation, type Entry, type Project } from '../model';
import type { AnnotationLocation } from '../store/ui';
import { ActionMenu } from './ActionMenu';
import { Button, IconButton, TextField } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { annotationErrorMessage } from './labels';
import { moveKeyDelta, useRowDrag, type RowDrag } from './rowDrag';
import { BacklinkList } from './FieldEditors';

// KeyValueGrid do DS 2.0: pares da anotação livre numa grade com edição na célula,
// alça de arraste (P6) e menu ⋯ por linha. No celular cada par vira um cartão (CSS).

/** Alt+Enter: novo par ou nova linha (DS 2.0, seção Atalhos). */
export function isNewRowKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

/** Foca a alça da linha `index` depois da renderização (o foco segue a linha movida). */
export function focusGrip(container: HTMLElement | null, index: number): void {
  requestAnimationFrame(() => {
    container
      ?.querySelectorAll<HTMLElement>('[data-drag-row]')
      [index]?.querySelector<HTMLElement>('.grid-grip')
      ?.focus();
  });
}

interface EntryRowProps {
  /** `null` = par novo, ainda não gravado (só existe na tela até ter chave válida). */
  readonly entry: Entry | null;
  readonly index: number;
  readonly count: number;
  readonly annotationId: string;
  readonly readOnly: boolean;
  readonly drag: RowDrag;
  /** Move o par gravado para `to` (botões do menu, teclado). */
  readonly onMove: (to: number) => void;
  /** Descarta o par novo. */
  readonly onDiscard: () => void;
  /** Par novo gravado. */
  readonly onCreated: () => void;
  /** Remove o par gravado (com confirmação se ele for alvo de referências). */
  readonly onRemove: () => void;
  readonly children?: ComponentChildren;
}

/**
 * Um par chave-valor. Grava ao sair do campo. Se a chave for vazia ou repetida,
 * mostra o erro na linha e mantém o texto digitado, sem gravar o par.
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
  children,
}: EntryRowProps) {
  const { actions } = useEditor();
  const base = entry ? `${entry.key}\u0000${entry.value}` : '';
  const [draft, setDraft] = useState({
    base,
    key: entry?.key ?? '',
    value: entry?.value ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  // O rascunho vale só enquanto o par gravado for o mesmo (ex.: some após desfazer).
  const current =
    draft.base === base
      ? draft
      : { base, key: entry?.key ?? '', value: entry?.value ?? '' };

  const edit = (patch: Partial<Pick<typeof draft, 'key' | 'value'>>) =>
    setDraft({ ...current, ...patch });

  const commit = () => {
    if (entry && current.key === entry.key && current.value === entry.value) {
      setError(null);
      return;
    }
    // Par novo ainda vazio: nada a gravar nem a reclamar.
    if (!entry && current.key.trim() === '' && current.value === '') return;
    const next = { key: current.key, value: current.value };
    const result = entry
      ? actions.updateEntry(annotationId, entry.id, next)
      : actions.addEntry(annotationId, next);
    if (result.ok) {
      setError(null);
      if (!entry) onCreated();
    } else {
      setError(annotationErrorMessage(result.error));
    }
  };

  const onFieldKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.altKey) (e.currentTarget as HTMLElement).blur();
    if (e.key === 'Escape') {
      // Esc cancela a edição do campo: volta ao valor gravado.
      setDraft({ base, key: entry?.key ?? '', value: entry?.value ?? '' });
      setError(null);
      if (!entry) onDiscard();
      e.stopPropagation();
    }
  };

  const onRowKeyDown = (e: KeyboardEvent) => {
    if (!entry || readOnly) return;
    const onGrip = (e.target as HTMLElement).classList.contains('grid-grip');
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
      data-drop={entry ? drag.drop(index, count) : undefined}
      aria-invalid={error !== null || undefined}
      onKeyDown={onRowKeyDown}
    >
      <span class="grid-cell grid-cell-grip" role="cell">
        {entry && !readOnly && (
          <button
            type="button"
            class="grid-grip"
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
          onKeyDown={onFieldKeyDown}
        />
      </span>
      <span class="grid-cell" role="cell">
        <TextField
          size="sm"
          aria-label={t('annotation.value')}
          placeholder={t('annotation.value')}
          disabled={readOnly}
          value={current.value}
          onInput={(e) => edit({ value: e.currentTarget.value })}
          onChange={commit}
          onKeyDown={onFieldKeyDown}
        />
      </span>
      <span class="grid-cell grid-cell-menu" role="cell">
        {entry ? (
          <ActionMenu
            label={t('annotation.entryActions', { key: entry.key })}
            disabled={readOnly}
            items={[
              {
                label: t('annotation.moveEntryUp'),
                disabled: index === 0,
                onSelect: () => onMove(index - 1),
              },
              {
                label: t('annotation.moveEntryDown'),
                disabled: index === count - 1,
                onSelect: () => onMove(index + 1),
              },
              { label: t('annotation.removeEntry'), danger: true, onSelect: onRemove },
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

/** Pares de uma anotação livre, com as referências recebidas por par. */
export function KeyValueGrid({
  project,
  annotation,
  readOnly,
  onGoToAnnotation,
  onRemoveEntry,
}: KeyValueGridProps) {
  const { actions } = useEditor();
  const [adding, setAdding] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const count = annotation.entries.length;
  const backlinks = getBacklinks(project, annotation.id);

  const move = (from: number, to: number, focus: boolean) => {
    const entry = annotation.entries[from];
    if (!entry || from === to) return;
    actions.moveEntry(annotation.id, entry.id, to);
    if (focus) focusGrip(grid.current, to);
  };
  const drag = useRowDrag(grid, (from, to) => move(from, to, false));

  // Par novo: o foco vai para a chave.
  useEffect(() => {
    if (!adding) return;
    grid.current?.querySelector<HTMLElement>('[data-new-row] input')?.focus();
  }, [adding]);

  const startAdding = () => {
    if (!readOnly) setAdding(true);
  };

  // Lista única, com o par novo na posição que terá depois de gravado: a linha
  // mantém a mesma chave (e o foco) quando a chave é gravada ao passar para o valor.
  const rows = annotation.entries.map((entry, index) => {
    const received = backlinks.filter(
      (b) => 'entryId' in b.ref && b.ref.entryId === entry.id,
    );
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
        onDiscard={() => setAdding(false)}
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
            <span role="columnheader" aria-hidden="true" />
          </div>
          {rows}
        </div>
      )}
      <div class="grid-foot">
        <Button
          size="sm"
          class="button-link"
          title={`${t('annotation.addEntry')}  ${SHORTCUT_LABELS.newRow}`}
          aria-keyshortcuts={SHORTCUT_LABELS.newRow}
          disabled={readOnly || adding}
          onClick={startAdding}
        >
          {t('annotation.addEntry')}
        </Button>
      </div>
    </div>
  );
}
