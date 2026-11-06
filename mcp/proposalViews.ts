import {
  patchProject,
  projectIndex,
  proposalIndex,
  reviewProgress,
  summarizeDecisions,
  droppedNoteOrigin,
  latestRevisionSummary,
  revisionMark,
  visibleRevisedChanges,
  type Change,
  type ChangeStatus,
  type ItemKind,
  type JsonValue,
  type Project,
  type Proposal,
  type ProposalNote,
  type ReviewNode,
  type ReviewTree,
} from '../src/model';
import { Refs } from './items';
import type { LoadedProject } from './projects';

// Visões compactas das propostas para o agente (etapa 4.2): estado de cada mudança, níveis da
// revisão, progresso e notas. Toda regra (níveis, decisões, conflitos) vem de `src/model/`.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rótulos e referências `mapping://` das entidades de uma proposta. Usa o projeto "como
 * ficaria" (com todas as mudanças, para os itens criados) e, na falta dele, o projeto atual
 * (para os itens removidos).
 */
export class ProposalLabels {
  private constructor(
    private readonly proposed: Refs,
    private readonly current: Refs,
  ) {}

  /** `proposed` é o projeto com todas as mudanças da proposta aplicadas (`patchProject`). */
  static of(loaded: LoadedProject, proposed: Project): ProposalLabels {
    return new ProposalLabels(
      new Refs({ ...loaded, project: proposed }),
      new Refs(loaded),
    );
  }

  /** Para a prévia de uma proposta nova: o depois é o resultado do lote. */
  static ofRefs(proposed: Refs, current: Refs): ProposalLabels {
    return new ProposalLabels(proposed, current);
  }

  /** Referência da marcação, container ou anotação; `null` se não existir em nenhum dos dois. */
  ref(kind: ItemKind, id: string): string | null {
    for (const refs of [this.proposed, this.current]) {
      const index = projectIndex(refs.project);
      const map =
        kind === 'm'
          ? index.markings
          : kind === 'i'
            ? index.containers
            : index.annotations;
      if (map.has(id)) return refs.ref(kind, id);
    }
    return null;
  }

  private layerName(id: string): string {
    for (const refs of [this.proposed, this.current]) {
      const layer = projectIndex(refs.project).layers.get(id);
      if (layer) return layer.name;
    }
    return id;
  }

  /** O alvo legível de uma mudança. */
  target(c: Change): string {
    switch (c.entity) {
      case 'image':
        return this.ref('i', c.entityId) ?? `container ${c.entityId}`;
      case 'marking':
        return this.ref('m', c.entityId) ?? `marcação ${c.entityId}`;
      case 'arrow':
        return `seta ${c.entityId}`;
      case 'annotation':
        return this.ref('a', c.entityId) ?? `anotação ${c.entityId}`;
      case 'layer':
        return `camada "${this.layerName(c.entityId)}"`;
      case 'specialization':
        return `especialização ${c.entityId}`;
      case 'platformRepo':
        return `repositório da plataforma ${c.entityId}`;
      case 'docRepo':
        return `repositório de documentos ${c.entityId}`;
    }
  }
}

/** A especialização inteira (`spec`) não vai na resposta: o agente a tem no arquivo que enviou. */
function slim(c: Change, value: JsonValue): JsonValue {
  if (c.entity !== 'specialization' || !isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'spec'));
}

export type ChangeState = 'pending' | 'accepted' | 'rejected' | 'applied';

export function stateOf(p: Proposal, id: string): ChangeState {
  if (Object.hasOwn(p.applied, id)) return 'applied';
  return p.decisions[id]?.state ?? 'pending';
}

export function conflictView(status: ChangeStatus): Json | null {
  if (!status.conflict) return null;
  return status.current === undefined
    ? { current: null, missing: true }
    : { current: status.current };
}

/** A marca de revisão da mudança para o agente (`revised`), ou `null` se nenhuma revisão a cita. */
export function revisedView(p: Proposal, c: Change): Json | null {
  const mark = revisionMark(p, c.id);
  if (mark === null) return null;
  return {
    at: mark.at,
    kind: mark.kind,
    ...(mark.previous
      ? { previous: { to: slim(c, mark.previous.to), state: mark.previous.state } }
      : {}),
  };
}

/** Resumo das revisões da proposta (`revisions`): quantas e a data e as contagens da última. */
export function revisionsView(p: Proposal): Json {
  const last = latestRevisionSummary(p);
  if (last === null) return {};
  return { revisions: { count: p.revisions!.length, last } };
}

/** Pode ser revisada pelo agente: aberta e sem nada aplicado. */
export const isRevisable = (p: Proposal): boolean =>
  p.status === 'open' && Object.keys(p.applied).length === 0;

/** Uma mudança: estado, alvo e valores antes e depois (e conflito/trava, se houver). */
export function changeView(
  p: Proposal,
  c: Change,
  status: ChangeStatus,
  labels: ProposalLabels,
): Json {
  const conflict = conflictView(status);
  // A marca só vale sem decisão (a mesma regra de `visibleRevisedChanges`).
  const revised = p.decisions[c.id] === undefined ? revisedView(p, c) : null;
  return {
    id: c.id,
    state: stateOf(p, c.id),
    kind: c.kind,
    entity: c.entity,
    target: labels.target(c),
    ...(c.field !== null ? { field: c.field } : {}),
    ...(c.kind !== 'create' ? { from: slim(c, c.from) } : {}),
    ...(c.kind !== 'remove' ? { to: slim(c, c.to) } : {}),
    ...(conflict ? { conflict } : {}),
    ...(status.locked ? { locked: true } : {}),
    ...(revised ? { revised } : {}),
  };
}

