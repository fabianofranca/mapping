import type { Change, Proposal, ProposalRevision, RevisedPriorState } from './proposal';
import type { JsonValue } from './types';

// Leitura da marca "Revisada" (etapa #644, decisão 5): funções puras sobre `Proposal.revisions`
// para a interface e o MCP. A marca de uma mudança é a revisão mais nova que a cita.

export interface RevisionMark {
  /** `changed`: o agente trocou a mudança; `added`: ela entrou numa revisão. */
  readonly kind: 'changed' | 'added';
  readonly at: string;
  /** Só em `changed`: o `to` e a decisão de antes dessa revisão. */
  readonly previous?: { readonly to: JsonValue; readonly state: RevisedPriorState };
}

const EMPTY: ReadonlyMap<string, RevisionMark> = new Map();

interface Cached {
  readonly changes: readonly Change[];
  readonly marks: ReadonlyMap<string, RevisionMark>;
}

const cache = new WeakMap<readonly ProposalRevision[], Cached>();

/** Marca de cada id citado, a revisão mais nova vence (as revisões vêm da mais antiga). */
function collectMarks(
  revisions: readonly ProposalRevision[],
  changes: readonly Change[],
): ReadonlyMap<string, RevisionMark> {
  const marks = new Map<string, RevisionMark>();
  for (const r of revisions) {
    for (const [id, prior] of Object.entries(r.changed)) {
      marks.set(id, {
        kind: 'changed',
        at: r.at,
        previous: { to: prior.to, state: prior.state },
      });
    }
    for (const id of r.added) marks.set(id, { kind: 'added', at: r.at });
  }
  const present = new Set(changes.map((c) => c.id));
  for (const id of [...marks.keys()]) {
    if (!present.has(id)) marks.delete(id);
  }
  return marks;
}

/** Marcas de todas as mudanças que ainda estão na proposta (memoizado pelas revisões). */
export function revisionMarks(p: Proposal): ReadonlyMap<string, RevisionMark> {
  const revisions = p.revisions;
  if (revisions === undefined || revisions.length === 0) return EMPTY;
  const cached = cache.get(revisions);
  if (cached && cached.changes === p.changes) return cached.marks;
  const marks = collectMarks(revisions, p.changes);
  cache.set(revisions, { changes: p.changes, marks });
  return marks;
}

/** A marca da mudança, ou `null` se nenhuma revisão a cita ou ela já não está em `changes`. */
export function revisionMark(p: Proposal, changeId: string): RevisionMark | null {
  return revisionMarks(p).get(changeId) ?? null;
}

/**
 * Ids (na ordem de `changes`) com marca e sem decisão: a marca "Revisada" só aparece sem
 * decisão; decidir tira da tela e limpar a decisão traz de volta.
 */
export function visibleRevisedChanges(p: Proposal): string[] {
  const marks = revisionMarks(p);
  if (marks.size === 0) return [];
  return p.changes
    .filter((c) => marks.has(c.id) && p.decisions[c.id] === undefined)
    .map((c) => c.id);
}

/** Resumo da revisão mais nova (quantas mudanças trocou, acrescentou e retirou), ou `null`. */
export function latestRevisionSummary(
  p: Proposal,
): { at: string; changed: number; added: number; dropped: number } | null {
  const latest = p.revisions?.[p.revisions.length - 1];
  if (latest === undefined) return null;
  return {
    at: latest.at,
    changed: Object.keys(latest.changed).length,
    added: latest.added.length,
    dropped: latest.dropped.length,
  };
}

/** A mudança retirada de onde a nota (que subiu ao nível da proposta) veio, ou `null`. */
export function droppedNoteOrigin(p: Proposal, noteId: string): Change | null {
  for (const r of p.revisions ?? []) {
    const found = r.dropped.find((d) => d.notes.includes(noteId));
    if (found) return found.change;
  }
  return null;
}

/**
 * Ids das mudanças que uma revisão que a pessoa ainda não viu trocou ou acrescentou: as
 * revisões de `current` além das que `seen` já tinha. Base da guarda da decisão na app
 * (etapa #644, decisão 8): decidir uma delas é recusado até a sessão adotar a versão nova.
 */
export function unseenRevisedIds(seen: Proposal, current: Proposal): ReadonlySet<string> {
  const known = seen.revisions?.length ?? 0;
  const fresh = (current.revisions ?? []).slice(known);
  if (fresh.length === 0) return new Set();
  const present = new Set(current.changes.map((c) => c.id));
  const ids = new Set<string>();
  for (const r of fresh) {
    for (const id of [...Object.keys(r.changed), ...r.added]) {
      if (present.has(id)) ids.add(id);
    }
  }
  return ids;
}

/**
 * A revisão e a mudança retirada de onde a nota de uma mudança que já não existe saiu (ela
 * sobe ao nível da proposta), ou `null` se a mudança nunca foi retirada.
 */
export function droppedEntryOf(
  p: Proposal,
  changeId: string,
): { revisionIndex: number; droppedIndex: number } | null {
  const revisions = p.revisions ?? [];
  for (let revisionIndex = revisions.length - 1; revisionIndex >= 0; revisionIndex--) {
    const droppedIndex =
      revisions[revisionIndex]?.dropped.findIndex((d) => d.change.id === changeId) ?? -1;
    if (droppedIndex >= 0) return { revisionIndex, droppedIndex };
  }
  return null;
}

/** Acrescenta o id da nota às notas da mudança retirada (a origem de "Da mudança retirada"). */
export function withDroppedNote(
  p: Proposal,
  where: { revisionIndex: number; droppedIndex: number },
  noteId: string,
): Proposal {
  const revisions = (p.revisions ?? []).map((r, i) =>
    i !== where.revisionIndex
      ? r
      : {
          ...r,
          dropped: r.dropped.map((d, j) =>
            j === where.droppedIndex ? { ...d, notes: [...d.notes, noteId] } : d,
          ),
        },
  );
  return { ...p, revisions };
}
