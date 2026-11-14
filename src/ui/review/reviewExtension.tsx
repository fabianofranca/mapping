import { computed, type ReadonlySignal } from '@preact/signals';
import { t } from '../../i18n';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  annotationField,
  annotationsOf,
  changeLayerId,
  imageField,
  isRecord,
  markingField,
  projectIndex,
  type Annotation,
  type Change,
  type JsonValue,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../model';
import type { EntityChanges, FieldChangeIndex, ReviewView } from '../../store/derived';
import { visibleLayers, type DetailsSection } from '../../store/ui';
import { Button } from '../controls';
import type {
  DetailsExtension,
  RemovedAnnotation,
  RemovedEntry,
  TableRowsExtra,
} from '../DetailsExtension';
import { Icon } from '../icons';
import { Notice } from '../Notice';
import { annotationDisplayName, annotationSummary } from '../typedText';
import { ChangeBelow } from './ChangeBelow';
import { ChangeMark } from './ChangeMark';
import { Flag } from './Flag';
import { OtherChangesSection } from './OtherChanges';
import { IdentityFlags, ReviewHeader, WholeDecision } from './ReviewHeader';

// The review in the Details extension point (phase 9.5): builds, for the shown item, what the
// normal panel asks field by field (markers, badges, ghosts, sections that open, hidden
// layers). It reads only the "changes by entity and field" index
// (`review.derived.fieldIndex`) and the projects; the decisions stay with each marker, the
// header and the badges (components that read the derived state), so deciding does not
// rebuild the extension or the panel.

/** A layer with more annotations than this starts collapsed, with only the headers (E17). */
export const BIG_LAYER = 8;
/** Headers shown at first in a group, and how many "Show more" adds each time. */
const PAGE_FIRST = 12;
const PAGE_STEP = 20;

/** Annotation fields the panel shows (a creation or removal part gets a marker). */
function isAnnotationPanelField(field: string): boolean {
  return (
    field === 'parentAnnotationId' ||
    field === 'parentRole' ||
    field.startsWith(VALUES_FIELD_PREFIX) ||
    field.startsWith(ENTRIES_FIELD_PREFIX)
  );
}

/**
 * Fields that have a place in the normal panel; the entity's other changes (source, lock,
 * marking image swap, image position) stay outside the markers.
 */
const PANEL_FIELDS: Readonly<Record<'marking' | 'image', ReadonlySet<string>>> = {
  marking: new Set(['name', 'rect', 'parentId']),
  image: new Set(['name', 'file', 'markingColor']),
};

/** The changes of an item that has no field in the panel (the "Other changes" cards). */
export function otherChangeIds(
  index: FieldChangeIndex,
  kind: 'marking' | 'image',
  id: string,
): string[] {
  const e = index.entities.get(id);
  if (!e) return [];
  return [...e.fields]
    .filter(([field]) => !PANEL_FIELDS[kind].has(field))
    .map(([, c]) => c.id);
}

/**
 * The sections that hide the change (to open when reaching it from the Proposals window): the
 * panel field, "Other changes", or the annotation with its layer and the Annotations. The
 * creation or removal of the item itself is in no section (it is the header).
 */
export function sectionsForChange(
  c: Change,
  args: Pick<ReviewExtensionArgs, 'kind' | 'id' | 'project' | 'current'>,
): DetailsSection[] {
  if (c.entity === 'annotation') {
    const layer = changeLayerId(c, args.project) ?? changeLayerId(c, args.current);
    return [
      { kind: 'annotations' },
      ...(layer === null ? [] : [{ kind: 'layer', id: layer } as const]),
      { kind: 'annotation', id: c.entityId },
    ];
  }
  if (c.entity === args.kind && c.entityId === args.id) {
    if (c.field === null) return [];
    return [{ kind: PANEL_FIELDS[args.kind].has(c.field) ? args.kind : 'others' }];
  }
  return [{ kind: 'others' }];
}

