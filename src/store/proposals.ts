import { signal, type ReadonlySignal } from '@preact/signals';
import {
  canRemoveProposal,
  changeImageFile,
  proposalImagePath,
  serializeProposal,
  type Proposal,
} from '../model';
import {
  NO_PROPOSALS,
  parseProposalFile,
  readProposal,
  type LoadedProposal,
  type LoadedProposals,
  type ProposalProblem,
} from '../storage/loadProposals';
import type { ProjectStorage } from '../storage/types';
import { reportError } from '../utils/report';

// As propostas de alteração do projeto aberto (etapa 4): a lista em memória, a leitura da
// pasta e a gravação. Quem grava `proposals/<id>/proposal.json` é só este módulo, dentro
// da sessão (`session.proposals`); a interface nunca escreve no armazenamento.
//
// Conferência do arquivo, como a do `mapping.json`: toda gravação relê o arquivo antes e,
// se ele difere do que a sessão leu ou gravou por último (o servidor MCP retirou ou
// substituiu a proposta, um editor mexeu nele), adota a versão do disco e REFAZ a
// mudança sobre ela, em vez de sobrescrevê-la. Cada mudança é uma função pura da proposta
// (decidir, anotar, aplicar), então refazer é seguro e nada do que veio de fora se perde.
// Cada gravação sobe a `revision` da proposta em 1.

export type ProposalNoticeKind = 'added' | 'changed' | 'removed';

/** Algo que aconteceu com uma proposta por fora da app (nova, alterada ou apagada). */
export interface ProposalNotice {
  readonly kind: ProposalNoticeKind;
  readonly id: string;
  readonly title: string;
  /** Data ISO de quando a app percebeu. */
  readonly at: string;
}

export type ProposalErrorCode =
  /** Não há proposta com esse id. */
  | 'unknown-proposal'
  /** O arquivo sumiu por fora. */
  | 'gone'
  /** O arquivo mudou por fora e ficou ilegível. */
  | 'unreadable'
  | 'write-failed';

/** Por que `ProposalStore.remove` recusou ou falhou. */
export type RemoveProposalError =
  /** Não há proposta legível com esse id na lista. */
  | 'unknown-proposal'
  /** A proposta está (ou voltou a estar) aberta: só as fechadas se apagam. */
  | 'not-removable'
  /** O arquivo mudou por fora e ficou ilegível: não se apaga o que não se leu. */
  | 'unreadable'
  /** O armazenamento não conseguiu apagar `proposals/<id>/`. */
  | 'remove-failed';

export type RemoveProposalResult =
  | { readonly ok: true; readonly proposal: Proposal }
  | { readonly ok: false; readonly error: RemoveProposalError };

export type MutationOutcome<T, E extends string> =
  | { readonly ok: true; readonly proposal: Proposal; readonly value: T }
  | { readonly ok: false; readonly error: E | ProposalErrorCode };

/** Resultado de uma função de mudança. `proposal` igual ao recebido = nada a gravar. */
export type MutationPlan<T, E extends string> =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      readonly value: T;
      /**
       * Roda depois de calcular a mudança e antes de gravar a proposta (ex: aplicar ao
       * projeto e copiar as imagens). Devolve um código de erro para abortar.
       */
      readonly before?: () => Promise<E | null>;
      /** Roda depois de gravar a proposta (ex: apagar as imagens que já foram movidas). */
      readonly after?: () => Promise<void>;
      /**
       * Desfaz o que `before` fez quando a gravação da proposta falha depois dele (ex: o
       * `mapping.json` já aplicado volta ao de antes e as cópias das imagens saem). Um erro
       * dele só vai ao Diagnóstico; o resultado continua `write-failed`.
       */
      readonly compensate?: () => Promise<void>;
    }
  | { readonly ok: false; readonly error: E };

export type Mutation<T, E extends string> = (p: Proposal) => MutationPlan<T, E>;

