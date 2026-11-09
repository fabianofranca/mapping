import {
  PROPOSAL_DRAWING_MODE_FORMAT_VERSION,
  PROPOSAL_REVISED_FORMAT_VERSION,
  usesDrawingMode,
  type Change,
  type Proposal,
  type ProposalDecisions,
  type ProposalNote,
  type ProposalRevision,
  type RevisedPriorState,
  type RevisionDropped,
} from './proposal';
import { computeChanges } from './proposalChanges';
import { patchProject, validateAccepted, type ProposalIssue } from './proposalApply';
import { dependentChanges, proposalIndex } from './proposalReview';
import { jsonEqual } from './proposalValues';
import type { JsonValue, Project } from './types';

// Revisão da proposta pelo agente (etapa #644, CP1). O agente corrige uma proposta aberta e sem
// nada aplicado: retira mudanças (`drop`) e aplica um lote de operações sobre o **proposto
// inteiro** (o projeto atual com todas as mudanças que ficaram, qualquer que seja a decisão).
// O servidor MCP aplica o lote; o modelo só recebe o projeto depois dele:
//   `prepareRevision` (valida, fecha o `drop`, monta o proposto) → lote → `reviseProposal`.
// Cada mudança termina de um tipo: intocada (idêntica), trocada (mesmo id e `from`, `to` novo,
// sem decisão), nova (id novo) ou retirada (sai de `changes` e vai para `revisions[].dropped`).
// Uma mudança aceita nunca é trocada nem retirada (congelada). Docs: docs/PROPOSAL-FORMAT.md.

export type ReviseErrorCode =
  | 'not-open'
  | 'proposal-applied'
  | 'change-not-found'
  | 'change-frozen'
  | 'proposal-not-applicable'
  | 'no-changes';

export interface ReviseError {
  readonly code: ReviseErrorCode;
  readonly message: string;
  readonly changeIds: readonly string[];
  /** Em `proposal-not-applicable`: o que impede de aplicar a proposta (de `validateAccepted`). */
  readonly problems?: readonly ProposalIssue[];
}

type Failure = { readonly ok: false; readonly error: ReviseError };

function fail(
  code: ReviseErrorCode,
  message: string,
  changeIds: readonly string[] = [],
  problems?: readonly ProposalIssue[],
): Failure {
  return {
    ok: false,
    error: { code, message, changeIds, ...(problems ? { problems } : {}) },
  };
}

const isAccepted = (p: Proposal, id: string) => p.decisions[id]?.state === 'accepted';

function frozenFailure(ids: readonly string[]): Failure {
  return fail(
    'change-frozen',
    `Mudanças aceitas não podem ser trocadas nem retiradas: ${ids.join(', ')}.`,
    ids,
  );
}

/** Confere o estado da proposta e os ids do `drop`; devolve o fechamento (ids, sem repetir). */
function closeDrop(
  p: Proposal,
  drop: readonly string[],
): { readonly ok: true; readonly closure: ReadonlySet<string> } | Failure {
  if (p.status !== 'open') {
    return fail('not-open', `A proposta não está aberta (${p.status}).`);
  }
  const applied = Object.keys(p.applied);
  if (applied.length > 0) {
    return fail('proposal-applied', 'A proposta já tem mudanças aplicadas.', applied);
  }
  const known = proposalIndex(p).changes;
  const unknown = drop.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return fail(
      'change-not-found',
      `Mudança inexistente: ${unknown.join(', ')}.`,
      unknown,
    );
  }
  // Retirar a criação retira o que depende dela; retirar uma remoção da cascata retira a de
  // quem a causa: o índice da revisão já modela as duas.
  return { ok: true, closure: new Set([...drop, ...dependentChanges(p, drop)]) };
}

