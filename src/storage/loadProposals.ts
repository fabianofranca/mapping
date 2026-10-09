import { parseProposalText, type Proposal } from '../model';
import { reportError } from '../utils/report';
import type { ProjectStorage } from './types';

// Leitura das propostas de alteração (`proposals/<id>/proposal.json`, etapa 4): ao abrir
// o projeto e quando a pasta é conferida de novo. Um arquivo inválido não derruba nada:
// vira um problema listado à parte (a proposta some da lista, o resto continua).

/** Uma proposta lida: a proposta, o texto exato do arquivo e o carimbo dele (só na pasta). */
export interface LoadedProposal {
  readonly proposal: Proposal;
  readonly text: string;
  readonly stamp: string | null;
}

/** `proposal.json` que não pôde ser lido: o id da pasta e os erros, com o caminho exato. */
export interface ProposalProblem {
  readonly id: string;
  readonly errors: readonly string[];
}

export interface LoadedProposals {
  readonly proposals: readonly LoadedProposal[];
  readonly problems: readonly ProposalProblem[];
  /** Texto dos arquivos inválidos (id → texto), guardado para exportar sem perda. */
  readonly problemTexts?: ReadonlyMap<string, string>;
}

export const NO_PROPOSALS: LoadedProposals = { proposals: [], problems: [] };

export type ReadProposalResult =
  | ({ readonly ok: true } & LoadedProposal)
  | {
      readonly ok: false;
      /** O arquivo não existe (mais). */
      readonly missing: boolean;
      readonly errors: readonly string[];
      /** O texto lido, quando o arquivo existe mas é inválido (para não perdê-lo ao exportar). */
      readonly text: string | null;
    };

/** Lê e valida uma proposta. O `id` do arquivo precisa ser o da pasta. */
export async function readProposal(
  storage: ProjectStorage,
  id: string,
): Promise<ReadProposalResult> {
  let text: string | null;
  let stamp: string | null;
  try {
    stamp = storage.statProposal ? await storage.statProposal(id) : null;
    text = await storage.readProposal(id);
  } catch (e) {
    reportError('proposals.read', e);
    return {
      ok: false,
      missing: false,
      errors: [e instanceof Error ? e.message : String(e)],
      text: null,
    };
  }
  if (text === null) return { ok: false, missing: true, errors: [], text: null };
  return parseProposalFile(id, text, stamp);
}

export function parseProposalFile(
  id: string,
  text: string,
  stamp: string | null,
): ReadProposalResult {
  const parsed = parseProposalText(text);
  if (!parsed.ok) return { ok: false, missing: false, errors: parsed.errors, text };
  if (parsed.proposal.id !== id) {
    return {
      ok: false,
      missing: false,
      errors: [`id: deve ser "${id}" (o nome da pasta), mas é "${parsed.proposal.id}"`],
      text,
    };
  }
  return { ok: true, proposal: parsed.proposal, text, stamp };
}

/** Lê todas as propostas do armazenamento. */
export async function loadProposals(storage: ProjectStorage): Promise<LoadedProposals> {
  let ids: string[];
  try {
    ids = await storage.listProposals();
  } catch (e) {
    reportError('proposals.list', e);
    return NO_PROPOSALS;
  }
  const proposals: LoadedProposal[] = [];
  const problems: ProposalProblem[] = [];
  const problemTexts = new Map<string, string>();
  for (const id of ids) {
    const read = await readProposal(storage, id);
    if (read.ok) {
      proposals.push({ proposal: read.proposal, text: read.text, stamp: read.stamp });
    } else if (!read.missing) {
      problems.push({ id, errors: read.errors });
      if (read.text !== null) problemTexts.set(id, read.text);
    }
  }
  return { proposals, problems, problemTexts };
}