/** O que a conferência da pasta encontrou (ids). */
export interface ProposalScan {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

const NOTICE_LIMIT = 20;

interface Known {
  readonly proposal: Proposal;
  readonly text: string;
  readonly stamp: string | null;
}

export interface ProposalStore {
  /** Propostas legíveis, a mais nova primeiro. Cada proposta mantém o objeto enquanto não muda. */
  readonly list: ReadonlySignal<readonly Proposal[]>;
  /** Arquivos `proposal.json` que não puderam ser lidos (a proposta não aparece na lista). */
  readonly problems: ReadonlySignal<readonly ProposalProblem[]>;
  /** Novidades vindas de fora desde a abertura ou desde `clearNotices` (as mais recentes por último). */
  readonly notices: ReadonlySignal<readonly ProposalNotice[]>;
  get(id: string): Proposal | null;
  /**
   * Muda uma proposta: relê o arquivo, adota a versão do disco se mudou por fora, aplica
   * `mutation` a ela e grava com `revision + 1`. As chamadas rodam em fila.
   */
  mutate<T, E extends string>(
    id: string,
    mutation: Mutation<T, E>,
  ): Promise<MutationOutcome<T, E>>;
  /**
   * Apaga a proposta do armazenamento (`proposals/<id>/` inteira) e da lista, na mesma fila:
   * relê o arquivo antes e recusa se ele voltou a estar aberto (o agente pode ter reaberto
   * a proposta) ou ficou ilegível. Não gera o aviso "apagada por fora": a pessoa apagou.
   * `onRemoved` roda de forma síncrona logo depois de o armazenamento apagar (a sessão tira
   * o vínculo do histórico sem janela para um desfazer no meio).
   */
  remove(id: string, onRemoved?: () => void): Promise<RemoveProposalResult>;
  /** Confere a pasta: propostas novas, alteradas e apagadas por fora. */
  scan(): Promise<ProposalScan>;
  /** Espera as gravações em andamento (ao fechar o projeto). */
  settled(): Promise<void>;
  clearNotices(): void;
  /**
   * Tira da fila os avisos de uma proposta (do tipo dado, ou todos). Abrir a proposta na
   * revisão tira o `added` dela: o "Nova proposta · Revisar" não volta depois de revisada.
   */
  dismissNotice(id: string, kind?: ProposalNoticeKind): void;
  /** Arquivos para exportar: as propostas como estão no disco e as imagens que aguardam aceitação. */
  collect(): Promise<{
    readonly proposals: Map<string, string>;
    readonly images: Map<string, Blob>;
  }>;
}

export interface ProposalStoreOptions {
  readonly storage: ProjectStorage;
  readonly initial?: LoadedProposals;
  readonly now: () => string;
  /**
   * Chamado depois de cada gravação bem-sucedida de um `proposal.json` (decidir, anotar,
   * aplicar, desfazer ou refazer a aplicação): a sessão o repassa como "algo deste projeto
   * mudou no armazenamento" (indicador "Alterações não exportadas").
   */
  readonly onChanged?: () => void;
}

function newestFirst(a: Proposal, b: Proposal): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

export function createProposalStore(options: ProposalStoreOptions): ProposalStore {
  const { storage, now } = options;
  const known = new Map<string, Known>();
  const problemMap = new Map<
    string,
    { problem: ProposalProblem; stamp: string | null; text: string | null }
  >();
  const list = signal<readonly Proposal[]>([]);
  const problems = signal<readonly ProposalProblem[]>([]);
  const notices = signal<readonly ProposalNotice[]>([]);

  const publish = () => {
    list.value = [...known.values()].map((k) => k.proposal).sort(newestFirst);
    problems.value = [...problemMap.values()].map((p) => p.problem);
  };

  const notify = (kind: ProposalNoticeKind, id: string, title: string) => {
    notices.value = [...notices.value, { kind, id, title, at: now() }].slice(
      -NOTICE_LIMIT,
    );
  };

  const load = (initial: LoadedProposals = NO_PROPOSALS) => {
    for (const item of initial.proposals) known.set(item.proposal.id, item);
    for (const problem of initial.problems) {
      problemMap.set(problem.id, {
        problem,
        stamp: null,
        text: initial.problemTexts?.get(problem.id) ?? null,
      });
    }
    publish();
  };
  load(options.initial);

  // Fila única: gravações e conferências nunca rodam em paralelo.
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };

  const stampOf = async (id: string): Promise<string | null> => {
    if (!storage.statProposal) return null;
    try {
      return await storage.statProposal(id);
    } catch {
      return null;
    }
  };

  const adopt = (item: LoadedProposal) => {
    known.set(item.proposal.id, item);
    problemMap.delete(item.proposal.id);
  };

  const runMutation = async <T, E extends string>(
    id: string,
    mutation: Mutation<T, E>,
  ): Promise<MutationOutcome<T, E>> => {
    let entry = known.get(id);
    if (!entry) return { ok: false, error: 'unknown-proposal' };
    // Confere o arquivo: se mudou por fora, parte da versão do disco.
    let text: string | null;
    try {
      text = await storage.readProposal(id);
    } catch (e) {
      reportError('proposals.read', e);
      return { ok: false, error: 'unreadable' };
    }
    if (text === null) {
      known.delete(id);
      publish();
      notify('removed', id, entry.proposal.title);
      return { ok: false, error: 'gone' };
    }
    if (text !== entry.text) {
      const parsed = parseProposalFile(id, text, await stampOf(id));
      if (!parsed.ok) return { ok: false, error: 'unreadable' };
      entry = { proposal: parsed.proposal, text: parsed.text, stamp: parsed.stamp };
      adopt(entry);
      publish();
      notify('changed', id, parsed.proposal.title);
    }
    const plan = mutation(entry.proposal);
    if (!plan.ok) return { ok: false, error: plan.error };
    if (plan.before) {
      const error = await plan.before();
      if (error !== null) return { ok: false, error };
    }
    if (plan.proposal === entry.proposal)
      return { ok: true, proposal: entry.proposal, value: plan.value };
    const next: Proposal = { ...plan.proposal, revision: entry.proposal.revision + 1 };
    const nextText = serializeProposal(next);
    try {
      await storage.writeProposal(id, nextText);
    } catch (e) {
      reportError('proposals.write', e);
      if (plan.compensate) {
        try {
          await plan.compensate();
        } catch (compensation) {
          reportError('proposals.compensate', compensation);
        }
      }
      return { ok: false, error: 'write-failed' };
    }
    known.set(id, { proposal: next, text: nextText, stamp: await stampOf(id) });
    publish();
    options.onChanged?.();
    if (plan.after) {
      try {
        await plan.after();
      } catch (e) {
        reportError('proposals.after', e);
      }
    }
    return { ok: true, proposal: next, value: plan.value };
  };

  const removeNow = async (
    id: string,
    onRemoved?: () => void,
  ): Promise<RemoveProposalResult> => {
    let entry = known.get(id);
    if (!entry) return { ok: false, error: 'unknown-proposal' };
    // Confere o arquivo: se mudou por fora, decide sobre a versão do disco.
    let text: string | null;
    try {
      text = await storage.readProposal(id);
    } catch (e) {
      reportError('proposals.read', e);
      return { ok: false, error: 'unreadable' };
    }
    if (text !== null && text !== entry.text) {
      const parsed = parseProposalFile(id, text, await stampOf(id));
      if (!parsed.ok) return { ok: false, error: 'unreadable' };
      entry = { proposal: parsed.proposal, text: parsed.text, stamp: parsed.stamp };
      adopt(entry);
      publish();
      notify('changed', id, parsed.proposal.title);
    }
    // Sem arquivo (apagado por fora no meio): só falta limpar o que sobrou da pasta.
    if (text !== null && !canRemoveProposal(entry.proposal)) {
      return { ok: false, error: 'not-removable' };
    }
    try {
      await storage.removeProposal(id);
    } catch (e) {
      reportError('proposals.remove', e);
      return { ok: false, error: 'remove-failed' };
    }
    known.delete(id);
    problemMap.delete(id);
    notices.value = notices.value.filter((n) => n.id !== id);
    publish();
    options.onChanged?.();
    try {
      onRemoved?.();
    } catch (e) {
      reportError('proposals.removed', e);
    }
    return { ok: true, proposal: entry.proposal };
  };