/** Is the layer of the annotation change hidden in the editor (only "Show here" brings it)? */
export function isChangeLayerHidden(
  c: Change,
  args: Pick<ReviewExtensionArgs, 'project' | 'current' | 'hiddenLayers'>,
): boolean {
  if (c.entity !== 'annotation') return false;
  const layer = changeLayerId(c, args.project) ?? changeLayerId(c, args.current);
  if (layer === null) return false;
  return !visibleLayers(args.project, args.hiddenLayers).some((l) => l.id === layer);
}

/** How many changes the entity has (a creation or removal counts as one). */
function entityCount(e: EntityChanges | undefined): number {
  return e ? e.fields.size + (e.whole ? 1 : 0) : 0;
}

export interface ReviewExtensionArgs {
  readonly kind: 'marking' | 'image';
  readonly id: string;
  /** The project the panel shows (the one in view, or the other side if the item is not in it). */
  readonly project: Project;
  /** The current project (where the annotations and the outgoing pairs come from). */
  readonly current: Project;
  readonly index: FieldChangeIndex;
  readonly view: ReviewView;
  readonly hiddenLayers: ReadonlySet<string>;
  /** "Show here" of the hidden layers with changes (UI state, until the item changes). */
  readonly revealed: boolean;
  readonly onReveal: (revealed: boolean) => void;
  readonly onShowCurrent: () => void;
  /** The open proposal (the name is struck through only while the removal is not rejected). */
  readonly proposal: ReadonlySignal<Proposal | null>;
  /** The item has a node in the review tree (something to decide): it has a header. */
  readonly hasNode: boolean;
  /** Annotation of the selected change, which cannot stay beyond "show more". */
  readonly reveal: ReadonlySignal<string | null>;
  /**
   * The "how it would look" with all changes (`review.derived.fullPreview`): where the
   * created-and-rejected annotation comes from, which the Proposed view lacks. Read only when
   * there is one.
   */
  readonly full: () => Project | null;
}

/** Annotations of changes of this marking, by layer (in the shown project). */
function changesByLayer(
  args: Pick<ReviewExtensionArgs, 'kind' | 'id' | 'project' | 'current' | 'index'>,
): Map<string, Change[]> {
  const result = new Map<string, Change[]>();
  if (args.kind !== 'marking') return result;
  const list = [
    ...(args.index.annotationsOf.get(args.id) ?? []),
    ...(args.index.leaving.get(args.id) ?? []).filter((c) => c.kind !== 'remove'),
  ];
  for (const c of list) {
    const layer = changeLayerId(c, args.project) ?? changeLayerId(c, args.current);
    if (layer === null) continue;
    const bucket = result.get(layer);
    if (bucket) bucket.push(c);
    else result.set(layer, [c]);
  }
  return result;
}

/** Value of an entity field in the shown project (for the marker of a part). */
function fieldValue(
  project: Project,
  e: EntityChanges,
  entityId: string,
  field: string,
): JsonValue | undefined {
  const index = projectIndex(project);
  switch (e.entity) {
    case 'marking': {
      const m = index.markings.get(entityId);
      return m ? markingField(project, m, field) : undefined;
    }
    case 'image': {
      const i = index.containers.get(entityId);
      return i ? imageField(i, field) : undefined;
    }
    case 'annotation': {
      const a = index.annotations.get(entityId);
      return a ? annotationField(a, field) : undefined;
    }
    default:
      return undefined;
  }
}

/** An annotation that goes away, in the place where it was (Proposed view). */
function RemovedAnnotationCard({
  project,
  annotation,
  change,
  onShowCurrent,
}: {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly change: Change;
  readonly onShowCurrent: (() => void) | null;
}) {
  const rejectedCreation = change.kind === 'create';
  const field = change.kind === 'update' ? 'markingId' : '';
  return (
    <div class="annotation annotation-removed" data-annotation={annotation.id}>
      <div class="annotation-header">
        <ChangeMark change={change} field={field} part={false} />
        <del class="annotation-removed-name">
          {annotationDisplayName(project, annotation)}
        </del>
        {change.kind === 'remove' && (
          <Flag icon="minus">{t('review.panel.willBeRemoved')}</Flag>
        )}
        {rejectedCreation && (
          <Flag icon="close">{t('review.panel.creationRejected')}</Flag>
        )}
        {change.kind !== 'update' && <WholeDecision change={change} />}
      </div>
      <p class="annotation-summary">{annotationSummary(project, annotation)}</p>
      {onShowCurrent && (
        <Button size="sm" class="button-link" onClick={onShowCurrent}>
          {t('review.panel.seeCurrent')}
        </Button>
      )}
    </div>
  );
}

