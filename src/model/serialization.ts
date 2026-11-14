import { validateProject, type InvariantIssue } from './invariants';
import { isRecord } from './isRecord';
import {
  discardedOnMigrationTo11,
  discardedOnMigrationTo13,
  migrate,
  migrations as defaultMigrations,
  type DiscardedInherit,
  type DiscardedUrlTemplate,
  type Migration,
} from './migrations';
import { repairProject, type RepairResult } from './repair';
import { projectSchema } from './schema';
import { parseSpecText, type Spec } from './spec';
import {
  SCHEMA_VERSION,
  type MarkingAnchor,
  type Project,
  type ProjectFile,
  type ProjectSpecialization,
} from './types';

/** The marking's anchor with the keys always in the same order and only the present ones. */
function canonicalAnchor(a: MarkingAnchor): MarkingAnchor {
  return {
    to: a.to,
    ...(a.side === undefined ? {} : { side: a.side }),
    ...(a.align === undefined ? {} : { align: a.align }),
    ...(a.offset === undefined
      ? {}
      : { offset: { main: a.offset.main, cross: a.offset.cross } }),
  };
}

/**
 * Produces the text of `mapping.json`: keys always in the same order, 2-space indentation and
 * a line break at the end. Serializing the result of `deserialize` produces exactly the same
 * text (lossless round-trip).
 */
