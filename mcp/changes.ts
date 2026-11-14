import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import {
  IMAGES_DIR,
  MAPPING_FILE,
  computeChanges,
  projectIndex,
  type Change,
  type ItemKind,
  type Project,
} from '../src/model';
import {
  changeCounts,
  issueChanges,
  noticeChanges,
  runBatch,
  type BatchIo,
  type BatchResult,
} from './batch';
import { withOverflow } from './drawingProof';
import { ToolError } from './errors';
import { Refs } from './items';
import { membershipView } from './membership';
import type { Operation } from './operations';
import { Roots, resolveProjectFile } from './paths';
import { readSpecInput } from './library';
import {
  loadProject,
  readText,
  type LoadedProject,
  type ProjectLocation,
} from './projects';

// Batch operations on a copy of the project (stage 3a.5), now read-only: `plan_changes`
// validates and summarizes without writing anything, and `propose_changes` (proposals.ts)
// computes the proposal's changes. No server path writes `mapping.json`.

/** An image or specialization read by the batch that is larger than this is refused. */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Reads `mapping.json` as it is on disk (for the check before writing the proposal). */
export async function readMapping(roots: Roots, dir: string): Promise<string | null> {
  // With the size limit of the project's other reads (`loadProject`).
  return readText(roots, dir, MAPPING_FILE);
}