/**
 * Passo 1 da revisão: valida o estado da proposta, fecha o `drop` pelas dependências, confere
 * que o fechamento não toca em mudança aceita e monta o **proposto inteiro** (o projeto atual
 * com todas as mudanças que ficaram, aceitas, rejeitadas e sem decisão). `dropped` é o
 * fechamento, na ordem de `changes`. Se o que ficou não cabe no projeto, recusa com os
 * problemas: `validateAccepted` é reaproveitado com uma cópia em que tudo o que ficou está
 * aceito, o que dá `entity-missing`, `entity-exists`, `field-mismatch`, as invariantes e os
 * `changeIds` envolvidos.
 */
export function prepareRevision(
  project: Project,
  proposal: Proposal,
  drop: readonly string[],
):
  | { readonly ok: true; readonly dropped: readonly string[]; readonly proposed: Project }
  | Failure {
  const closed = closeDrop(proposal, drop);
  if (!closed.ok) return closed;
  const { closure } = closed;
  const frozen = [...closure].filter((id) => isAccepted(proposal, id));
  if (frozen.length > 0) {
    return frozenFailure(
      proposal.changes.map((c) => c.id).filter((id) => frozen.includes(id)),
    );
  }
  const kept = proposal.changes.filter((c) => !closure.has(c.id));
  const allAccepted: ProposalDecisions = Object.fromEntries(
    kept.map((c) => [c.id, { state: 'accepted' as const, at: '' }]),
  );
  const check = validateAccepted(project, {
    ...proposal,
    changes: kept,
    decisions: allAccepted,
    applied: {},
  });
  if (!check.ok) {
    const involved = new Set(check.issues.flatMap((i) => i.changeIds));
    return fail(
      'proposal-not-applicable',
      'A proposta não se aplica mais ao projeto atual.',
      kept.map((c) => c.id).filter((id) => involved.has(id)),
      check.issues,
    );
  }
  return {
    ok: true,
    dropped: proposal.changes.map((c) => c.id).filter((id) => closure.has(id)),
    proposed: check.project,
  };
}

// ---------------------------------------------------------------------------
// Classificação pela chave da mudança

/** Chave de uma mudança: o campo na alteração; só a entidade (e o tipo) na criação e na remoção. */
function changeKey(c: Change): string {
  const head = `${c.entity}|${c.entityId}`;
  return c.kind === 'update' ? `${head}|${c.field ?? ''}` : `${head}|${c.kind}`;
}

const MARKING_GEOMETRY = new Set(['rect', 'space', 'containerId']);

/**
 * Família do campo: o lote mexer num campo da família conta como mexer nos outros dela
 * (a marcação troca de espaço por `space` ou por `rect`; a anotação, de tipo ou de conteúdo).
 */
function family(c: Change): string {
  const field = c.field ?? '';
  if (c.entity === 'marking' && MARKING_GEOMETRY.has(field)) return 'geometry';
  const typed =
    field === 'type' || field.startsWith('values.') || field.startsWith('entries.');
  return c.entity === 'annotation' && typed ? 'content' : field;
}

/** O que o lote mexeu, por entidade: as famílias de campo, ou `*` (criou ou removeu). */
function touchedBy(batch: readonly Change[]): Map<string, Set<string>> {
  const touched = new Map<string, Set<string>>();
  for (const b of batch) {
    const key = `${b.entity}|${b.entityId}`;
    const set = touched.get(key) ?? new Set<string>();
    set.add(b.kind === 'update' ? family(b) : '*');
    touched.set(key, set);
  }
  return touched;
}

function wasTouched(
  touched: ReadonlyMap<string, ReadonlySet<string>>,
  c: Change,
): boolean {
  // `position` (marcação e camada) é derivada da ordem final do grupo de irmãs: quando o
  // efeito líquido não a pede mais, ela não vale mais, mesmo que o lote não a tenha tocado.
  if (c.kind === 'update' && c.field === 'position') return true;
  const set = touched.get(`${c.entity}|${c.entityId}`);
  if (!set) return false;
  return c.kind !== 'update' || set.has('*') || set.has(family(c));
}

/** O `parentId` é derivado da geometria e só informativo: fora da comparação das criações. */
function withoutParent(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'parentId'));
}

