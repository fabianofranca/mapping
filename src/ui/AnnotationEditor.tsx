import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  annotationDeletionImpact,
  childTypesOf,
  getBacklinks,
  getLinkedAnnotations,
  rawValueLines,
  refsBrokenBy,
  removeEntry,
  typeOfAnnotation,
  validAnnotationOwners,
  type Annotation,
  type ChildType,
  type Entry,
  type Layer,
  type Project,
} from '../model';
import type { ProjectActions } from '../store/project';
import type { AnnotationLocation } from '../store/ui';
import { IssueBadge, IssueList } from './AnnotationSummary';
import { CommitInput } from './CommitInput';
import { Dialog } from './Dialog';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, TrashIcon } from './icons';
import { annotationErrorMessage, annotationLabel } from './labels';
import { BacklinkList, TypedField } from './TypedFields';
import { annotationDisplayName, labelTexts } from './typedText';

interface AnnotationEditorProps {
  readonly project: Project;
  readonly annotation: Annotation;
  /** Ids das camadas visíveis (as vinculadas em camadas ocultas oferecem mostrá-las). */
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onShowLayer: (layerId: string) => void;
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
  /** Remove o par gravado (com confirmação se ele for alvo de referências). */
  readonly onRemove: () => void;
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
  onRemove,
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
    <>
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
          onClick={() => (entry ? onRemove() : onDiscard())}
        >
          <CloseIcon />
        </button>
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Confirmação de exclusão que quebra referências (anotação ou tupla). */
type PendingDelete =
  | { readonly kind: 'annotation'; readonly brokenRefs: number; readonly linked: number }
  | {
      readonly kind: 'entry';
      readonly index: number;
      readonly key: string;
      readonly brokenRefs: number;
    };

/** Pares de uma anotação livre, com as referências recebidas por tupla. */
function FreeEntries({
  project,
  annotation,
  actions,
  readOnly,
  onGoToAnnotation,
  onRemoveEntry,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onRemoveEntry: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const count = annotation.entries.length;
  const backlinks = getBacklinks(project, annotation.id);

  // Lista única, com o par novo na posição que terá depois de gravado: a linha
  // mantém a mesma chave (e o foco) quando a chave é gravada ao passar para o valor.
  const rows = annotation.entries.map((entry, index) => (
    <li key={`${annotation.id}:${index}`} class="entry">
      <EntryRow
        entry={entry}
        index={index}
        count={count}
        annotationId={annotation.id}
        actions={actions}
        readOnly={readOnly}
        onDiscard={() => undefined}
        onCreated={() => undefined}
        onRemove={() => onRemoveEntry(index)}
      />
      <BacklinkList
        project={project}
        backlinks={backlinks.filter(
          (b) => 'entryId' in b.ref && b.ref.entryId === entry.id,
        )}
        onGoToAnnotation={onGoToAnnotation}
      />
    </li>
  ));
  if (adding) {
    rows.push(
      <li key={`${annotation.id}:${count}`} class="entry">
        <EntryRow
          entry={null}
          index={count}
          count={count}
          annotationId={annotation.id}
          actions={actions}
          readOnly={readOnly}
          onDiscard={() => setAdding(false)}
          onCreated={() => setAdding(false)}
          onRemove={() => undefined}
        />
      </li>,
    );
  }
  return (
    <>
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
    </>
  );
}

/** Campos da anotação tipada; tipo inexistente: valores somente leitura e "Converter". */
function TypedBody({
  project,
  annotation,
  actions,
  readOnly,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly actions: ProjectActions;
  readonly readOnly: boolean;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  const resolved = typeOfAnnotation(project, annotation);
  if (!resolved) {
    return (
      <>
        <p class="notice">
          {t('typed.unknownType', { type: annotation.type?.typeId ?? '' })}
        </p>
        <ul class="raw-values">
          {rawValueLines(annotation).map((line) => (
            <li key={line.key}>
              <strong>{line.key}:</strong> {line.text}
            </li>
          ))}
        </ul>
        <div class="row">
          <button
            type="button"
            class="button"
            disabled={readOnly}
            onClick={() => actions.convertAnnotationToFree(annotation.id, labelTexts())}
          >
            {t('typed.convertToFree')}
          </button>
        </div>
      </>
    );
  }
  const ctx = { project, annotation, actions, readOnly, onGoToAnnotation };
  return (
    <>
      {resolved.type.description && (
        <p class="muted typed-description">{resolved.type.description}</p>
      )}
      <div class="typed-fields">
        {resolved.type.fields.map((field) => (
          <TypedField key={field.key} field={field} {...ctx} />
        ))}
      </div>
    </>
  );
}

/** Uma anotação: livre (nome + pares) ou tipada (campos do tipo). */
export function AnnotationEditor({
  project,
  annotation,
  visibleLayerIds,
  onGoToAnnotation,
  onShowLayer,
  actions,
  readOnly,
}: AnnotationEditorProps) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  /** Filho criado numa camada oculta: oferece mostrá-la. */
  const [hiddenChild, setHiddenChild] = useState<{
    readonly child: ChildType;
    readonly layer: Layer;
  } | null>(null);
  const typed = annotation.type !== null;
  const resolved = typeOfAnnotation(project, annotation);

  const layerOf = (id: string): Layer | undefined =>
    project.layers.find((l) => l.id === id);
  const owners = validAnnotationOwners(project, annotation.id);
  const owner = annotation.parentAnnotationId
    ? project.annotations.find((a) => a.id === annotation.parentAnnotationId)
    : undefined;
  const linked = getLinkedAnnotations(project, annotation.id);
  // Resumo das vinculadas, agrupado por camada na ordem das camadas.
  const linkedGroups = project.layers
    .map((layer) => ({
      layer,
      items: linked.filter((a) => a.layerId === layer.id),
    }))
    .filter((g) => g.items.length > 0);
  const children = typed ? childTypesOf(project, annotation.id) : [];
  const ownerRequired = resolved?.type.requiresOwner === true;
  const name = (a: Annotation) => annotationDisplayName(project, a);

  const requestDelete = () => {
    const impact = annotationDeletionImpact(project, annotation.id);
    if (impact.brokenRefs > 0) {
      setPending({
        kind: 'annotation',
        brokenRefs: impact.brokenRefs,
        linked: impact.annotations - 1,
      });
    } else {
      actions.removeAnnotation(annotation.id);
    }
  };

  const requestRemoveEntry = (index: number) => {
    const brokenRefs = refsBrokenBy(project, (p) => removeEntry(p, annotation.id, index));
    if (brokenRefs > 0) {
      const key = annotation.entries[index]?.key ?? '';
      setPending({ kind: 'entry', index, key, brokenRefs });
    } else {
      actions.removeEntry(annotation.id, index);
    }
  };

  const confirmDelete = () => {
    if (!pending) return;
    setPending(null);
    if (pending.kind === 'annotation') actions.removeAnnotation(annotation.id);
    else actions.removeEntry(annotation.id, pending.index);
  };

  const addChild = (child: ChildType) => {
    if (!child.layer) return;
    const result = actions.addTypedAnnotation(
      annotation.markingId,
      child.layer.id,
      child.type,
      annotation.id,
    );
    if (!result.ok) return;
    if (visibleLayerIds.has(child.layer.id)) {
      setHiddenChild(null);
      onGoToAnnotation({
        id: result.value,
        markingId: annotation.markingId,
        layerId: child.layer.id,
      });
    } else {
      setHiddenChild({ child, layer: child.layer });
    }
  };

  return (
    <div
      class={typed ? 'annotation annotation-typed' : 'annotation'}
      data-annotation={annotation.id}
    >
      {typed && (
        <div class="annotation-title">
          <IssueBadge project={project} annotation={annotation} />
          <strong>{name(annotation)}</strong>
        </div>
      )}
      <div class="annotation-header">
        {!typed && <IssueBadge project={project} annotation={annotation} />}
        <CommitInput
          class="input annotation-name"
          aria-label={typed ? t('typed.instanceName') : t('annotation.name')}
          placeholder={
            typed
              ? t('typed.instanceName')
              : annotationLabel({ name: null, entries: annotation.entries })
          }
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
          onClick={requestDelete}
        >
          <TrashIcon />
        </button>
      </div>

      {owner && (
        <p class="annotation-linked muted">
          {t('annotation.linkedTo', { name: name(owner) })}
        </p>
      )}

      <IssueList project={project} annotation={annotation} />

      {typed ? (
        <TypedBody
          project={project}
          annotation={annotation}
          actions={actions}
          readOnly={readOnly}
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : (
        <FreeEntries
          project={project}
          annotation={annotation}
          actions={actions}
          readOnly={readOnly}
          onGoToAnnotation={onGoToAnnotation}
          onRemoveEntry={requestRemoveEntry}
        />
      )}

      {children.length > 0 && (
        <div class="row child-actions">
          {children.map((child) => (
            <button
              key={child.type.typeId}
              type="button"
              class="button"
              title={t('typed.addChildIn', {
                type: child.definition.name,
                layer: child.layer?.name ?? '',
              })}
              disabled={readOnly || !child.layer}
              onClick={() => addChild(child)}
            >
              {t('typed.addChild', { type: child.definition.name })}
            </button>
          ))}
        </div>
      )}
      {hiddenChild && (
        <p class="notice notice-info" role="status">
          {t('typed.childHidden', {
            type: hiddenChild.child.definition.name,
            layer: hiddenChild.layer.name,
          })}{' '}
          <button
            type="button"
            class="link-button"
            onClick={() => {
              onShowLayer(hiddenChild.layer.id);
              setHiddenChild(null);
            }}
          >
            {t('typed.showLayer', { layer: hiddenChild.layer.name })}
          </button>
        </p>
      )}

      <label class="field field-check">
        <input
          type="checkbox"
          checked={annotation.inherit}
          disabled={readOnly}
          onChange={(e) =>
            actions.setAnnotationInherit(annotation.id, e.currentTarget.checked)
          }
        />
        <span>{t('annotation.inherit')}</span>
      </label>

      <label class="field">
        {t('annotation.owner')}
        <select
          class="input"
          value={annotation.parentAnnotationId ?? ''}
          disabled={readOnly}
          onChange={(e) => {
            const value = e.currentTarget.value;
            actions.setAnnotationParent(annotation.id, value === '' ? null : value);
          }}
        >
          {(!ownerRequired || annotation.parentAnnotationId === null) && (
            <option value="">{t('annotation.noOwner')}</option>
          )}
          {owners.map((a) => (
            <option key={a.id} value={a.id}>
              {t('annotation.ownerOption', {
                layer: layerOf(a.layerId)?.name ?? '',
                name: name(a),
              })}
            </option>
          ))}
        </select>
      </label>

      {linkedGroups.length > 0 && (
        <div class="annotation-linked-summary">
          <strong class="annotation-linked-title">{t('annotation.linkedHeading')}</strong>
          {linkedGroups.map(({ layer, items }) => (
            <div
              key={layer.id}
              class="linked-group"
              style={{ '--layer-color': layer.color }}
            >
              <span class="linked-layer">
                <span class="layer-dot" aria-hidden="true" />
                {layer.name}:
              </span>
              {items.map((a) =>
                visibleLayerIds.has(layer.id) ? (
                  <button
                    key={a.id}
                    type="button"
                    class="link-button"
                    title={t('annotation.goToAnnotation', { name: name(a) })}
                    onClick={() => onGoToAnnotation(a)}
                  >
                    {name(a)}
                  </button>
                ) : (
                  <button
                    key={a.id}
                    type="button"
                    class="link-button"
                    title={t('annotation.showLayer', { layer: layer.name })}
                    onClick={() => {
                      onShowLayer(layer.id);
                      onGoToAnnotation(a);
                    }}
                  >
                    {name(a)} ({t('annotation.showLayer', { layer: layer.name })})
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {pending && (
        <Dialog
          title={t('ref.deleteTitle')}
          onCancel={() => setPending(null)}
          actions={
            <>
              <button type="button" class="button" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" class="button button-danger" onClick={confirmDelete}>
                {t('common.delete')}
              </button>
            </>
          }
        >
          {pending.kind === 'annotation' ? (
            <>
              <p>
                {t('ref.deleteAnnotation', {
                  name: name(annotation),
                  count: pending.brokenRefs,
                })}
              </p>
              {pending.linked > 0 && (
                <p>{t('ref.deleteLinked', { count: pending.linked })}</p>
              )}
            </>
          ) : (
            <p>
              {t('ref.deleteEntry', { name: pending.key, count: pending.brokenRefs })}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
