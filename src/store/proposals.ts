import { signal, type ReadonlySignal } from '@preact/signals';
import { createSerialQueue, newestFirst, stampOr } from './serialQueue';
import {
  canRemoveProposal,
  changeImageFile,
  isRecord,
  packageDirOf,
  proposalImagePath,
  proposalPackageDir,
  serializeProposal,
  type Change,
  type Proposal,
  latestRevisionSummary,
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

export type ProposalNoticeKind = 'added' | 'changed' | 'removed' | 'revised';

/** Algo que aconteceu com uma proposta por fora da app (nova, alterada ou apagada). */
export interface ProposalNotice {
  readonly kind: ProposalNoticeKind;
  readonly id: string;
  readonly title: string;
  /** Data ISO de quando a app percebeu. */
  readonly at: string;
  /** Só em `revised`: o resumo da revisão mais nova. */
  readonly revision?: { changed: number; added: number; dropped: number };
}

/** `revised` quando `next` tem mais revisões que `prev` (o agente revisou por fora); senão `changed`. */
export function noticeKindFor(prev: Proposal, next: Proposal): 'changed' | 'revised' {
  return (next.revisions?.length ?? 0) > (prev.revisions?.length ?? 0)
    ? 'revised'
    : 'changed';
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

/**
 * `p` é a versão do disco (a que a mudança parte); `seen`, a que a sessão tinha antes de
 * reler o arquivo. Quando o agente revisou a proposta por fora, `p.revisions` tem entradas
 * que `seen` não tem: a guarda da decisão usa a diferença (etapa #644, decisão 8).
 */
export type Mutation<T, E extends string> = (
  p: Proposal,
  seen: Proposal,
) => MutationPlan<T, E>;

/** O que a conferência da pasta encontrou (ids). */
export interface ProposalScan {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

export interface ProposalScanOptions {
  /** `false`: conferência de ciclo (pula as finais já lidas). Padrão: `true`, a completa. */
  readonly full?: boolean;
}

interface MutableScan {
  readonly added: string[];
  readonly changed: string[];
  readonly removed: string[];
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
  /**
   * Confere a pasta: propostas novas, alteradas e apagadas por fora. A conferência completa
   * (padrão: o foco, a volta à página e o "Verificar a pasta agora") olha todas as propostas; a de
   * ciclo (`full: false`) não relê as finais (`applied` e `withdrawn`) já lidas com carimbo
   * conhecido, mas uma pasta nova em `proposals/` continua sendo vista em todo ciclo.
   */
  scan(options?: ProposalScanOptions): Promise<ProposalScan>;
  /**
   * Há uma decisão, nota, aplicação ou remoção de proposta esperando na fila ou sendo
   * gravada. A conferência de ciclo espera por isso (`session.busy`).
   */
  writing(): boolean;
  /** Espera as gravações em andamento (ao fechar o projeto). */
  settled(): Promise<void>;
  clearNotices(): void;
  /**
   * Tira da fila os avisos de uma proposta (do tipo dado, ou todos). Abrir a proposta na
   * revisão tira o `added` dela: o "Nova proposta · Revisar" não volta depois de revisada.
   */
  dismissNotice(id: string, kind?: ProposalNoticeKind): void;
  /**
   * Arquivos para exportar: as propostas como estão no disco e os arquivos que aguardam
   * aceitação (imagens e pacotes de biblioteca de `proposals/<id>/specs/`).
   */
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

/** `specs/<pasta>` da especialização que a mudança cria ou atualiza, se for um pacote. */
function specPackageDir(change: Change): string | null {
  if (change.entity !== 'specialization' || change.kind === 'remove') return null;
  const file = isRecord(change.to) ? change.to.file : undefined;
  return typeof file === 'string' ? packageDirOf(file) : null;
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

  /** Identifica o conjunto de problemas (ids e erros): muda quando um conserta e outro quebra. */
  const problemsKey = () =>
    JSON.stringify([...problemMap.values()].map((p) => [p.problem.id, p.problem.errors]));

  const notify = (kind: ProposalNoticeKind, id: string, title: string) => {
    notices.value = [...notices.value, { kind, id, title, at: now() }].slice(
      -NOTICE_LIMIT,
    );
  };

  /** Uma proposta conhecida mudou por fora: `revised` (com o resumo) ou `changed`. */
  const notifyChanged = (prev: Proposal, next: Proposal) => {
    const kind = noticeKindFor(prev, next);
    const summary = kind === 'revised' ? latestRevisionSummary(next) : null;
    const revision = summary
      ? { changed: summary.changed, added: summary.added, dropped: summary.dropped }
      : undefined;
    notices.value = [
      ...notices.value,
      {
        kind,
        id: next.id,
        title: next.title,
        at: now(),
        ...(revision ? { revision } : {}),
      },
    ].slice(-NOTICE_LIMIT);
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
  const enqueue = createSerialQueue();
  // Gravações (decidir, anotar, aplicar, apagar) na fila ou em curso: a conferência de ciclo as espera.
  let writes = 0;
  const enqueueWrite = <T>(job: () => Promise<T>): Promise<T> => {
    writes++;
    const run = enqueue(job);
    // Um ramo à parte: o `run` devolvido a quem chamou não ganha nenhum passo a mais.
    const done = () => {
      writes--;
    };
    run.then(done, done);
    return run;
  };

  const stampOf = (id: string): Promise<string | null> =>
    stampOr(storage.statProposal ? () => storage.statProposal!(id) : null);

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
    const seen = entry.proposal;
    if (text !== entry.text) {
      const parsed = parseProposalFile(id, text, await stampOf(id));
      if (!parsed.ok) return { ok: false, error: 'unreadable' };
      entry = { proposal: parsed.proposal, text: parsed.text, stamp: parsed.stamp };
      adopt(entry);
      publish();
      notifyChanged(seen, parsed.proposal);
    }
    const plan = mutation(entry.proposal, seen);
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

  /**
   * As propostas finais (`applied` e `withdrawn`) já lidas com carimbo conhecido: a conferência de
   * ciclo não as relê (o MCP não reescreve uma proposta aplicada). `open` e `superseded` (que ainda
   * tem aceitas a aplicar) ficam de fora.
   */
  const settledIds = (): Set<string> => {
    const skip = new Set<string>();
    for (const [id, entry] of known) {
      const { status } = entry.proposal;
      if (entry.stamp !== null && (status === 'applied' || status === 'withdrawn'))
        skip.add(id);
    }
    return skip;
  };

  /**
   * Quem está em `proposals/` (`present`) e o carimbo de cada proposta a conferir. As de `skip`
   * contam como presentes, sem carimbo. Num passo só quando o armazenamento tem `stampProposals`;
   * senão, a listagem e um `statProposal` por proposta. `null`: a pasta não pôde ser lida.
   */
  const proposalStamps = async (
    skip: ReadonlySet<string>,
  ): Promise<{ present: Set<string>; stamps: Map<string, string | null> } | null> => {
    try {
      const present = new Set<string>();
      const stamps = new Map<string, string | null>();
      if (storage.stampProposals) {
        // Toda proposta do mapa está em `proposals/` (as pastas sem `proposal.json` ficam de
        // fora); carimbo `null` é "a conferir" (pulada por ser final, ou ilegível agora).
        for (const [id, stamp] of await storage.stampProposals(skip)) {
          present.add(id);
          if (!skip.has(id)) stamps.set(id, stamp);
        }
      } else {
        for (const id of await storage.listProposals()) {
          present.add(id);
          if (!skip.has(id)) stamps.set(id, await stampOf(id));
        }
      }
      return { present, stamps };
    } catch (e) {
      reportError('proposals.list', e);
      return null;
    }
  };

  /** O carimbo diz que nada mudou (ou que o problema já conhecido é o mesmo)? */
  const stampSaysSame = (id: string, stamp: string | null): boolean => {
    if (stamp === null) return false;
    const entry = known.get(id);
    if (entry) return stamp === entry.stamp;
    const bad = problemMap.get(id);
    return bad !== undefined && stamp === bad.stamp;
  };

  /** Adota o que a leitura de uma proposta de carimbo novo trouxe e conta no resultado. */
  const takeRead = (
    id: string,
    stamp: string | null,
    read: Awaited<ReturnType<typeof readProposal>>,
    scan: MutableScan,
  ) => {
    const entry = known.get(id);
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
      return;
    }
    if (!entry) {
      adopt(read);
      scan.added.push(id);
      notify('added', id, read.proposal.title);
    } else if (read.text !== entry.text) {
      adopt(read);
      scan.changed.push(id);
      notifyChanged(entry.proposal, read.proposal);
    } else {
      known.set(id, { ...entry, stamp: read.stamp });
    }
  };

  /** O que sumiu da pasta: as propostas conhecidas (aviso "apagada") e os problemas. */
  const dropAbsent = (present: ReadonlySet<string>, removed: string[]) => {
    for (const [id, entry] of [...known]) {
      if (present.has(id)) continue;
      known.delete(id);
      removed.push(id);
      notify('removed', id, entry.proposal.title);
    }
    for (const id of [...problemMap.keys()]) {
      if (!present.has(id)) problemMap.delete(id);
    }
  };

  const scanNow = async (full: boolean): Promise<ProposalScan> => {
    const scan: MutableScan = { added: [], changed: [], removed: [] };
    const found = await proposalStamps(full ? new Set() : settledIds());
    if (found === null) return scan;
    const problemsBefore = problemsKey();
    for (const [id, stamp] of found.stamps) {
      if (stampSaysSame(id, stamp)) continue;
      takeRead(id, stamp, await readProposal(storage, id), scan);
    }
    dropAbsent(found.present, scan.removed);
    const changed = scan.added.length + scan.changed.length + scan.removed.length > 0;
    if (changed || problemsKey() !== problemsBefore) publish();
    return scan;
  };

  return {
    list,
    problems,
    notices,
    get: (id) => known.get(id)?.proposal ?? null,
    mutate: (id, mutation) => enqueueWrite(() => runMutation(id, mutation)),
    remove: (id, onRemoved) => enqueueWrite(() => removeNow(id, onRemoved)),
    scan: (scanOptions) => enqueue(() => scanNow(scanOptions?.full !== false)),
    writing: () => writes > 0,
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
        const read = async (path: string) => {
          if (images.has(path)) return;
          const blob = await storage.readImage(path).catch((e: unknown) => {
            reportError('proposals.readImage', e);
            return null;
          });
          if (blob) images.set(path, blob);
        };
        for (const [id, entry] of known) {
          proposals.set(`proposals/${id}/proposal.json`, entry.text);
          await readPending(storage, id, entry.proposal, read);
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

/** Lê (por `read`) as imagens e os arquivos de pacote das mudanças ainda não aplicadas. */
async function readPending(
  storage: ProjectStorage,
  id: string,
  proposal: Proposal,
  read: (path: string) => Promise<void>,
): Promise<void> {
  let listed: readonly string[] | undefined;
  for (const change of proposal.changes) {
    if (Object.hasOwn(proposal.applied, change.id)) continue;
    const file = changeImageFile(change);
    if (file !== null) await read(proposalImagePath(id, file));
    const dir = specPackageDir(change);
    if (dir === null) continue;
    const from = `${proposalPackageDir(id, dir)}/`;
    // Uma listagem por proposta, não por mudança.
    listed ??= await storage.listProposalFiles(id).catch((e: unknown) => {
      reportError('proposals.listFiles', e);
      return [];
    });
    for (const path of listed) if (path.startsWith(from)) await read(path);
  }
}