export function serialize(p: Project): string {
  const canonical: ProjectFile = {
    schemaVersion: p.schemaVersion,
    revision: p.revision,
    app: p.app,
    coordinateSystem: p.coordinateSystem,
    project: {
      id: p.project.id,
      name: p.project.name,
      createdAt: p.project.createdAt,
      updatedAt: p.project.updatedAt,
    },
    specializations: p.specializations.map((s) => ({
      id: s.id,
      version: s.version,
      file: s.file,
    })),
    platformRepos: Object.fromEntries(
      Object.entries(p.platformRepos).map(([platform, repo]) => [
        platform,
        { localPath: repo.localPath },
      ]),
    ),
    docRepos: Object.fromEntries(
      Object.entries(p.docRepos).map(([repo, entry]) => [
        repo,
        { localPath: entry.localPath },
      ]),
    ),
    ...(p.drawingMode === undefined ? {} : { drawingMode: p.drawingMode }),
    ...(p.direction === undefined ? {} : { direction: p.direction }),
    layers: p.layers.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      spec: l.spec && { specId: l.spec.specId, layerId: l.spec.layerId },
    })),
    containers: p.containers.map((i) => ({
      id: i.id,
      name: i.name,
      file: i.file,
      width: i.width,
      height: i.height,
      placement: { x: i.placement.x, y: i.placement.y, scale: i.placement.scale },
      parentId: i.parentId,
      markingColor: i.markingColor,
      locked: i.locked,
      source: i.source && { system: i.source.system, id: i.source.id, url: i.source.url },
      background: i.background,
      ...(i.drawingMode == null ? {} : { drawingMode: i.drawingMode }),
      ...(i.direction == null ? {} : { direction: i.direction }),
      ...(i.density == null ? {} : { density: i.density }),
    })),
    markings: p.markings.map((m) => ({
      id: m.id,
      containerId: m.containerId,
      parentId: m.parentId,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      needsReview: m.needsReview,
      locked: m.locked,
      floating: m.floating,
      source: m.source && { system: m.source.system, id: m.source.id, url: m.source.url },
      ...(m.anchor == null ? {} : { anchor: canonicalAnchor(m.anchor) }),
    })),
    arrows: p.arrows.map((a) => ({
      id: a.id,
      from: a.from,
      to: a.to,
      fromSide: a.fromSide,
      toSide: a.toSide,
      points: a.points.map((pt) => ({ x: pt.x, y: pt.y })),
      style: a.style,
      name: a.name,
      locked: a.locked,
    })),
    perspectives: p.perspectives.map((x) => ({
      id: x.id,
      name: x.name,
      hiddenLayers: [...x.hiddenLayers],
      items: x.items.map((item) => ({ root: item.root, x: item.x, y: item.y })),
    })),
    arrivals: p.arrivals.map((a) => ({
      root: a.root,
      from: a.from,
      fromName: a.fromName,
    })),
    annotations: p.annotations.map((a) => ({
      id: a.id,
      markingId: a.markingId,
      layerId: a.layerId,
      name: a.name,
      parentAnnotationId: a.parentAnnotationId,
      parentRole: a.parentRole,
      type: a.type && { specId: a.type.specId, typeId: a.type.typeId },
      values: a.values,
      entries: a.entries.map((e) => ({ id: e.id, key: e.key, value: e.value })),
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** Text of `specs/<id>.json`: the specialization with 2-space indentation. */
export function serializeSpec(spec: Spec): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/** The project's `specs/` files (path → text), to write or export. */
export function specFiles(p: Project): Map<string, string> {
  const files = new Map<string, string>();
  for (const s of p.specializations) {
    if (s.spec) files.set(s.file, serializeSpec(s.spec));
  }
  return files;
}

/**
 * `specs/` paths cited by a not-yet-validated `mapping.json`, so that the storage can read the
 * copies before `deserialize`. Empty if it cannot be read.
 */
export function referencedSpecFiles(text: string): string[] {
  try {
    return referencedSpecFilesOf(JSON.parse(text));
  } catch {
    // It only finds out which `specs/` copies to read; invalid JSON is handled in `deserialize`.
    return [];
  }
}

/** Like `referencedSpecFiles`, for whoever already parsed the JSON (`deserializeParsed`). */
export function referencedSpecFilesOf(raw: unknown): string[] {
  const list: unknown = isRecord(raw) ? raw.specializations : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((s: unknown) =>
    isRecord(s) && typeof s.file === 'string' ? [s.file] : [],
  );
}

/** Problem with the copy of a specialization in `specs/` (does not prevent opening). */
export interface SpecFileWarning {
  readonly specId: string;
  readonly file: string;
  readonly problem: 'missing' | 'invalid' | 'id-mismatch' | 'version-mismatch';
  /** Validation errors (`path: message`), in `invalid`. */
  readonly errors?: readonly string[];
}

export type DeserializeError =
  | { readonly code: 'invalid-json' }
  | { readonly code: 'invalid-schema'; readonly details: string }
  | { readonly code: 'unsupported-version'; readonly version: unknown }
  | { readonly code: 'missing-migration'; readonly from: number }
  | { readonly code: 'invariant-violation'; readonly issues: readonly InvariantIssue[] };

export type DeserializeResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** File of a version newer than the supported one: open without allowing edits. */
      readonly readOnly: boolean;
      /** Original version, when the file went through migrations. */
      readonly migratedFrom: number | null;
      /**
       * Missing or invalid specialization copies: the project opens, and their
       * annotations show up as issues ("nonexistent type").
       */
      readonly specWarnings: readonly SpecFileWarning[];
      /**
       * `urlTemplate` of `platformRepos` that the migration to schema 11 discarded (the address of
       * the files became the specialization's); empty when there were none.
       */
      readonly discardedUrlTemplates: readonly DiscardedUrlTemplate[];
      /**
       * Annotations that had `inherit: true` and lost the inheritance in the migration to schema 13
       * (empty if there were none).
       */
      readonly discardedInherit: readonly DiscardedInherit[];
    }
  | {
      readonly ok: false;
      readonly error: DeserializeError;
      /**
       * In `invariant-violation`, the mechanical repair of the project read (`repairProject`),
       * with what the read found. Reading never writes: the app is the one that accepts the
       * repair, and the session writes the backup of the original and the repaired one on the
       * first write.
       */
      readonly repair?: RepairedLoad;
    };

/** Inconsistent project repaired on read (see `DeserializeResult`). */
export interface RepairedLoad extends RepairResult {
  readonly readOnly: boolean;
  readonly migratedFrom: number | null;
  readonly specWarnings: readonly SpecFileWarning[];
  readonly discardedUrlTemplates: readonly DiscardedUrlTemplate[];
  readonly discardedInherit: readonly DiscardedInherit[];
}

/** Attaches to `mapping.json` the content of each `specs/<id>.json`. */
function attachSpecs(
  data: ProjectFile,
  files: ReadonlyMap<string, string>,
): { project: Project; warnings: SpecFileWarning[] } {
  const warnings: SpecFileWarning[] = [];
  const specializations = data.specializations.map((ref): ProjectSpecialization => {
    const base = { id: ref.id, version: ref.version, file: ref.file };
    const warn = (problem: SpecFileWarning['problem'], errors?: readonly string[]) =>
      warnings.push({
        specId: ref.id,
        file: ref.file,
        problem,
        ...(errors ? { errors } : {}),
      });
    const text = files.get(ref.file);
    if (text === undefined) {
      warn('missing');
      return { ...base, spec: null };
    }
    const parsed = parseSpecText(text);
    if (!parsed.ok) {
      warn('invalid', parsed.errors);
      return { ...base, spec: null };
    }
    if (parsed.spec.id !== ref.id) {
      warn('id-mismatch');
      return { ...base, spec: null };
    }
    if (parsed.spec.version !== ref.version) warn('version-mismatch');
    return { ...base, spec: parsed.spec };
  });
  return { project: { ...data, specializations }, warnings };
}

/**
 * Reads the text of `mapping.json`: JSON → migrations → zod schema → invariants.
 * `specs` carries the text of the specialization copies (path → text, e.g.
 * `specs/sdui.json`). A version higher than the supported one: tries to read it as the
 * current version in read-only mode.
 */
export function deserialize(
  text: string,
  registry: ReadonlyMap<number, Migration> = defaultMigrations,
  specs: ReadonlyMap<string, string> = new Map(),
): DeserializeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'invalid-json' } };
  }
  return deserializeParsed(raw, registry, specs);
}

