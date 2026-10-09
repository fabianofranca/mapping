import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';
import {
  applyAccepted,
  decide,
  deserialize,
  parseProposalText,
  proposalFilePath,
  referencedSpecFiles,
  reviewTree,
  serialize,
  serializeProposal,
  specFiles,
  touchProject,
  type DecisionState,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../src/model';
import type { Call, Connection } from './workspace';

// Apoio dos testes das propostas: lê o que o servidor gravou e imita o que a app faz na
// revisão (decidir, aplicar aceitas), usando as mesmas funções puras de `src/model/`.

export const hashOf = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/** Resultado de `propose_changes` (só o que os testes conferem). */
export interface Proposed {
  valid: boolean;
  proposed?: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  issues: { before: number; after: number; resolved: number; new: unknown[] };
  created: { op: number; alias?: string; kind: string; ref?: string; id?: string }[];
  proposal: {
    ref: string;
    id: string;
    title: string;
    status: string;
    baseRevision: number;
    supersedes: string | null;
  };
  reviewChanges: { total: number; create: number; update: number; remove: number };
  levels: {
    project?: { state: string; changes: number };
    images: { image: string; change: string; items: number; changes: number }[];
  };
  files: { proposal: string; images: string[] };
  superseded?: { ref: string; status: string };
  warnings?: { code: string; [key: string]: unknown }[];
  hint: string;
}

export interface Failure {
  error: { code: string; message: string; [key: string]: unknown };
}

export function ok<T>(result: Call<T>): T {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

export function errorOf(result: Call<unknown>): Failure['error'] {
  expect(result.isError).toBe(true);
  return (result.data as Failure).error;
}

/** O projeto como a app o abre: `mapping.json` e as cópias de `specs/`. */
export function readProject(dir: string): Project {
  const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
  const specs = new Map(
    referencedSpecFiles(text).map((file) => [
      file,
      readFileSync(join(dir, file), 'utf8'),
    ]),
  );
  const result = deserialize(text, undefined, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

/** A proposta gravada em `proposals/<id>/proposal.json`, validada pelo modelo. */
export function readProposal(dir: string, id: string): Proposal {
  const parsed = parseProposalText(readFileSync(join(dir, proposalFilePath(id)), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.proposal;
}

function writeProposal(dir: string, proposal: Proposal): Proposal {
  // Como a sessão da app: grava com `revision + 1`.
  const next = { ...proposal, revision: proposal.revision + 1 };
  writeFileSync(join(dir, proposalFilePath(proposal.id)), serializeProposal(next));
  return next;
}

const AT = '2026-10-09T13:00:00.000Z';

/**
 * Imita o usuário decidindo na revisão: decide o alvo (todo o nível e o que está abaixo, com
 * as dependências) e grava as decisões no arquivo, como a app faz.
 */
export function reviewDecide(
  dir: string,
  id: string,
  target: ReviewTarget,
  state: DecisionState | null,
): Proposal {
  const proposal = readProposal(dir, id);
  const result = decide(
    proposal,
    reviewTree(proposal, readProject(dir)),
    target,
    state,
    AT,
  );
  if (!result.ok) throw new Error(`decisão recusada: ${result.reason}`);
  return writeProposal(dir, { ...proposal, decisions: result.decisions });
}

/** Imita uma nota do usuário (a app grava `notes` na proposta). */
export function reviewNote(
  dir: string,
  id: string,
  target: ReviewTarget,
  text: string,
): Proposal {
  const proposal = readProposal(dir, id);
  const note = { id: `n${proposal.notes.length + 1}`, target, text, at: AT };
  return writeProposal(dir, { ...proposal, notes: [...proposal.notes, note] });
}

/**
 * Imita "Aplicar aceitas" da app: `applyAccepted` sobre o projeto lido da pasta, imagens
 * movidas de `proposals/<id>/` para `images/`, cópias de `specs/`, `mapping.json` com
 * `revision + 1` e a proposta atualizada. Devolve o projeto gravado.
 */
export function applyAcceptedOnDisk(dir: string, id: string): Project {
  const project = readProject(dir);
  const proposal = readProposal(dir, id);
  const result = applyAccepted(project, proposal, AT);
  if (!result.ok)
    throw new Error(`aplicação bloqueada: ${JSON.stringify(result.issues)}`);
  for (const move of result.files) {
    mkdirSync(dirname(join(dir, move.to)), { recursive: true });
    renameSync(join(dir, move.from), join(dir, move.to));
  }
  const next: Project = {
    ...touchProject(result.project, AT),
    revision: project.revision + 1,
  };
  for (const [file, text] of specFiles(next)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  writeFileSync(join(dir, 'mapping.json'), serialize(next));
  // Como a sessão: arquivos de imagem e de especialização que ninguém mais cita saem.
  const referenced = new Set(next.images.map((i) => i.file));
  if (existsSync(join(dir, 'images'))) {
    for (const name of readdirSync(join(dir, 'images'))) {
      if (!referenced.has(`images/${name}`)) rmSync(join(dir, 'images', name));
    }
  }
  writeProposal(dir, result.proposal);
  return next;
}

/** Aceita tudo (nível da proposta) e aplica, como o usuário que concorda com tudo. */
export function acceptAllAndApply(dir: string, id: string): Project {
  reviewDecide(dir, id, { level: 'proposal', id: null }, 'accepted');
  return applyAcceptedOnDisk(dir, id);
}

/** Envia o lote com `propose_changes`. */
export async function propose(
  mcp: Connection,
  project: string,
  operations: unknown[],
  extra: Record<string, unknown> = {},
): Promise<Proposed> {
  return ok(
    await mcp.call<Proposed>('propose_changes', {
      project,
      title: 'Teste',
      operations,
      ...extra,
    }),
  );
}
