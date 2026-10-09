import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { platformRepoWarnings, computeChanges, type ItemKind } from '../src/model';
import {
  changeCounts,
  issueChanges,
  runBatch,
  type BatchIo,
  type BatchResult,
} from './batch';
import { ToolError } from './errors';
import { Refs } from './items';
import type { Operation } from './operations';
import { Roots, resolveProjectFile } from './paths';
import {
  MAPPING_FILE,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';

// Operações em lote sobre uma cópia do projeto (etapa 3a.5), agora só para ler: o
// `plan_changes` valida e resume sem gravar nada, e o `propose_changes` (proposals.ts) calcula
// as mudanças da proposta. Nenhum caminho do servidor grava o `mapping.json`.

/** Imagem ou especialização lida pelo lote maior que isto é recusada. */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const IMAGES_DIR = 'images';

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Lê o `mapping.json` como está no disco (para a conferência antes de gravar a proposta). */
export async function readMapping(roots: Roots, dir: string): Promise<string | null> {
  const real = await resolveProjectFile(roots, dir, MAPPING_FILE);
  return real === null ? null : readFile(real, 'utf8');
}

/** Lê um arquivo citado numa operação: relativo à pasta do projeto, a uma raiz, ou absoluto. */
async function readSource(
  roots: Roots,
  projectDir: string,
  path: string,
): Promise<{ bytes: Uint8Array; name: string }> {
  let real: string | null = null;
  if (!isAbsolute(path)) real = await resolveProjectFile(roots, projectDir, path);
  if (real === null) real = (await roots.resolveExisting(path)).real;
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `não é um arquivo: ${path}`, { path });
  }
  if (info.size > MAX_SOURCE_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${path}`, { path });
  }
  return { bytes: new Uint8Array(await readFile(real)), name: basename(real) };
}

async function takenImageFiles(dir: string): Promise<Set<string>> {
  try {
    const names = await readdir(join(dir, IMAGES_DIR));
    return new Set(names.map((name) => `${IMAGES_DIR}/${name}`));
  } catch {
    return new Set();
  }
}

/** Referências dos itens criados, com o apelido de cada um. */
export function createdRefs(refs: Refs, result: BatchResult): Record<string, unknown>[] {
  const project = refs.project;
  const exists = {
    layer: (id: string) => project.layers.some((l) => l.id === id),
    i: (id: string) => project.images.some((i) => i.id === id),
    m: (id: string) => project.markings.some((m) => m.id === id),
    a: (id: string) => project.annotations.some((a) => a.id === id),
  };
  return result.created
    .filter((item) => exists[item.kind](item.id))
    .map((item) => {
      const base = { op: item.index, ...(item.alias ? { alias: item.alias } : {}) };
      if (item.kind === 'layer') {
        const layer = project.layers.find((l) => l.id === item.id)!;
        return { ...base, kind: 'layer', id: layer.id, name: layer.name };
      }
      const kind = item.kind as ItemKind;
      return {
        ...base,
        kind: { m: 'marking', i: 'image', a: 'annotation' }[kind],
        ref: refs.ref(kind, item.id),
      };
    });
}

/** O lote aplicado a uma cópia do projeto lido da pasta. */
export interface PreparedBatch {
  readonly location: ProjectLocation;
  readonly loaded: LoadedProject;
  /** Hash do `mapping.json` lido: se mudar antes de gravar a proposta, o cálculo ficou velho. */
  readonly baseHash: string;
  readonly result: BatchResult;
  readonly operations: readonly Operation[];
  /** Referências do projeto depois do lote (as definitivas dos itens criados). */
  readonly refs: Refs;
  readonly valid: boolean;
}

export interface PrepareOptions {
  readonly now: () => number;
  /** Arquivos de `images/` já reservados por outras propostas ainda não aplicadas. */
  readonly reservedImages?: ReadonlySet<string>;
}

/**
 * Lê o projeto e aplica o lote (sem gravar nada). O projeto de schema antigo é migrado só
 * em memória; um `mapping.json` de versão mais nova é recusado (`read-only`).
 */
export async function prepareBatch(
  roots: Roots,
  location: ProjectLocation,
  operations: readonly Operation[],
  options: PrepareOptions,
): Promise<PreparedBatch> {
  const baseText = await readMapping(roots, location.dir);
  if (baseText === null) {
    throw new ToolError('invalid-project', `não foi possível ler ${MAPPING_FILE}`);
  }
  const loaded = await loadProject(roots, location);
  if (loaded.readOnly) {
    throw new ToolError(
      'read-only',
      'o mapping.json é de uma versão mais nova do que este servidor entende: atualize o mapping-mcp.js',
    );
  }
  const taken = await takenImageFiles(location.dir);
  for (const file of options.reservedImages ?? []) taken.add(file);
  const io: BatchIo = {
    readSource: (path) => readSource(roots, location.dir, path),
    takenImageFiles: taken,
    now: () => new Date(options.now()),
  };
  const result = await runBatch(loaded, operations, io);
  return {
    location,
    loaded,
    baseHash: sha256(baseText),
    result,
    operations,
    refs: new Refs({ ...loaded, project: result.project }),
    valid: result.errors.length === 0 && result.invariantIssues.length === 0,
  };
}

/** Parte comum das respostas de `plan_changes` e `propose_changes`: o resultado do lote. */
export function batchReport(prepared: PreparedBatch): Record<string, unknown> {
  const { result, location, loaded, refs } = prepared;
  // Avisos (não impedem nada): plataforma usada em `codeRef` sem repositório configurado.
  const repoWarnings = platformRepoWarnings(result.project);
  return {
    valid: prepared.valid,
    project: { name: location.name, path: location.path },
    revision: loaded.project.revision,
    operations: prepared.operations.length,
    ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    ...(result.invariantIssues.length > 0
      ? { invariantIssues: result.invariantIssues }
      : {}),
    summary: result.steps.map((s) => `${s.index}. ${s.description}`),
    changes: changeCounts(result.before, result.project),
    issues: issueChanges(refs, result.before),
    ...(repoWarnings.length > 0 ? { warnings: repoWarnings } : {}),
    created: createdRefs(refs, result),
  };
}

/** `plan_changes`: valida e resume o lote sem gravar nada (nem proposta). */
export async function planChanges(
  roots: Roots,
  location: ProjectLocation,
  operations: readonly Operation[],
  now: () => number,
): Promise<Record<string, unknown>> {
  const prepared = await prepareBatch(roots, location, operations, { now });
  const report = batchReport(prepared);
  if (!prepared.valid) {
    return {
      ...report,
      hint: 'nada foi guardado: corrija as operações com erro e chame plan_changes de novo com o lote inteiro',
    };
  }
  const proposed = computeChanges(prepared.loaded.project, prepared.result.project);
  return {
    ...report,
    reviewChanges: proposed.length,
    hint:
      proposed.length === 0
        ? 'as operações não alteram nada no projeto: não há o que propor'
        : 'nada foi gravado; para o usuário revisar e aplicar, envie o mesmo lote com propose_changes',
  };
}
