import { fail } from './errors';
import { fileNameKey } from './containers';
import { projectIssues, type AnnotationIssue } from './issues';
import {
  runLibraryMigrations,
  type MigrationLoss,
  type MigrationRun,
  type MigrationStepReport,
} from './libraryMigrations';
import { countBrokenRefs, type LabelTexts } from './refs';
import type { Spec, SpecLayer, SpecMigrationStep } from './spec';
import { isPackageFile } from './libraryPackage';
import { pruneHiddenLayers } from './perspectiveReconcile';
import { getSpecialization } from './specLookup';
import {
  diffSpecs,
  migrationChain,
  missingMigrations,
  type SpecChange,
} from './specVersions';
import { annotationsOfSpec, freeVersionOf } from './typed';
import type { Annotation, Layer, Project, ProjectSpecialization } from './types';

// Lifecycle of the specialization in the project: apply, update and remove.
// See docs/ARCHITECTURE.md, "Specializations in the project and typed annotations". The content
// lives in `specializations[].spec` (in memory) and is written to `specs/<id>.json` by the
// storage; that is why undo covers everything.

/** Folder of the specialization copies, relative to the project root. */
export const SPECS_DIR = 'specs';

export interface SpecOpOptions {
  /** Generates the ids of the new layers and tuples. Default: `crypto.randomUUID()`. */
  readonly newId?: () => string;
  /** Texts used when converting references to text. */
  readonly texts?: LabelTexts;
  /**
   * Name of the specialization file inside the package (`material3.spec.json`): the copy is
   * the `specs/<id>/` folder and `file` points to it. Without it, the copy is `specs/<id>.json`.
   */
  readonly packageSpecName?: string;
}

/**
 * `specs/<id>.json` (v1 to v3), with the id cleaned for a file name and not colliding with
 * another. With `packageSpecName` (library package): `specs/<id>/<packageSpecName>`, the folder
 * also not colliding with another specialization's.
 */
export function specFileFor(
  p: Project,
  specId: string,
  packageSpecName?: string,
): string {
  // File names compared case-insensitively (`Material` and `material` are the same).
  const key = (f: string | undefined) => (f === undefined ? f : fileNameKey(f));
  const base = specId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '') || 'spec';
  const others = p.specializations.filter((s) => s.id !== specId).map((s) => s.file);
  if (packageSpecName !== undefined) {
    const name = packageSpecName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '');
    const takenDirs = new Set(
      others.map((f) => /^specs\/([^/]+)\//.exec(f)?.[1]).map((d) => key(d)),
    );
    let dir = base;
    for (let n = 2; takenDirs.has(key(dir)); n++) dir = `${base}-${n}`;
    return `${SPECS_DIR}/${dir}/${name || 'spec.json'}`;
  }
  const taken = new Set(others.map(key));
  let file = `${SPECS_DIR}/${base}.json`;
  for (let n = 2; taken.has(key(file)); n++) file = `${SPECS_DIR}/${base}-${n}.json`;
  return file;
}

/**
 * What happens when applying `spec`: `apply` (new in the project), `update` (already exists
 * with a lower `version`) or `not-newer` (already exists with the same or a higher version).
 */
export function checkSpecApply(p: Project, spec: Spec): 'apply' | 'update' | 'not-newer' {
  const current = getSpecialization(p, spec.id);
  if (!current) return 'apply';
  return spec.version > current.version ? 'update' : 'not-newer';
}

function newLayer(specId: string, layer: SpecLayer, id: string): Layer {
  return {
    id,
    name: layer.name,
    color: layer.color.toUpperCase(),
    spec: { specId, layerId: layer.id },
  };
}

/** Applies the specialization: stores the copy and creates its layers at the end of the list. */
export function applySpecialization(
  p: Project,
  spec: Spec,
  options: SpecOpOptions = {},
): Project {
  if (getSpecialization(p, spec.id)) fail('spec-already-applied', spec.id);
  const newId = options.newId ?? (() => crypto.randomUUID());
  const entry: ProjectSpecialization = {
    id: spec.id,
    version: spec.version,
    file: specFileFor(p, spec.id, options.packageSpecName),
    spec,
  };
  return {
    ...p,
    specializations: [...p.specializations, entry],
    layers: [...p.layers, ...spec.layers.map((l) => newLayer(spec.id, l, newId()))],
  };
}