/** Trocadas e novas que ainda aguardam a decisão do usuário (não são rejeitadas). */
export function awaitingView(p: Proposal, labels: ProposalLabels): Json[] {
  const byId = proposalIndex(p).changes;
  return visibleRevisedChanges(p).map((id) => {
    const c = byId.get(id)!;
    return {
      change: id,
      target: labels.target(c),
      ...(c.field !== null ? { field: c.field } : {}),
      revised: revisedView(p, c),
    };
  });
}

/** Nota que subiu ao nível da proposta: de que mudança retirada ela veio. */
export function droppedFrom(p: Proposal, noteId: string, labels: ProposalLabels): Json {
  const origin = droppedNoteOrigin(p, noteId);
  if (origin === null) return {};
  return {
    fromDroppedChange: {
      id: origin.id,
      target: labels.target(origin),
      ...(origin.field !== null ? { field: origin.field } : {}),
    },
  };
}

/** Contagens que não se sobrepõem: somam o total de mudanças. */
export function progressView(p: Proposal): Json {
  const progress = reviewProgress(p);
  return {
    total: progress.total,
    pending: progress.undecided,
    accepted: progress.acceptedPending,
    rejected: progress.rejected,
    applied: progress.applied,
    complete: progress.complete,
  };
}

function countItems(node: ReviewNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countItems(child), 0);
}

function imageKind(
  p: Proposal,
  imageId: string,
): 'new' | 'removed' | 'changed' | 'items' {
  const own = p.changes.filter((c) => c.entity === 'image' && c.entityId === imageId);
  if (own.some((c) => c.kind === 'create')) return 'new';
  if (own.some((c) => c.kind === 'remove')) return 'removed';
  return own.length > 0 ? 'changed' : 'items';
}

/** Resumo por nível: Projeto e cada container (nível `image` no `proposal.json`), com o estado de decisão e as contagens. */
export function levelsView(p: Proposal, tree: ReviewTree, labels: ProposalLabels): Json {
  const summarize = (node: ReviewNode) => {
    const summary = summarizeDecisions(
      p,
      tree.changeIdsOf({ level: node.level, id: node.id }),
    );
    return {
      state: summary.state,
      changes: summary.total,
      pending: summary.undecided,
      accepted: summary.accepted - summary.applied,
      rejected: summary.rejected,
      applied: summary.applied,
    };
  };
  const project = tree.nodes.get('project:');
  return {
    ...(project ? { project: summarize(project) } : {}),
    containers: tree.root.children
      .filter((node) => node.level === 'image')
      .map((node) => ({
        container: labels.ref('i', node.id!) ?? node.id,
        change: imageKind(p, node.id!),
        items: countItems(node),
        ...summarize(node),
      })),
  };
}

/** Contagens por tipo de mudança, para o resumo de uma proposta nova. */
export function kindCounts(p: Proposal): Json {
  const counts = { create: 0, update: 0, remove: 0 };
  for (const c of p.changes) counts[c.kind]++;
  return { total: p.changes.length, ...counts };
}

/** Nota com o alvo legível (referência do container ou do item; id da mudança). */
export function noteView(p: Proposal, note: ProposalNote, labels: ProposalLabels): Json {
  const { level, id } = note.target;
  let target: string | null = null;
  let on: string | undefined;
  if (level === 'image' && id) target = labels.ref('i', id) ?? id;
  else if (level === 'item' && id) target = labels.ref('m', id) ?? id;
  else if (level === 'change' && id) {
    target = id;
    const change = proposalIndex(p).changes.get(id);
    if (change) on = labels.target(change);
  }
  return {
    id: note.id,
    level,
    ...(target !== null ? { target } : {}),
    ...(on !== undefined ? { on } : {}),
    text: note.text,
    at: note.at,
  };
}

/** O projeto com todas as mudanças da proposta (para rotular itens criados e removidos). */
export function proposedProject(project: Project, p: Proposal): Project {
  return patchProject(project, p.changes).project;
}

const REVISE_HINT =
  'a proposta ainda pode ser corrigida na mesma referência: use revise_proposal (troque o valor com `operations` ou retire com `drop`; mudança aceita fica congelada) em vez de enviar outra proposta';
const SUPERSEDE_HINT =
  'corrija só o que foi rejeitado (e os conflitos) lendo o projeto atual, e envie com propose_changes e supersedes apontando para esta proposta';

/** Texto da dica de `get_proposal_review`: revisar na mesma proposta ou substituí-la. */
export function reviewHint(
  p: Proposal,
  progress: { complete: boolean; undecided: number; acceptedPending: number },
  toFix: number,
): string {
  const revisable = isRevisable(p);
  if (!progress.complete) {
    const wait = `a revisão ainda não terminou (${progress.undecided} sem decisão, ${progress.acceptedPending} aceita(s) sem aplicar)`;
    if (revisable && toFix > 0) return `${wait}, mas há o que corrigir: ${REVISE_HINT}`;
    return `${wait}: avise o usuário e espere antes de ${revisable ? 'corrigir' : 'enviar uma proposta que a substitua (propose_changes com supersedes)'}`;
  }
  if (toFix === 0)
    return 'a revisão terminou sem rejeições nem conflitos: não há o que corrigir';
  return revisable
    ? `a revisão terminou: ${REVISE_HINT}. Se algo foi aplicado ou um pacote de biblioteca é novo, ${SUPERSEDE_HINT}`
    : `a revisão terminou: ${SUPERSEDE_HINT}`;
}
