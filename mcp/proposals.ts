import {
  buildProposal,
  changeStatuses,
  compareProposals,
  proposalIndex,
  reviewProgress,
  reviewTree,
  supersedeProposal,
  withdrawProposal,
  type Change,
  type JsonValue,
  type Proposal,
  type ProposalStatus,
} from '../src/model';
import { batchReport, prepareBatch, readMapping, sha256 } from './changes';
import { ToolError } from './errors';
import { Refs } from './items';
import type { Operation } from './operations';
import type { Roots } from './paths';
import { findProject, loadProject, type ProjectLocation } from './projects';
import { ProposalRefs, lookupStored, resolveProposal } from './proposalRefs';
import {
  listStored,
  reservedImages,
  updateStored,
  writeNewProposal,
  type StoredProposal,
  type StoredProposals,
} from './proposalStore';
import {
  ProposalLabels,
  changeView,
  conflictView,
  kindCounts,
  levelsView,
  noteView,
  progressView,
  proposedProject,
  stateOf,
  type ChangeState,
} from './proposalViews';

// Propostas de alteração (etapa 4.2): o agente nunca grava o projeto; `propose_changes` aplica
// o lote a uma cópia (o mesmo `batch.ts` do `plan_changes`), calcula as mudanças com
// `buildProposal` e grava `proposals/<id>/proposal.json`. A revisão é da app; aqui o agente só
// lê o resultado (`get_proposal`, `get_proposal_review`) e retira ou substitui a proposta.

type Json = Record<string, unknown>;

/** Mudanças por página de `get_proposal`. */
const DEFAULT_LIMIT = 200;

export interface ProposeArgs {
  readonly project: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly origin?: string | undefined;
  readonly author?: string | undefined;
  readonly supersedes?: string | undefined;
  readonly operations: readonly Operation[];
}

export type StateFilter = ChangeState | 'conflict';

/**
 * As operações guardadas na proposta são só referência: o conteúdo `base64` das imagens (que
 * já está em `proposals/<id>/images/`) é trocado por um marcador, para o arquivo não crescer.
 */
function storedOperations(operations: readonly Operation[]): JsonValue[] {
  return operations.map((op) => {
    const copy = JSON.parse(JSON.stringify(op)) as Record<string, JsonValue>;
    if (typeof copy.base64 === 'string') {
      copy.base64 = `(omitido: ${copy.base64.length} caracteres)`;
    }
    return copy;
  });
}

const OPEN_STATUSES: readonly ProposalStatus[] = ['open', 'superseded'];

export class Proposals {
  constructor(
    private readonly roots: Roots,
    private readonly now: () => number = Date.now,
    private readonly clientName: () => string | undefined = () => undefined,
  ) {}

  // -------------------------------------------------------------------------
  // propose_changes