/** Converts the typed annotations `ids` to free ones, computing everything from `p`. */
function convertAnnotations(
  p: Project,
  ids: ReadonlySet<string>,
  options: SpecOpOptions,
): Annotation[] {
  return p.annotations.map((a) =>
    ids.has(a.id) && a.type ? freeVersionOf(p, a, options) : a,
  );
}

/** What the update does: the project after and the report of the migrations that ran. */
interface UpdatePlan {
  readonly project: Project;
  readonly run: MigrationRun;
}

/**
 * Plans the update: checks the contract (if `enforceContract`), runs the migrations
 * (`libraryMigrations.ts`) and only then handles the layers. The impact uses
 * `enforceContract: false` to be able to show what a refused update would do.
 */
function planSpecializationUpdate(
  p: Project,
  spec: Spec,
  options: SpecOpOptions,
  enforceContract: boolean,
): UpdatePlan {
  const current = getSpecialization(p, spec.id) ?? fail('not-found', spec.id);
  if (spec.version <= current.version) fail('spec-not-newer', spec.id);
  // Contract (v4 onward): a break without a declared migration is refused. v1 to v3 do not declare
  // `migrations` and go on as before: whatever becomes invalid becomes a pending item.
  if (
    enforceContract &&
    spec.formatVersion >= 4 &&
    current.spec !== null &&
    missingMigrations(current.spec, spec).length > 0
  ) {
    fail('spec-missing-migrations', spec.id);
  }
  const newId = options.newId ?? (() => crypto.randomUUID());
  const run = runLibraryMigrations(p, spec, current.version, options);
  const migrated = run.project;
  const byId = new Map(spec.layers.map((l) => [l.id, l]));

  const vanished = new Set(
    migrated.layers
      .filter((l) => l.spec?.specId === spec.id && !byId.has(l.spec.layerId))
      .map((l) => l.id),
  );
  // Convert with the new specialization when the type resolves in it (order and name of the
  // already migrated fields); otherwise with the old one, which the migrated project still has.
  const renewed: Project = {
    ...migrated,
    specializations: migrated.specializations.map((s) =>
      s.id === spec.id ? { ...s, version: spec.version, spec } : s,
    ),
  };
  const typeIds = new Set(spec.layers.flatMap((l) => l.annotationTypes.map((t) => t.id)));
  const annotations = migrated.annotations.map((a) => {
    if (!vanished.has(a.layerId) || !a.type) return a;
    const inNew = a.type.specId === spec.id && typeIds.has(a.type.typeId);
    return freeVersionOf(inNew ? renewed : migrated, a, options);
  });

  const existing = new Set<string>();
  const layers = migrated.layers.map((l): Layer => {
    if (l.spec?.specId !== spec.id) return l;
    const next = byId.get(l.spec.layerId);
    if (!next) return { ...l, spec: null };
    existing.add(next.id);
    return { ...l, name: next.name };
  });
  const added = spec.layers
    .filter((l) => !existing.has(l.id))
    .map((l) => newLayer(spec.id, l, newId()));

  // The layout follows what arrives: package -> folder; no package -> single file.
  const packaged = options.packageSpecName !== undefined;
  const file =
    packaged === isPackageFile(current.file)
      ? current.file
      : specFileFor(p, spec.id, options.packageSpecName);
  return {
    run,
    project: {
      ...migrated,
      specializations: migrated.specializations.map((s) =>
        s.id === spec.id ? { ...s, version: spec.version, spec, file } : s,
      ),
      layers: [...layers, ...added],
      annotations,
    },
  };
}