/** The Details extension for the item shown in the review. */
export function reviewExtension(args: ReviewExtensionArgs): DetailsExtension {
  const { index, project, current } = args;
  const shownIndex = projectIndex(project);
  const currentIndex = projectIndex(current);
  const byLayer = changesByLayer(args);
  const baseLayers = new Set(visibleLayers(project, args.hiddenLayers).map((l) => l.id));
  // Layers hidden (by the person) with changes on this marking.
  const hiddenWithChanges = project.layers.filter(
    (l) => !baseLayers.has(l.id) && (byLayer.get(l.id)?.length ?? 0) > 0,
  );
  const hiddenIds = new Set(hiddenWithChanges.map((l) => l.id));

  const itemTarget: ReviewTarget = {
    level: args.kind === 'marking' ? 'item' : 'image',
    id: args.id,
  };
  // Struck through only while the removal holds: once rejected, the entity stays (a computed,
  // so the panel does not redo on every decision, only when this one flips).
  const wholeOf = index.entities.get(args.id)?.whole ?? null;
  const removalRejected = computed(
    () =>
      wholeOf !== null &&
      args.proposal.value?.decisions[wholeOf.id]?.state === 'rejected',
  );

  const below = (entityId: string, field: string) => {
    const c = index.entities.get(entityId)?.fields.get(field);
    return c ? <ChangeBelow changeId={c.id} /> : null;
  };

  const mark = (entityId: string, field: string) => {
    const e = index.entities.get(entityId);
    if (!e) return null;
    if (field === '') {
      return e.whole ? <ChangeMark change={e.whole} field="" part={false} /> : null;
    }
    if (e.whole) {
      // Field of a created or removed entity: the part, with no decision of its own.
      if (e.entity === 'annotation' && !isAnnotationPanelField(field)) return null;
      return (
        <ChangeMark
          change={e.whole}
          field={field}
          part
          value={fieldValue(project, e, entityId, field) ?? null}
        />
      );
    }
    const c = e.fields.get(field);
    return c ? <ChangeMark change={c} field={field} part={false} /> : null;
  };

  const sectionSummary = (section: DetailsSection): string | null => {
    let count = 0;
    let allNew = false;
    switch (section.kind) {
      case 'marking':
      case 'image': {
        if (section.kind !== args.kind) return null;
        const e = index.entities.get(args.id);
        count = entityCount(e);
        allNew = e?.whole?.kind === 'create';
        break;
      }
      case 'others':
        count = otherChangeIds(index, args.kind, args.id).length;
        break;
      case 'images':
        return null;
      case 'annotations':
        if (args.kind !== 'marking') return null;
        count = [...byLayer.values()].reduce((n, list) => n + list.length, 0);
        break;
      case 'layer':
        count = byLayer.get(section.id)?.length ?? 0;
        break;
      case 'annotation': {
        const e = index.entities.get(section.id);
        count = entityCount(e);
        allNew = e?.whole?.kind === 'create';
        break;
      }
    }
    if (count === 0) return null;
    return allNew ? t('review.panel.allNew') : t('review.panel.changes', { count });
  };

  // Rejected annotation creations are not in the Proposed view: they come back as a card in
  // the place where they would go, with the decision there (otherwise the rejection could not
  // be undone in the panel). A text key: the panel only redoes when this set changes, not on
  // every decision.
  const rejectedCreations = computed(() => {
    const decisions = args.proposal.value?.decisions;
    if (!decisions || args.view !== 'proposed') return '';
    return (index.annotationsOf.get(args.id) ?? [])
      .filter((c) => c.kind === 'create' && decisions[c.id]?.state === 'rejected')
      .map((c) => c.id)
      .join(',');
  });

  const removedAnnotations = (
    markingId: string,
    layerId: string,
  ): RemovedAnnotation[] => {
    const result: RemovedAnnotation[] = [];
    const rejected = new Set(
      rejectedCreations.value.split(',').filter((id) => id !== ''),
    );
    if (rejected.size > 0) {
      const full = args.full();
      const fullIndex = full ? projectIndex(full) : null;
      for (const c of index.annotationsOf.get(markingId) ?? []) {
        if (!rejected.has(c.id)) continue;
        const a = fullIndex?.annotations.get(c.entityId);
        if (!full || !a || a.layerId !== layerId) continue;
        if (shownIndex.annotations.has(a.id)) continue;
        const position = annotationsOf(full, markingId, layerId).findIndex(
          (x) => x.id === a.id,
        );
        result.push({
          id: `rejected:${a.id}`,
          index: Math.max(0, position),
          node: (
            <RemovedAnnotationCard
              project={full}
              annotation={a}
              change={c}
              onShowCurrent={null}
            />
          ),
        });
      }
    }
    for (const c of index.leaving.get(markingId) ?? []) {
      const a = currentIndex.annotations.get(c.entityId);
      if (!a || a.layerId !== layerId || a.markingId !== markingId) continue;
      // Still on the shown marking (Current view, or the rejected removal).
      if (shownIndex.annotations.get(a.id)?.markingId === markingId) continue;
      const position = annotationsOf(current, markingId, layerId).findIndex(
        (x) => x.id === a.id,
      );
      result.push({
        id: `removed:${a.id}`,
        index: Math.max(0, position),
        node: (
          <RemovedAnnotationCard
            project={current}
            annotation={a}
            change={c}
            onShowCurrent={args.onShowCurrent}
          />
        ),
      });
    }
    return result.sort((a, b) => a.index - b.index);
  };

  const removedEntries = (annotationId: string): RemovedEntry[] => {
    const e = index.entities.get(annotationId);
    if (!e) return [];
    const before = currentIndex.annotations.get(annotationId);
    const shown = shownIndex.annotations.get(annotationId);
    if (!before || !shown || shown.type !== null) return [];
    const result: RemovedEntry[] = [];
    for (const [field, c] of e.fields) {
      if (!field.startsWith(ENTRIES_FIELD_PREFIX) || c.to !== null) continue;
      const entryId = field.slice(ENTRIES_FIELD_PREFIX.length);
      if (shown.entries.some((x) => x.id === entryId)) continue;
      const position = before.entries.findIndex((x) => x.id === entryId);
      const entry =
        before.entries[position] ??
        (isRecord(c.from)
          ? {
              id: entryId,
              key: typeof c.from.key === 'string' ? c.from.key : '',
              value: typeof c.from.value === 'string' ? c.from.value : '',
            }
          : null);
      if (entry) {
        result.push({ entry, index: position < 0 ? before.entries.length : position });
      }
    }
    return result.sort((a, b) => a.index - b.index);
  };

  const tableRows = (annotationId: string, key: string): TableRowsExtra | null => {
    const c = index.entities
      .get(annotationId)
      ?.fields.get(`${VALUES_FIELD_PREFIX}${key}`);
    if (!c) return null;
    const ids = (value: JsonValue) =>
      new Set(
        Array.isArray(value)
          ? value.flatMap((row) =>
              isRecord(row) && typeof row._id === 'string' ? [row._id] : [],
            )
          : [],
      );
    const from = ids(c.from);
    const to = ids(c.to);
    const added = new Set([...to].filter((id) => !from.has(id)));
    const removed = [...from].filter((id) => !to.has(id)).length;
    return {
      added,
      addedLabel: t('review.panel.rowAdded'),
      note: removed > 0 ? t('review.panel.rowsRemoved', { count: removed }) : null,
    };
  };

  return {
    mark,
    below,
    header: (entityId) =>
      entityId === args.id && args.hasNode ? (
        <ReviewHeader target={itemTarget} whole={wholeOf} />
      ) : null,
    decision: (entityId) => {
      const whole = index.entities.get(entityId)?.whole;
      return whole && whole.entity === 'annotation' ? (
        <WholeDecision change={whole} />
      ) : null;
    },
    others: (entityId) => {
      if (entityId !== args.id) return null;
      const ids = otherChangeIds(index, args.kind, args.id);
      return ids.length > 0 ? <OtherChangesSection ids={ids} /> : null;
    },
    identity: (entityId) => {
      if (entityId !== args.id || !args.hasNode) return null;
      return {
        flags: <IdentityFlags target={itemTarget} whole={wholeOf} />,
        struck: wholeOf?.kind === 'remove' && !removalRejected.value,
      };
    },
    sectionSummary,
    layers: () =>
      project.layers.filter(
        (l) => baseLayers.has(l.id) || (args.revealed && hiddenIds.has(l.id)),
      ),
    layerTag: (layerId) =>
      args.revealed && hiddenIds.has(layerId) ? (
        <Flag icon="eyeOff">{t('review.panel.hiddenTag')}</Flag>
      ) : null,
    annotationsNotice: () => {
      if (hiddenWithChanges.length === 0) return null;
      const count = hiddenWithChanges.reduce(
        (n, l) => n + (byLayer.get(l.id)?.length ?? 0),
        0,
      );
      return (
        <Notice
          tone="info"
          size="sm"
          icon="eyeOff"
          actions={
            <Button size="sm" onClick={() => args.onReveal(!args.revealed)}>
              <Icon name={args.revealed ? 'eyeOff' : 'eye'} />
              {args.revealed ? t('review.panel.hideAgain') : t('review.panel.showHere')}
            </Button>
          }
        >
          <span>
            {t('review.panel.hiddenLayers', {
              count,
              layers: hiddenWithChanges.map((l) => l.name).join(', '),
            })}
          </span>
        </Notice>
      );
    },
    removedAnnotations,
    removedEntries,
    tableRows,
    annotationPage: {
      first: PAGE_FIRST,
      step: PAGE_STEP,
      label: (count) => t('review.panel.showMore', { count }),
      reveal: args.reveal,
    },
    // Read at render time: the panel's `useMemo` does not depend on the language.
    get markColumn() {
      return t('review.mark.column');
    },
  };
}