  async propose(args: ProposeArgs): Promise<Json> {
    const title = args.title.trim();
    if (title === '') {
      throw new ToolError('invalid-title', 'a proposta precisa de um título');
    }
    const location = await findProject(this.roots, args.project);
    const all = await listStored(this.roots, location);
    const previous =
      args.supersedes === undefined ? null : lookupStored(all, location, args.supersedes);

    // Arquivos de `images/` reservados por outras propostas ainda abertas: não reutilizar o nome.
    const reserved = new Set<string>();
    for (const stored of all.proposals) {
      if (stored.id === previous?.id) continue;
      if (!OPEN_STATUSES.includes(stored.proposal.status)) continue;
      for (const file of reservedImages(stored.proposal)) reserved.add(file);
    }

    const prepared = await prepareBatch(this.roots, location, args.operations, {
      now: this.now,
      reservedImages: reserved,
    });
    const report = batchReport(prepared);
    if (!prepared.valid) {
      return {
        ...report,
        proposed: false,
        hint: 'nada foi gravado: corrija as operações com erro e chame propose_changes de novo com o lote inteiro',
      };
    }

    const { loaded, result } = prepared;
    const proposal = buildProposal(loaded.project, result.project, {
      title,
      description: args.description ?? null,
      origin: args.origin ?? null,
      author: args.author ?? this.clientName() ?? null,
      createdAt: new Date(this.now()).toISOString(),
      supersedes: previous?.id ?? null,
      operations: storedOperations(args.operations),
    });
    if (proposal.changes.length === 0) {
      throw new ToolError(
        'no-changes',
        'as operações não alteram nada no projeto: não há o que propor (a reexportação coincide com o projeto atual)',
      );
    }

    const images = new Map<string, Uint8Array>();
    for (const file of reservedImages(proposal)) {
      const data = result.imageFiles.get(file);
      if (data === undefined) {
        throw new Error(`imagem da proposta sem conteúdo: ${file}`);
      }
      images.set(file, data);
    }

    // O cálculo vale para o `mapping.json` lido: se ele mudou nesse meio-tempo, recusa.
    const text = await readMapping(this.roots, location.dir);
    if (text === null || sha256(text) !== prepared.baseHash) {
      throw new ToolError(
        'revision-conflict',
        'o projeto foi alterado por outro processo enquanto a proposta era calculada; releia e envie de novo',
        { baseRevision: loaded.project.revision },
      );
    }
    const { written } = await writeNewProposal(this.roots, location, proposal, images);

    const warnings: Json[] = [];
    let superseded: Json | undefined;
    if (previous) {
      const outcome = await this.supersede(location, all, previous, proposal);
      superseded = outcome.view;
      if (outcome.warning) warnings.push(outcome.warning);
    }

    const stored: StoredProposal = { id: proposal.id, proposal, text: '' };
    const refs = new ProposalRefs(location.name, {
      proposals: [...all.proposals, stored],
      broken: all.broken,
    });
    const labels = ProposalLabels.ofRefs(prepared.refs, new Refs(loaded));
    const tree = reviewTree(proposal, loaded.project);
    const { warnings: repoWarnings, ...rest } = report;
    return {
      ...rest,
      proposed: true,
      proposal: {
        ref: refs.ref(proposal.id),
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        baseRevision: proposal.baseRevision,
        supersedes: previous ? refs.ref(previous.id) : null,
      },
      reviewChanges: kindCounts(proposal),
      levels: levelsView(proposal, tree, labels),
      files: {
        proposal: `proposals/${proposal.id}/proposal.json`,
        images: written.slice(),
      },
      ...(superseded ? { superseded } : {}),
      ...(Array.isArray(repoWarnings) || warnings.length > 0
        ? {
            warnings: [...(Array.isArray(repoWarnings) ? repoWarnings : []), ...warnings],
          }
        : {}),
      hint: 'a proposta aguarda a revisão do usuário na app (janela Propostas); avise-o e não grave mais nada. As referências `created` só passam a existir depois que o usuário aceitar e aplicar. Quando a revisão terminar (get_proposal: nada pendente nem aceito sem aplicar), leia get_proposal_review.',
    };
  }

  /** Marca a proposta anterior como substituída e avisa se a revisão dela não tinha terminado. */
  private async supersede(
    location: ProjectLocation,
    all: StoredProposals,
    previous: StoredProposal,
    next: Proposal,
  ): Promise<{ view: Json; warning?: Json }> {
    const refs = new ProposalRefs(location.name, all);
    let fresh: Proposal | null = null;
    try {
      const updated = await updateStored(this.roots, location, previous.id, (p) => {
        fresh = p;
        return supersedeProposal(p);
      });
      const before = fresh as Proposal | null;
      const view = {
        ref: refs.ref(previous.id),
        status: updated.status,
        revision: updated.revision,
      };
      if (!before || !OPEN_STATUSES.includes(before.status)) return { view };
      const progress = reviewProgress(before);
      if (progress.complete) return { view };
      const comparison = compareProposals(before, next);
      const counts = { same: 0, different: 0, missing: 0 };
      for (const c of before.changes) {
        if (Object.hasOwn(before.applied, c.id)) continue;
        if (before.decisions[c.id]?.state === 'rejected') continue;
        counts[comparison.get(c.id) ?? 'missing']++;
      }
      return {
        view,
        warning: {
          code: 'superseded-incomplete',
          proposal: refs.ref(previous.id),
          undecided: progress.undecided,
          acceptedNotApplied: progress.acceptedPending,
          inNewProposal: counts,
          message:
            'a proposta substituída ainda tinha mudanças sem decisão ou aceitas sem aplicar; as pendentes não poderão mais ser aplicadas. Da próxima vez, espere a revisão terminar (get_proposal) antes de substituir',
        },
      };
    } catch (error) {
      if (!(error instanceof ToolError)) throw error;
      return {
        view: { ref: refs.ref(previous.id), status: previous.proposal.status },
        warning: {
          code: 'supersede-failed',
          proposal: refs.ref(previous.id),
          message: `a nova proposta foi gravada, mas a anterior não pôde ser marcada como substituída (${error.message})`,
        },
      };
    }
  }