function sameTo(old: Change, next: Change): boolean {
  const derived =
    old.kind === 'create' && (old.entity === 'marking' || old.entity === 'image');
  return derived
    ? jsonEqual(withoutParent(old.to), withoutParent(next.to))
    : jsonEqual(old.to, next.to);
}

type Verdict =
  | { readonly kind: 'same'; readonly old: Change; readonly next?: Change }
  | { readonly kind: 'swapped'; readonly old: Change; readonly next: Change }
  | { readonly kind: 'retired'; readonly old: Change };

interface Classification {
  readonly verdicts: readonly Verdict[];
  /** As mudanças do efeito líquido sem par: as novas, na ordem do proposto. */
  readonly fresh: readonly Change[];
}

/**
 * Classifica as mudanças que ficaram pelo efeito líquido `net` (do projeto atual para o
 * resultado) e pelo que o lote mexeu `batch` (do proposto para o resultado).
 */
function classify(
  kept: readonly Change[],
  net: readonly Change[],
  batch: readonly Change[],
): Classification {
  const byKey = new Map(net.map((n) => [changeKey(n), n]));
  const touched = touchedBy(batch);
  const used = new Set<Change>();
  const verdicts = kept.map((old): Verdict => {
    const next = byKey.get(changeKey(old));
    if (next && !used.has(next)) {
      used.add(next);
      return sameTo(old, next)
        ? { kind: 'same', old, next }
        : { kind: 'swapped', old, next };
    }
    return wasTouched(touched, old) ? { kind: 'retired', old } : { kind: 'same', old };
  });
  return { verdicts, fresh: net.filter((n) => !used.has(n)) };
}

// ---------------------------------------------------------------------------
// Montagem da proposta revisada

/** Pais (marcações e containers) e as irmãs em ordem: o que a âncora e o `position` garantem. */
function structure(p: Project): string {
  const groups = new Map<string, string[]>();
  for (const m of p.markings) {
    const key = `${m.containerId ?? ''}|${m.parentId ?? ''}|${String(m.floating)}`;
    const group = groups.get(key);
    if (group) group.push(m.id);
    else groups.set(key, [m.id]);
  }
  const parents = (items: readonly { id: string; parentId: string | null }[]) =>
    items
      .map((i): [string, string | null] => [i.id, i.parentId])
      .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([
    parents(p.markings),
    parents(p.containers),
    [...groups].sort(([a], [b]) => (a < b ? -1 : 1)),
  ]);
}

const isMarkingCreate = (c: Change) => c.kind === 'create' && c.entity === 'marking';

/**
 * As intocadas mantêm a âncora (`insertBefore`). Se, com elas, aplicar as mudanças não dá os
 * pais e a ordem entre irmãs do resultado do lote (a âncora antiga sumiu, ou o `position` novo
 * supõe outra), a criação de marcação cuja âncora do efeito líquido é outra passa a **trocada**:
 * o lugar no array faz parte do efeito dela (perde a decisão; aceita, congela a revisão).
 */
function settleAnchors(
  project: Project,
  target: Project,
  net: readonly Change[],
  { verdicts, fresh }: Classification,
): readonly Verdict[] {
  const trial = assemble(net, verdicts, new Map(fresh.map((n) => [n, n])));
  if (structure(patchProject(project, trial).project) === structure(target))
    return verdicts;
  return verdicts.map((v): Verdict => {
    const moved =
      v.kind === 'same' &&
      v.next !== undefined &&
      isMarkingCreate(v.old) &&
      (v.next.insertBefore ?? null) !== (v.old.insertBefore ?? null);
    return moved && v.next ? { kind: 'swapped', old: v.old, next: v.next } : v;
  });
}