/**
 * Updates to a higher version: runs the new version's `migrations` (rename and remove field,
 * map values, rename and remove type, fill a required field, rename, remove and give a link
 * role) over the annotations; replaces the copy; new layers are created; existing ones keep
 * color and annotations and follow the new name; those that disappeared become free (with the
 * annotations converted). Annotations that end up invalid are not changed: they appear as
 * pending items.
 *
 * Version contract (`formatVersion` 4 onward, with the applied copy available): a break
 * without a declared migration fails with `spec-missing-migrations`; an additive update applies
 * directly.
 */
export function updateSpecialization(
  p: Project,
  spec: Spec,
  options: SpecOpOptions = {},
): Project {
  return planSpecializationUpdate(p, spec, options, true).project;
}

export type SpecRemovalMode = 'delete' | 'convert';

/**
 * Removes the specialization. `delete`: deletes its layers, their annotations and those
 * linked to them in other layers. `convert`: the layers become free and the typed annotations
 * become free (values as text). The copy in `specs/` goes away in both cases.
 */
export function removeSpecialization(
  p: Project,
  specId: string,
  mode: SpecRemovalMode,
  options: SpecOpOptions = {},
): Project {
  if (!getSpecialization(p, specId)) fail('not-found', specId);
  const specializations = p.specializations.filter((s) => s.id !== specId);
  if (mode === 'delete') {
    const doomed = annotationsOfSpec(p, specId);
    const layers = p.layers.filter((l) => l.spec?.specId !== specId);
    if (layers.length === 0) fail('last-layer');
    return pruneHiddenLayers({
      ...p,
      specializations,
      layers,
      annotations: p.annotations.filter((a) => !doomed.has(a.id)),
    });
  }
  const typed = new Set(
    p.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id),
  );
  return {
    ...p,
    specializations,
    layers: p.layers.map((l) => (l.spec?.specId === specId ? { ...l, spec: null } : l)),
    annotations: convertAnnotations(p, typed, options),
  };
}

export interface SpecRemovalImpact {
  /** Annotations deleted (`delete`) or converted (`convert`). */
  readonly annotations: number;
  /** Count per layer (includes those linked in other layers, on `delete`). */
  readonly byLayer: ReadonlyMap<string, number>;
  /** References from other annotations that will be left broken. */
  readonly brokenRefs: number;
}

/** Effect of removing the specialization, for the confirmation. */
export function specializationRemovalImpact(
  p: Project,
  specId: string,
  mode: SpecRemovalMode,
): SpecRemovalImpact {
  if (!getSpecialization(p, specId)) fail('not-found', specId);
  const affected =
    mode === 'delete'
      ? annotationsOfSpec(p, specId)
      : new Set(p.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id));
  const byLayer = new Map<string, number>();
  for (const a of p.annotations) {
    if (affected.has(a.id)) byLayer.set(a.layerId, (byLayer.get(a.layerId) ?? 0) + 1);
  }
  // `delete` without other layers fails; the reference count is still useful.
  const after =
    mode === 'delete'
      ? {
          ...p,
          annotations: p.annotations.filter((a) => !affected.has(a.id)),
        }
      : removeSpecialization(p, specId, mode);
  return { annotations: affected.size, byLayer, brokenRefs: countBrokenRefs(p, after) };
}

export interface SpecUpdateImpact {
  /** Layers that will be created. */
  readonly addedLayers: readonly SpecLayer[];
  /** Project layers that become free (disappeared in the new version). */
  readonly freedLayers: readonly Layer[];
  /** References that will be left broken (after running the migrations). */
  readonly brokenRefs: number;
  /** Differences from the applied version to the new one (empty if the copy is not available). */
  readonly changes: readonly SpecChange[];
  /** The differences that are breaks (subset of `changes`). */
  readonly breaking: readonly SpecChange[];
  /** Breaks without a declared migration: the v4 update is refused (`refused`). */
  readonly missingMigrations: readonly SpecChange[];
  /** The steps of the declared chain, in order (the flattened list of `steps[].step`). */
  readonly migrations: readonly SpecMigrationStep[];
  /** `false` when the applied copy is not available (`spec: null`): it cannot be compared. */
  readonly comparable: boolean;
  /** Comparable, no break and no layer that becomes free: the update applies directly, without an impact dialog. */
  readonly additive: boolean;
  /** The contract refuses: v4, comparable and with a break without a migration (`spec-missing-migrations`). */
  readonly refused: boolean;
  /** What each step of the chain does in this project (the `runLibraryMigrations` report). */
  readonly steps: readonly MigrationStepReport[];
  /** The values that the migrations erase or overwrite, in step order. */
  readonly losses: readonly MigrationLoss[];
  /** Annotations converted to free by the `remove-type` steps with `convert`. */
  readonly converted: number;
  /** Annotations deleted by the `remove-type` steps with `delete` (with the linked ones). */
  readonly deleted: number;
  /** Children that left the link with the owner through the `remove-role` steps with `unlink`. */
  readonly unlinked: number;
  /**
   * NEW pending items after the update (already discounting those that existed before, by
   * annotation, code, field, row and column): of this specialization's typed annotations and of
   * those that the migrations converted to free. Computed on the real after, with the migrations.
   */
  readonly pending: readonly {
    readonly annotationId: string;
    readonly issue: AnnotationIssue;
  }[];
}