  const scanNow = async (): Promise<ProposalScan> => {
    const added: string[] = [];
    const changed: string[] = [];
    const removed: string[] = [];
    let ids: string[];
    try {
      ids = await storage.listProposals();
    } catch (e) {
      reportError('proposals.list', e);
      return { added, changed, removed };
    }
    const present = new Set(ids);
    for (const id of ids) {
      const stamp = await stampOf(id);
      const entry = known.get(id);
      const bad = problemMap.get(id);
      if (stamp !== null) {
        if (entry && stamp === entry.stamp) continue;
        if (!entry && bad && stamp === bad.stamp) continue;
      }
      const read = await readProposal(storage, id);
      if (!read.ok) {
        // Sumiu entre a lista e a leitura, ou está ilegível: uma proposta que já conhecemos
        // fica como está (um editor ainda escrevendo); só as desconhecidas viram problema.
        if (!read.missing && !entry) {
          problemMap.set(id, {
            problem: { id, errors: read.errors },
            stamp,
            text: read.text,
          });
        }
        continue;
      }
      if (!entry) {
        adopt(read);
        added.push(id);
        notify('added', id, read.proposal.title);
      } else if (read.text !== entry.text) {
        adopt(read);
        changed.push(id);
        notify('changed', id, read.proposal.title);
      } else {
        known.set(id, { ...entry, stamp: read.stamp });
      }
    }
    for (const [id, entry] of [...known]) {
      if (present.has(id)) continue;
      known.delete(id);
      removed.push(id);
      notify('removed', id, entry.proposal.title);
    }
    for (const id of [...problemMap.keys()]) {
      if (!present.has(id)) problemMap.delete(id);
    }
    if (added.length > 0 || changed.length > 0 || removed.length > 0) publish();
    else if (problemMap.size !== problems.value.length) publish();
    return { added, changed, removed };
  };

  return {
    list,
    problems,
    notices,
    get: (id) => known.get(id)?.proposal ?? null,
    mutate: (id, mutation) => enqueue(() => runMutation(id, mutation)),
    remove: (id, onRemoved) => enqueue(() => removeNow(id, onRemoved)),
    scan: () => enqueue(scanNow),
    settled: () => enqueue(() => Promise.resolve()),
    clearNotices() {
      notices.value = [];
    },
    dismissNotice(id, kind) {
      const rest = notices.value.filter(
        (n) => n.id !== id || (kind !== undefined && n.kind !== kind),
      );
      if (rest.length !== notices.value.length) notices.value = rest;
    },
    async collect() {
      return enqueue(async () => {
        const proposals = new Map<string, string>();
        const images = new Map<string, Blob>();
        for (const [id, entry] of known) {
          proposals.set(`proposals/${id}/proposal.json`, entry.text);
          for (const change of entry.proposal.changes) {
            if (Object.hasOwn(entry.proposal.applied, change.id)) continue;
            const file = changeImageFile(change);
            if (file === null) continue;
            const path = proposalImagePath(id, file);
            if (images.has(path)) continue;
            const blob = await storage.readImage(path).catch((e: unknown) => {
              reportError('proposals.readImage', e);
              return null;
            });
            if (blob) images.set(path, blob);
          }
        }
        for (const [id, item] of problemMap) {
          if (item.text !== null)
            proposals.set(`proposals/${id}/proposal.json`, item.text);
        }
        return { proposals, images };
      });
    },
  };
}