/** O próximo `c<n>` maior que qualquer id já usado: em `changes`, em `added` e em `dropped`. */
function idCounter(p: Proposal): () => string {
  let max = 0;
  const see = (id: string) => {
    const m = /^c(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  };
  p.changes.forEach((c) => see(c.id));
  for (const r of p.revisions ?? []) {
    r.added.forEach(see);
    r.dropped.forEach((d) => see(d.change.id));
    Object.keys(r.changed).forEach(see);
  }
  return () => `c${++max}`;
}

/** A mesma mudança com outra âncora (`undefined` tira o campo). */
function withAnchor(c: Change, insertBefore: string | null | undefined): Change {
  const copy: { -readonly [K in keyof Change]: Change[K] } = { ...c };
  if (insertBefore === undefined) delete copy.insertBefore;
  else copy.insertBefore = insertBefore;
  return copy;
}

/** A mudança trocada: id, `from` e o resto da antiga, com o `to` (e a âncora) da nova. */
function swappedChange(old: Change, next: Change): Change {
  const anchored = old.kind === 'create' && old.entity === 'marking';
  return withAnchor(
    { ...old, to: next.to },
    anchored ? next.insertBefore : old.insertBefore,
  );
}

/** Ordem do proposto: cada mudança no lugar do seu par; as sem par vão no fim, na ordem antiga. */
function assemble(
  net: readonly Change[],
  verdicts: readonly Verdict[],
  fresh: ReadonlyMap<Change, Change>,
): Change[] {
  const placed = new Map<Change, Change>();
  const tail: Change[] = [];
  for (const v of verdicts) {
    if (v.kind === 'retired') continue;
    const result = v.kind === 'swapped' ? swappedChange(v.old, v.next) : v.old;
    if (v.next) placed.set(v.next, result);
    else tail.push(result);
  }
  const ordered = net.flatMap((n) => {
    const out = placed.get(n) ?? fresh.get(n);
    return out ? [out] : [];
  });
  return [...ordered, ...tail];
}

function stateBefore(p: Proposal, id: string): RevisedPriorState {
  return p.decisions[id]?.state === 'rejected' ? 'rejected' : null;
}

/** As notas presas às mudanças retiradas passam ao nível da proposta, com texto e data iguais. */
function liftNotes(notes: readonly ProposalNote[], retired: ReadonlySet<string>) {
  return notes.map((n) =>
    n.target.level === 'change' && n.target.id !== null && retired.has(n.target.id)
      ? { ...n, target: { level: 'proposal' as const, id: null } }
      : n,
  );
}

function buildRevision(
  p: Proposal,
  project: Project,
  args: ReviseArgs,
  swapped: readonly Verdict[],
  added: readonly string[],
  retired: readonly Change[],
): ProposalRevision {
  const changed = Object.fromEntries(
    swapped.map((v) => [v.old.id, { to: v.old.to, state: stateBefore(p, v.old.id) }]),
  );
  const dropped: RevisionDropped[] = retired.map((change) => ({
    change,
    state: stateBefore(p, change.id),
    notes: p.notes
      .filter((n) => n.target.level === 'change' && n.target.id === change.id)
      .map((n) => n.id),
  }));
  return {
    at: args.at,
    baseRevision: project.revision,
    operations: args.operations ?? [],
    changed,
    added,
    dropped,
  };
}

export interface ReviseArgs {
  /** Mudanças a retirar (o fechamento pelas dependências também sai). */
  readonly drop?: readonly string[];
  /** O proposto depois do lote; ausente = sem lote. */
  readonly after?: Project;
  /** Data ISO 8601 da revisão. */
  readonly at: string;
  /** As operações do lote, só para referência (o base64 já trocado pelo marcador). */
  readonly operations?: readonly JsonValue[];
}

export interface ReviseSummary {
  /** Trocadas (mesmo id, `to` novo). */
  readonly changed: readonly string[];
  /** Novas (id novo). */
  readonly added: readonly string[];
  /** Retiradas: o fechamento do `drop` e as que o lote desfez, na ordem de `changes`. */
  readonly dropped: readonly string[];
}

/**
 * Passo 2 da revisão: classifica as mudanças e devolve a proposta nova (`formatVersion` 5, com
 * a revisão acrescida em `revisions`); `revision`, título e o resto não mudam (quem grava cuida
 * de `revision`). Refaz o `prepareRevision` por dentro (puro). Classificação, sem heurística:
 * - `N = computeChanges(project, after)` é o efeito líquido do resultado sobre o projeto atual;
 *   `B = computeChanges(proposed, after)`, o que o lote mexeu;
 * - a mudança que ficou e tem a chave em `N` é intocada (mesmo `to`; nas criações de marcação e
 *   de container o `parentId` fica fora da comparação) ou trocada (outro `to`);
 * - sem a chave em `N`: retirada se `B` mexeu na entidade (no campo ou na família dele), intocada
 *   se não mexeu (o projeto mudou por fora);
 * - cada mudança de `N` sem par é nova, com `from` do projeto atual.
 * Trocar ou retirar uma mudança aceita recusa a chamada inteira (`change-frozen`).
 */
export function reviseProposal(
  project: Project,
  proposal: Proposal,
  args: ReviseArgs,
):
  | { readonly ok: true; readonly proposal: Proposal; readonly summary: ReviseSummary }
  | Failure {
  const prep = prepareRevision(project, proposal, args.drop ?? []);
  if (!prep.ok) return prep;
  const closure = new Set(prep.dropped);
  const kept = proposal.changes.filter((c) => !closure.has(c.id));
  const after = args.after ?? prep.proposed;
  const net = computeChanges(project, after);
  const batch = args.after ? computeChanges(prep.proposed, after) : [];
  const classified = classify(kept, net, batch);
  const { fresh } = classified;
  const verdicts = settleAnchors(project, after, net, classified);

  const swapped = verdicts.filter((v) => v.kind === 'swapped');
  const undone = new Set(
    verdicts.flatMap((v) => (v.kind === 'retired' ? [v.old.id] : [])),
  );
  const retired = proposal.changes.filter((c) => closure.has(c.id) || undone.has(c.id));
  const frozen = [...swapped.map((v) => v.old), ...retired]
    .filter((c) => isAccepted(proposal, c.id))
    .map((c) => c.id);
  if (frozen.length > 0) return frozenFailure(frozen);
  if (swapped.length === 0 && fresh.length === 0 && retired.length === 0) {
    return fail('no-changes', 'A revisão não muda nenhuma mudança da proposta.');
  }
  return finish(project, proposal, args, {
    net,
    verdicts,
    fresh,
    swapped,
    retired,
  });
}

interface Plan {
  readonly net: readonly Change[];
  readonly verdicts: readonly Verdict[];
  readonly fresh: readonly Change[];
  readonly swapped: readonly Verdict[];
  readonly retired: readonly Change[];
}

type Revised = {
  readonly ok: true;
  readonly proposal: Proposal;
  readonly summary: ReviseSummary;
};

function finish(
  project: Project,
  proposal: Proposal,
  args: ReviseArgs,
  plan: Plan,
): Revised {
  const nextId = idCounter(proposal);
  const created = new Map(plan.fresh.map((n) => [n, { ...n, id: nextId() }]));
  const changes = assemble(plan.net, plan.verdicts, created);
  const changedIds = new Set(plan.swapped.map((v) => v.old.id));
  const retiredIds = new Set(plan.retired.map((c) => c.id));
  const decisions = Object.fromEntries(
    Object.entries(proposal.decisions).filter(
      ([id]) => !changedIds.has(id) && !retiredIds.has(id),
    ),
  );
  const added = plan.fresh.map((n) => (created.get(n) as Change).id);
  const revision = buildRevision(
    proposal,
    project,
    args,
    plan.swapped,
    added,
    plan.retired,
  );
  return {
    ok: true,
    proposal: {
      ...proposal,
      formatVersion:
        proposal.formatVersion === PROPOSAL_DRAWING_MODE_FORMAT_VERSION ||
        usesDrawingMode(changes)
          ? PROPOSAL_DRAWING_MODE_FORMAT_VERSION
          : PROPOSAL_REVISED_FORMAT_VERSION,
      changes,
      decisions,
      notes: liftNotes(proposal.notes, retiredIds),
      revisions: [...(proposal.revisions ?? []), revision],
    },
    summary: {
      changed: plan.swapped.map((v) => v.old.id),
      added,
      dropped: plan.retired.map((c) => c.id),
    },
  };
}
