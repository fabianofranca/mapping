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

// A revisão no ponto de extensão dos Detalhes (fase 9.5): monta, para o item mostrado, o
// que o painel normal pergunta campo a campo (marcadores, selos, fantasmas, seções que
// abrem, camadas escondidas). Lê só o índice "mudanças por entidade e campo"
// (`review.derived.fieldIndex`) e os projetos; as decisões ficam com cada marcador, o
// cabeçalho e os selos (componentes que leem o derivado), então decidir não refaz a extensão
// nem o painel.

/** Camada com mais anotações que isto começa recolhida, só com os cabeçalhos (E17). */
export const BIG_LAYER = 8;
/** Cabeçalhos mostrados de início num grupo e de quantos em quantos o "Mostrar mais" acrescenta. */
const PAGE_FIRST = 12;
const PAGE_STEP = 20;

/** Campos da anotação que o painel mostra (uma parte de criação ou remoção leva marcador). */
function isAnnotationPanelField(field: string): boolean {
  return (
    field === 'parentAnnotationId' ||
    field.startsWith(VALUES_FIELD_PREFIX) ||
    field.startsWith(ENTRIES_FIELD_PREFIX)
  );
}

/**
 * Campos que têm lugar no painel normal; as outras mudanças da entidade (origem, trava,
 * troca de imagem da marcação, posição da imagem) ficam fora dos marcadores.
 */
const PANEL_FIELDS: Readonly<Record<'marking' | 'image', ReadonlySet<string>>> = {
  marking: new Set(['name', 'rect', 'parentId']),
  image: new Set(['name', 'file', 'markingColor']),
};

/** As mudanças de um item sem campo no painel (os cartões de "Outras mudanças"). */
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
 * As seções que escondem a mudança (para abrir ao chegar nela pela janela Propostas): o
 * campo do painel, "Outras mudanças" ou a anotação com a camada e as Anotações. A criação
 * ou a remoção do próprio item não está em seção nenhuma (é o cabeçalho).
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

/** A camada da mudança de anotação está escondida no editor (só o "Mostrar aqui" a traz)? */
export function isChangeLayerHidden(
  c: Change,
  args: Pick<
    ReviewExtensionArgs,
    'project' | 'current' | 'hiddenLayers' | 'activeLayerId'
  >,
): boolean {
  if (c.entity !== 'annotation') return false;
  const layer = changeLayerId(c, args.project) ?? changeLayerId(c, args.current);
  if (layer === null) return false;
  return !visibleLayers(args.project, args.hiddenLayers, args.activeLayerId).some(
    (l) => l.id === layer,
  );
}

/** Quantas mudanças a entidade tem (a criação ou remoção conta uma). */
function entityCount(e: EntityChanges | undefined): number {
  return e ? e.fields.size + (e.whole ? 1 : 0) : 0;
}

/** Camada de uma mudança de anotação no projeto mostrado (ou na própria mudança). */
function layerOf(c: Change, project: Project): string | null {
  return changeLayerId(c, project);
}

export interface ReviewExtensionArgs {
  readonly kind: 'marking' | 'image';
  readonly id: string;
  /** O projeto que o painel mostra (o à vista, ou o outro lado se o item não está nele). */
  readonly project: Project;
  /** O projeto atual (de onde vêm as anotações e os pares que saem). */
  readonly current: Project;
  readonly index: FieldChangeIndex;
  readonly view: ReviewView;
  readonly hiddenLayers: ReadonlySet<string>;
  readonly activeLayerId: string | null;
  /** "Mostrar aqui" das camadas escondidas com mudanças (estado de UI, até trocar de item). */
  readonly revealed: boolean;
  readonly onReveal: (revealed: boolean) => void;
  readonly onShowCurrent: () => void;
  /** A proposta aberta (o nome sai riscado só enquanto a remoção não foi rejeitada). */
  readonly proposal: ReadonlySignal<Proposal | null>;
  /** O item tem nó na árvore da revisão (algo a decidir): tem cabeçalho. */
  readonly hasNode: boolean;
  /** Anotação da mudança selecionada, que não pode ficar além do "mostrar mais". */
  readonly reveal: ReadonlySignal<string | null>;
  /**
   * O "como ficaria" com todas as mudanças (`review.derived.fullPreview`): de onde vem a
   * anotação criada e rejeitada, que a visão Proposto não tem. Lido só quando há uma.
   */
  readonly full: () => Project | null;
}

/** Anotações de mudanças desta marcação, por camada (no projeto mostrado). */
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
    const layer = layerOf(c, args.project) ?? layerOf(c, args.current);
    if (layer === null) continue;
    const bucket = result.get(layer);
    if (bucket) bucket.push(c);
    else result.set(layer, [c]);
  }
  return result;
}

/** Valor de um campo da entidade no projeto mostrado (para o marcador de uma parte). */
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

/** Uma anotação que sai, no lugar onde estava (visão Proposto, decisão 3 da seção 10). */
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

/** A extensão dos Detalhes para o item mostrado na revisão. */
export function reviewExtension(args: ReviewExtensionArgs): DetailsExtension {
  const { index, project, current } = args;
  const shownIndex = projectIndex(project);
  const currentIndex = projectIndex(current);
  const byLayer = changesByLayer(args);
  const baseLayers = new Set(
    visibleLayers(project, args.hiddenLayers, args.activeLayerId).map((l) => l.id),
  );
  // Camadas escondidas (pela pessoa) com mudanças nesta marcação.
  const hiddenWithChanges = project.layers.filter(
    (l) => !baseLayers.has(l.id) && (byLayer.get(l.id)?.length ?? 0) > 0,
  );
  const hiddenIds = new Set(hiddenWithChanges.map((l) => l.id));

  const itemTarget: ReviewTarget = {
    level: args.kind === 'marking' ? 'item' : 'image',
    id: args.id,
  };
  // Riscado só enquanto a remoção vale: rejeitada, a entidade fica (um computed, para o
  // painel não refazer a cada decisão, só quando esta vira).
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
      // Campo de uma entidade criada ou removida: a parte, sem decisão própria.
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

  // As criações de anotação rejeitadas não estão na visão Proposto: voltam como cartão no
  // lugar onde entrariam, com a decisão ali (senão a rejeição não teria como ser desfeita
  // no painel). Uma chave de texto: o painel só refaz quando esse conjunto muda, não a cada
  // decisão.
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
      // Ainda está na marcação mostrada (visão Atual, ou a remoção rejeitada).
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
    markColumn: t('review.mark.column'),
  };
}

/**
 * Seções a abrir e a recolher ao mostrar o item (HANDOFF-REVIEW-DETAILS 5.2): abrem a
 * seção do item, as Anotações, as camadas e as anotações com mudanças; camada com mais de
 * `BIG_LAYER` anotações começa recolhida e as anotações dela, só pelo cabeçalho.
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