/** `deserialize` for already-parsed JSON (whoever read it for something else does not read it again). */
export function deserializeParsed(
  raw: unknown,
  registry: ReadonlyMap<number, Migration> = defaultMigrations,
  specs: ReadonlyMap<string, string> = new Map(),
): DeserializeResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: { code: 'invalid-schema', details: 'root is not an object' },
    };
  }

  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: { code: 'unsupported-version', version } };
  }

  let data: Record<string, unknown> = raw;
  let migratedFrom: number | null = null;
  let discardedUrlTemplates: readonly DiscardedUrlTemplate[] = [];
  let discardedInherit: readonly DiscardedInherit[] = [];
  const readOnly = version > SCHEMA_VERSION;
  if (readOnly) {
    data = { ...raw, schemaVersion: SCHEMA_VERSION };
  } else if (version < SCHEMA_VERSION) {
    const migrated = migrate(raw, version, registry, SCHEMA_VERSION, { specs });
    if (!migrated.ok) {
      return {
        ok: false,
        error: { code: 'missing-migration', from: migrated.missingFrom },
      };
    }
    data = migrated.data;
    migratedFrom = version;
    // The discarded fields only existed in old files: a hand-edited v15 gets no warning.
    if (version <= 10) discardedUrlTemplates = discardedOnMigrationTo11(raw);
    if (version <= 12) discardedInherit = discardedOnMigrationTo13(raw);
  }

  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) {
    if (readOnly) return { ok: false, error: { code: 'unsupported-version', version } };
    return {
      ok: false,
      error: { code: 'invalid-schema', details: parsed.error.message },
    };
  }
  const { project, warnings } = attachSpecs(parsed.data, specs);
  const issues = validateProject(project);
  if (issues.length > 0) {
    return {
      ok: false,
      error: { code: 'invariant-violation', issues },
      repair: {
        ...repairProject(project, issues),
        readOnly,
        migratedFrom,
        specWarnings: warnings,
        discardedUrlTemplates,
        discardedInherit,
      },
    };
  }
  return {
    ok: true,
    project,
    readOnly,
    migratedFrom,
    specWarnings: warnings,
    discardedUrlTemplates,
    discardedInherit,
  };
}