/**
 * Sections to open and to collapse when showing the item (HANDOFF-REVIEW-DETAILS 5.2): they
 * open the item section, the Annotations, the layers and the annotations with changes; a layer
 * with more than `BIG_LAYER` annotations starts collapsed and its annotations show only the
 * header.
 */
export function sectionsFor(
  args: Pick<ReviewExtensionArgs, 'kind' | 'id' | 'project' | 'current' | 'index'>,
): { readonly open: DetailsSection[]; readonly close: DetailsSection[] } {
  const open: DetailsSection[] = [];
  const close: DetailsSection[] = [];
  const { index, project, kind, id } = args;
  if (entityCount(index.entities.get(id)) > 0) open.push({ kind });
  if (kind !== 'marking') return { open, close };
  const byLayer = changesByLayer(args);
  const leavingCount = (index.leaving.get(id) ?? []).length;
  if (byLayer.size > 0 || leavingCount > 0) open.push({ kind: 'annotations' });
  for (const [layerId, list] of byLayer) {
    const all = annotationsOf(project, id, layerId);
    if (all.length > BIG_LAYER) {
      close.push({ kind: 'layer', id: layerId });
      for (const a of all) close.push({ kind: 'annotation', id: a.id });
      continue;
    }
    open.push({ kind: 'layer', id: layerId });
    for (const c of list) open.push({ kind: 'annotation', id: c.entityId });
  }
  for (const c of index.leaving.get(id) ?? []) {
    const layer = changeLayerId(c, args.current);
    if (layer !== null) open.push({ kind: 'layer', id: layer });
  }
  return { open, close };
}