/** Reads a file cited in an operation: relative to the project folder, to a root, or absolute. */
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
    throw new ToolError('not-a-file', `not a file: ${path}`, { path });
  }
  if (info.size > MAX_SOURCE_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${path}`, { path });
  }
  return { bytes: new Uint8Array(await readFile(real)), name: basename(real) };
}

/**
 * What a specialization operation points to (file or package folder): relative to the project
 * folder, to a root, or absolute, like the batch's other sources.
 */
async function readSpec(roots: Roots, projectDir: string, path: string) {
  let real: string | null = null;
  if (!isAbsolute(path)) real = await resolveProjectFile(roots, projectDir, path);
  if (real === null) real = (await roots.resolveExisting(path)).real;
  return readSpecInput(roots, path, real);
}

async function takenImageFiles(dir: string): Promise<Set<string>> {
  try {
    const names = await readdir(join(dir, IMAGES_DIR));
    return new Set(names.map((name) => `${IMAGES_DIR}/${name}`));
  } catch {
    return new Set();
  }
}

/** References of the created items, with the alias of each one. */
export function createdRefs(refs: Refs, result: BatchResult): Record<string, unknown>[] {
  const index = projectIndex(refs.project);
  const byKind = {
    layer: index.layers,
    i: index.containers,
    m: index.markings,
    a: index.annotations,
  };
  return result.created
    .filter(
      (item) =>
        byKind[item.kind].has(item.id) ||
        (item.kind === 'm' && index.arrows.has(item.id)),
    )
    .map((item) => {
      const base = { op: item.index, ...(item.alias ? { alias: item.alias } : {}) };
      if (item.kind === 'layer') {
        const layer = index.layers.get(item.id)!;
        return { ...base, kind: 'layer', id: layer.id, name: layer.name };
      }
      const kind = item.kind as ItemKind;
      return {
        ...base,
        kind: index.arrows.has(item.id)
          ? 'arrow'
          : { m: 'marking', i: 'container', a: 'annotation' }[kind],
        ref: refs.ref(kind, item.id),
      };
    });
}

/** The batch applied to a copy of the project read from the folder. */
export interface PreparedBatch {
  readonly location: ProjectLocation;
  readonly loaded: LoadedProject;
  /** Hash of the `mapping.json` that was read: if it changes before the proposal is written, the computation is stale. */
  readonly baseHash: string;
  readonly result: BatchResult;
  readonly operations: readonly Operation[];
  /** References of the project after the batch (the final ones of the created items). */
  readonly refs: Refs;
  /** The batch's changes (the proposal review's), computed only once. */
  readonly changes: () => readonly Change[];
  readonly valid: boolean;
}

export interface PrepareOptions {
  readonly now: () => number;
  /** Files in `images/` already reserved by other proposals not yet applied. */
  readonly reservedImages?: ReadonlySet<string>;
  /**
   * Project the batch starts from, given the one read from the folder (the proposal review starts
   * from the whole proposed project). It may refuse by throwing a `ToolError`. Without it, the batch starts from the project.
   */
  readonly startFrom?: (project: Project) => Project;
}

/**
 * Reads the project and applies the batch (without writing anything). A project with an old
 * schema is migrated in memory only; a `mapping.json` of a newer version is refused (`read-only`).
 */
export async function prepareBatch(
  roots: Roots,
  location: ProjectLocation,
  operations: readonly Operation[],
  options: PrepareOptions,
): Promise<PreparedBatch> {
  const baseText = await readMapping(roots, location.dir);
  if (baseText === null) {
    throw new ToolError('invalid-project', `could not read ${MAPPING_FILE}`);
  }
  // A single read: the hash and the project come from the same text, even if the file changes in between.
  const loaded = await loadProject(roots, location, baseText);
  if (loaded.readOnly) {
    throw new ToolError(
      'read-only',
      'the mapping.json is from a newer version than this server understands: update mapping-mcp.js',
    );
  }
  const taken = await takenImageFiles(location.dir);
  for (const file of options.reservedImages ?? []) taken.add(file);
  const io: BatchIo = {
    readSource: (path) => readSource(roots, location.dir, path),
    readSpecInput: (path) => readSpec(roots, location.dir, path),
    takenImageFiles: taken,
    diskProject: loaded.project,
    now: () => new Date(options.now()),
  };
  const start = options.startFrom?.(loaded.project) ?? loaded.project;
  const result = await runBatch({ ...loaded, project: start }, operations, io);
  let changes: readonly Change[] | undefined;
  return {
    location,
    loaded,
    baseHash: sha256(baseText),
    result,
    operations,
    refs: new Refs({ ...loaded, project: result.project, catalog: result.catalog }),
    changes: () => (changes ??= computeChanges(result.before, result.project)),
    valid: result.errors.length === 0 && result.invariantIssues.length === 0,
  };
}

/** Warnings from the validation of the library packages (`apply_specialization`/`update_specialization`). */
const MAX_LIBRARY_WARNINGS = 20;

function libraryWarningViews(result: BatchResult): Record<string, unknown>[] {
  const views = result.libraryWarnings.slice(0, MAX_LIBRARY_WARNINGS).map((w) => ({
    code: 'library-warning',
    op: w.index,
    specId: w.specId,
    file: w.file,
    path: w.path,
    message: w.message,
  }));
  const more = result.libraryWarnings.length - views.length;
  return more > 0
    ? [
        ...views,
        {
          code: 'library-warning',
          message: `${more} more warning(s) from the library validation (run validate_library for the full list)`,
        },
      ]
    : views;
}

/** Common part of the `plan_changes` and `propose_changes` responses: the batch result. */
export function batchReport(prepared: PreparedBatch): Record<string, unknown> {
  const { result, location, loaded, refs } = prepared;
  // Warnings (they block nothing): the library's.
  const warnings: unknown[] = [
    ...libraryWarningViews(result),
    ...result.deprecations.map((d) => ({
      code: d.code ?? 'deprecated-op',
      op: d.index,
      message: d.message,
    })),
    ...result.rolesCleared.map((c) => ({
      code: 'role-cleared',
      op: c.index,
      annotation: refs.ref('a', c.annotationId),
      role: c.role,
      roleName: c.roleName,
      message: c.message,
    })),
  ];
  const membership = membershipView(
    result.before,
    new Refs({ ...loaded, project: result.before }),
    refs,
  );
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
    issues: withOverflow(issueChanges(refs, result.before), refs, result.before),
    notices: noticeChanges(refs, result.before, prepared.changes()),
    ...(membership.length > 0 ? { membership } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    created: createdRefs(refs, result),
  };
}

/** `plan_changes`: validates and summarizes the batch without writing anything (not even a proposal). */
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
      hint: 'nothing was stored: fix the operations with errors and call plan_changes again with the whole batch',
    };
  }
  const proposed = prepared.changes();
  return {
    ...report,
    reviewChanges: proposed.length,
    hint:
      proposed.length === 0
        ? 'the operations change nothing in the project: there is nothing to propose'
        : 'nothing was written; for the user to review and apply it, send the same batch with propose_changes',
  };
}
