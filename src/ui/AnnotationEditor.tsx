import { useState } from 'preact/hooks';
import { t } from '../i18n';
import type { Annotation, Entry } from '../model';
import type { ProjectActions } from '../store/project';
import { CommitInput } from './CommitInput';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, TrashIcon } from './icons';
import { annotationErrorMessage, annotationLabel } from './labels';

interface AnnotationEditorProps {
  readonly annotation: Annotation;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
}

interface EntryRowProps {
  /** `null` = par novo, ainda não gravado (só existe na tela até ter chave válida). */
  readonly entry: Entry | null;
  readonly index: number;
  readonly count: number;
  readonly annotationId: string;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  /** Descarta o par novo. */
  readonly onDiscard: () => void;
  /** Par novo gravado. */
  readonly onCreated: () => void;
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
  actions,
  readOnly,
  onDiscard,
  onCreated,
}: EntryRowProps) {
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
      ? actions.updateEntry(annotationId, index, next)
      : actions.addEntry(annotationId, next);
    if (result.ok) {
      setError(null);
      if (!entry) onCreated();
    } else {
      setError(annotationErrorMessage(result.error));
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLElement).blur();
  };

  return (
    <li class="entry">
      <div class="entry-fields">
        <input
          class={error ? 'input input-invalid' : 'input'}
          aria-label={t('annotation.key')}
          placeholder={t('annotation.key')}
          aria-invalid={error !== null}
          disabled={readOnly}
          value={current.key}
          onInput={(e) => edit({ key: e.currentTarget.value })}
          onChange={commit}
          onKeyDown={onKeyDown}
        />
        <input
          class="input"
          aria-label={t('annotation.value')}
          placeholder={t('annotation.value')}
          disabled={readOnly}
          value={current.value}
          onInput={(e) => edit({ value: e.currentTarget.value })}
          onChange={commit}
          onKeyDown={onKeyDown}
        />
      </div>
      <div class="entry-actions">
        {entry && (
          <>
            <button
              type="button"
              class="button"
              aria-label={t('annotation.moveEntryUp')}
              title={t('annotation.moveEntryUp')}
              disabled={readOnly || index === 0}
              onClick={() => actions.moveEntry(annotationId, index, index - 1)}
            >
              <ArrowUpIcon />
            </button>
            <button
              type="button"
              class="button"
              aria-label={t('annotation.moveEntryDown')}
              title={t('annotation.moveEntryDown')}
              disabled={readOnly || index === count - 1}
              onClick={() => actions.moveEntry(annotationId, index, index + 1)}
            >
              <ArrowDownIcon />
            </button>
          </>
        )}
        <button
          type="button"
          class="button"
          aria-label={t('annotation.removeEntry')}
          title={t('annotation.removeEntry')}
          disabled={readOnly}
          onClick={() => (entry ? actions.removeEntry(annotationId, index) : onDiscard())}
        >
          <CloseIcon />
        </button>
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Uma anotação: nome opcional e lista de pares chave-valor. */
export function AnnotationEditor({
  annotation,
  actions,
  readOnly,
}: AnnotationEditorProps) {
  const [adding, setAdding] = useState(false);
  const count = annotation.entries.length;

  // Lista única, com o par novo na posição que terá depois de gravado: a linha
  // mantém a mesma chave (e o foco) quando a chave é gravada ao passar para o valor.
  const rows = annotation.entries.map((entry, index) => (
    <EntryRow
      key={`${annotation.id}:${index}`}
      entry={entry}
      index={index}
      count={count}
      annotationId={annotation.id}
      actions={actions}
      readOnly={readOnly}
      onDiscard={() => undefined}
      onCreated={() => undefined}
    />
  ));
  if (adding) {
    rows.push(
      <EntryRow
        key={`${annotation.id}:${count}`}
        entry={null}
        index={count}
        count={count}
        annotationId={annotation.id}
        actions={actions}
        readOnly={readOnly}
        onDiscard={() => setAdding(false)}
        onCreated={() => setAdding(false)}
      />,
    );
  }

  return (
    <div class="annotation">
      <div class="annotation-header">
        <CommitInput
          class="input annotation-name"
          aria-label={t('annotation.name')}
          placeholder={annotationLabel({ name: null, entries: annotation.entries })}
          value={annotation.name ?? ''}
          disabled={readOnly}
          onCommit={(text) => {
            if ((text.trim() || null) === annotation.name) return false;
            return actions.renameAnnotation(annotation.id, text).ok;
          }}
        />
        <button
          type="button"
          class="button button-danger"
          aria-label={t('annotation.delete')}
          title={t('annotation.delete')}
          disabled={readOnly}
          onClick={() => actions.removeAnnotation(annotation.id)}
        >
          <TrashIcon />
        </button>
      </div>

      <ul class="entries">{rows}</ul>

      <div class="row">
        <button
          type="button"
          class="button"
          disabled={readOnly || adding}
          onClick={() => setAdding(true)}
        >
          {t('annotation.addEntry')}
        </button>
      </div>
    </div>
  );
}