const issueKey = (i: AnnotationIssue): string =>
  [i.code, i.key ?? '', i.rowId ?? '', i.column ?? ''].join('\u0000');

/** Pending items that exist in `after` and did not exist in `before`, in the specialization's annotations. */
function newIssues(
  before: Project,
  after: Project,
  specId: string,
): SpecUpdateImpact['pending'] {
  const was = new Set(
    before.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id),
  );
  const prior = projectIssues(before);
  const pending: { annotationId: string; issue: AnnotationIssue }[] = [];
  for (const a of after.annotations) {
    // Typed in the specialization, or converted to free along the way.
    if (a.type?.specId !== specId && !was.has(a.id)) continue;
    const known = new Set((prior.get(a.id) ?? []).map(issueKey));
    for (const issue of projectIssues(after).get(a.id) ?? []) {
      if (!known.has(issueKey(issue))) pending.push({ annotationId: a.id, issue });
    }
  }
  return pending;
}

/** Additive: comparable, no break and no layer that becomes free (its annotations would become free). */
const isAdditive = (
  comparable: boolean,
  breaking: readonly SpecChange[],
  freed: readonly Layer[],
): boolean => comparable && breaking.length === 0 && freed.length === 0;

/**
 * Effect of updating to `spec` (which must have a higher `version`). It does not throw because
 * of the contract: when the update would be refused, `refused` is `true` and the rest describes
 * what would happen without the refusal.
 */
export function specializationUpdateImpact(p: Project, spec: Spec): SpecUpdateImpact {
  const { project: after, run } = planSpecializationUpdate(p, spec, {}, false);
  const current = new Set(
    p.layers.filter((l) => l.spec?.specId === spec.id).map((l) => l.spec?.layerId),
  );
  const next = new Set(spec.layers.map((l) => l.id));
  const applied = getSpecialization(p, spec.id)?.spec ?? null;
  const changes = applied ? diffSpecs(applied, spec) : [];
  const breaking = changes.filter((c) => c.kind === 'breaking');
  const freedLayers = p.layers.filter(
    (l) => l.spec?.specId === spec.id && !next.has(l.spec.layerId),
  );
  const missing = applied ? missingMigrations(applied, spec) : [];
  return {
    addedLayers: spec.layers.filter((l) => !current.has(l.id)),
    freedLayers,
    brokenRefs: countBrokenRefs(p, after),
    changes,
    breaking,
    missingMigrations: missing,
    migrations: applied
      ? (migrationChain(spec, applied.version) ?? []).flatMap((m) => m.steps)
      : [],
    comparable: applied !== null,
    additive: isAdditive(applied !== null, breaking, freedLayers),
    refused: applied !== null && spec.formatVersion >= 4 && missing.length > 0,
    steps: run.steps,
    losses: run.losses,
    converted: run.steps.reduce((n, s) => n + s.converted, 0),
    deleted: run.steps.reduce((n, s) => n + s.deleted, 0),
    unlinked: run.steps.reduce((n, s) => n + s.unlinked, 0),
    pending: newIssues(p, after, spec.id),
  };
}