  // -------------------------------------------------------------------------
  // list_proposals

  async list(projectQuery: string, status?: ProposalStatus): Promise<Json> {
    const location = await findProject(this.roots, projectQuery);
    const all = await listStored(this.roots, location);
    const loaded = await loadProject(this.roots, location);
    const refs = new ProposalRefs(location.name, all);
    const supersededBy = new Map<string, string[]>();
    for (const s of all.proposals) {
      const target = s.proposal.supersedes;
      if (target === null) continue;
      const list = supersededBy.get(target) ?? [];
      list.push(refs.ref(s.id));
      supersededBy.set(target, list);
    }
    const rows = all.proposals
      .filter((s) => status === undefined || s.proposal.status === status)
      .map((s) => {
        const p = s.proposal;
        const statuses = changeStatuses(p, loaded.project);
        const conflicts = p.changes.filter(
          (c) =>
            statuses.get(c.id)?.conflict === true &&
            (stateOf(p, c.id) === 'pending' || stateOf(p, c.id) === 'accepted'),
        ).length;
        const supersedes = p.supersedes === null ? null : refTo(all, refs, p.supersedes);
        return {
          ref: refs.ref(s.id),
          id: s.id,
          title: p.title,
          origin: p.origin,
          author: p.author,
          createdAt: p.createdAt,
          status: p.status,
          baseRevision: p.baseRevision,
          supersedes,
          ...(supersededBy.has(s.id) ? { supersededBy: supersededBy.get(s.id) } : {}),
          progress: progressView(p),
          conflicts,
        };
      });
    return {
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
      },
      total: rows.length,
      proposals: rows,
      ...(all.broken.length > 0 ? { broken: all.broken } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // get_proposal

  async get(
    refText: string,
    projectArg: string | undefined,
    options: {
      state?: StateFilter | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    },
  ): Promise<Json> {
    const { location, stored, all, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    const p = stored.proposal;
    const loaded = await loadProject(this.roots, location);
    const labels = ProposalLabels.of(loaded, proposedProject(loaded.project, p));
    const statuses = changeStatuses(p, loaded.project);
    const tree = reviewTree(p, loaded.project);

    const matching = p.changes.filter((c) => {
      if (options.state === undefined) return true;
      if (options.state === 'conflict') return statuses.get(c.id)?.conflict === true;
      return stateOf(p, c.id) === options.state;
    });
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;
    const page = matching.slice(offset, offset + limit);
    const next = offset + page.length;
    const conflicts = p.changes.filter(
      (c) => statuses.get(c.id)?.conflict === true && stateOf(p, c.id) !== 'applied',
    ).length;
    return {
      proposal: {
        ref: refs.ref(stored.id),
        id: p.id,
        title: p.title,
        description: p.description,
        origin: p.origin,
        author: p.author,
        createdAt: p.createdAt,
        status: p.status,
        revision: p.revision,
        baseRevision: p.baseRevision,
        supersedes: p.supersedes === null ? null : refTo(all, refs, p.supersedes),
        operations: p.operations.length,
      },
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
        changedSinceProposal: loaded.project.revision !== p.baseRevision,
      },
      progress: progressView(p),
      conflicts,
      levels: levelsView(p, tree, labels),
      total: matching.length,
      returned: page.length,
      ...(next < matching.length ? { truncated: true, nextOffset: next } : {}),
      changes: page.map((c) => changeView(p, c, statuses.get(c.id)!, labels)),
      notes: p.notes.map((n) => noteView(p, n, labels)),
    };
  }

  // -------------------------------------------------------------------------
  // get_proposal_review

  async review(refText: string, projectArg: string | undefined): Promise<Json> {
    const { location, stored, all, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    const p = stored.proposal;
    const loaded = await loadProject(this.roots, location);
    const labels = ProposalLabels.of(loaded, proposedProject(loaded.project, p));
    const statuses = changeStatuses(p, loaded.project);
    const index = proposalIndex(p);
    const progress = reviewProgress(p);

    const notesOfChange = (id: string) =>
      p.notes
        .filter((n) => n.target.level === 'change' && n.target.id === id)
        .map((n) => ({ text: n.text, at: n.at }));
    const rejected = p.changes
      .filter((c) => p.decisions[c.id]?.state === 'rejected')
      .map((c: Change) => {
        // Rejeitada junto com a criação de que depende ("rejeitar a criação rejeita o que
        // depende dela"): `via` aponta a criação, para o agente não tratá-la como decisão própria.
        const via = (index.requires.get(c.id) ?? []).find(
          (id) =>
            p.decisions[id]?.state === 'rejected' &&
            index.changes.get(id)?.kind === 'create',
        );
        const notes = notesOfChange(c.id);
        const status = statuses.get(c.id)!;
        return {
          ...changeView(p, c, status, labels),
          ...(via ? { via } : {}),
          ...(notes.length > 0 ? { notes } : {}),
        };
      });
    const conflicts = p.changes
      .filter((c) => {
        const state = stateOf(p, c.id);
        return (
          statuses.get(c.id)?.conflict === true &&
          (state === 'pending' || state === 'accepted')
        );
      })
      .map((c) => ({
        change: c.id,
        target: labels.target(c),
        ...(c.field !== null ? { field: c.field } : {}),
        state: stateOf(p, c.id),
        from: c.from,
        to: c.to,
        ...(conflictView(statuses.get(c.id)!) ?? {}),
      }));
    // Notas gerais: tudo o que não é de uma mudança (as dela vão junto da rejeição).
    const notes = p.notes
      .filter((n) => n.target.level !== 'change')
      .map((n) => noteView(p, n, labels));
    // Notas de mudanças que não estão rejeitadas (ex: o usuário comentou numa aceita).
    const otherChangeNotes = p.notes
      .filter(
        (n) =>
          n.target.level === 'change' &&
          n.target.id !== null &&
          p.decisions[n.target.id]?.state !== 'rejected',
      )
      .map((n) => noteView(p, n, labels));

    const { complete } = progress;
    return {
      proposal: {
        ref: refs.ref(stored.id),
        id: p.id,
        title: p.title,
        status: p.status,
        supersedes: p.supersedes === null ? null : refTo(all, refs, p.supersedes),
        baseRevision: p.baseRevision,
      },
      project: {
        name: location.name,
        path: location.path,
        revision: loaded.project.revision,
        changedSinceProposal: loaded.project.revision !== p.baseRevision,
      },
      progress: progressView(p),
      ready: complete,
      rejected,
      notes: [...notes, ...otherChangeNotes],
      conflicts,
      hint: complete
        ? rejected.length === 0 && conflicts.length === 0
          ? 'a revisão terminou sem rejeições nem conflitos: não há o que corrigir'
          : 'a revisão terminou: corrija só o que foi rejeitado (e os conflitos) lendo o projeto atual, e envie com propose_changes e supersedes apontando para esta proposta'
        : `a revisão ainda não terminou (${progress.undecided} sem decisão, ${progress.acceptedPending} aceita(s) sem aplicar): avise o usuário e espere antes de enviar uma proposta que a substitua`,
    };
  }

  // -------------------------------------------------------------------------
  // withdraw_proposal

  async withdraw(refText: string, projectArg: string | undefined): Promise<Json> {
    const { location, stored, refs } = await resolveProposal(
      this.roots,
      refText,
      projectArg,
    );
    let fresh: Proposal | null = null;
    const updated = await updateStored(this.roots, location, stored.id, (p) => {
      fresh = p;
      return withdrawProposal(p);
    });
    const before = fresh as Proposal | null;
    if (before === null || updated.status !== 'withdrawn' || before.status !== 'open') {
      throw new ToolError(
        'not-open',
        `só uma proposta aberta pode ser retirada (estado atual: ${(before ?? stored.proposal).status})`,
        { proposal: refs.ref(stored.id), status: (before ?? stored.proposal).status },
      );
    }
    const progress = reviewProgress(before);
    return {
      withdrawn: true,
      proposal: {
        ref: refs.ref(stored.id),
        id: stored.id,
        title: updated.title,
        status: updated.status,
        revision: updated.revision,
      },
      discarded: {
        undecided: progress.undecided,
        acceptedNotApplied: progress.acceptedPending,
        applied: progress.applied,
      },
      hint: 'a proposta foi retirada: nada mais dela será aplicado (o que já foi aplicado continua no projeto). Os arquivos em proposals/ ficam para o histórico.',
    };
  }
}

/** Referência de uma proposta citada por outra (a pasta pode já não existir). */
function refTo(all: StoredProposals, refs: ProposalRefs, id: string): string {
  return all.proposals.some((s) => s.id === id) ? refs.ref(id) : id;
}
