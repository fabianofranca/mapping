import {
  checkSpecApply,
  fail,
  getSpecialization,
  packageDirOf,
  packageSpecNameOf,
  specWarnings,
  specializationUpdateImpact,
  type JsonValue,
  type MigrationLoss,
  type MigrationLossReason,
  type Project,
  type Spec,
  type SpecChange,
  type SpecUpdateImpact,
} from '../src/model';
import {
  validateLibrary,
  type LibraryIssue,
  type LibraryReport,
} from '../src/model/library';
import { LocalFileChecker } from './codeFiles';
import { externalDocWarnings, projectDocChecker } from './docFiles';
import { ToolError } from './errors';
import { plainWarnings } from './specValidation';
import { Refs } from './items';
import {
  MAX_ISSUES,
  issueView,
  ignoredPathsIssues,
  readSpecInput,
  type ReadPackage,
  type SpecInput,
} from './library';
import { MODEL_ERROR_MESSAGES } from './modelErrors';
import type { Roots } from './paths';
import { findProject, loadProject } from './projects';

// Library update by the server (Library stage, B4): what `apply_specialization` and
// `update_specialization` need to carry a v4 package in a proposal (validate, check the
// version contract, describe the migration) and the `plan_library_update` tool, the read-only
// preview of the impact of raising the version. The server never writes `specs/` or the `mapping.json`:
// the package files wait in `proposals/<id>/specs/<folder>/…` until the person accepts.

type Json = Record<string, unknown>;

/** Lists in a `plan_library_update` response (losses, pending items, changes…). */
const MAX_LIST = 100;
/** Losses listed inside each step (the total stays in `lossCount`). */
const MAX_STEP_LOSSES = 10;
/** Validation errors cited in the `invalid-library` message. */
const MAX_ERRORS_IN_ERROR = 10;
/** A lost value larger than this goes only as a preview. */
const MAX_VALUE_PREVIEW = 200;

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Validation of the package read

/** The package with the specialization read (level 1) and the name of its file at the folder root. */
export interface ParsedPackage {
  readonly spec: Spec;
  /** Name of the specialization file inside the package (`material3.spec.json`). */
  readonly specName: string;
}

/** Invalid-library error: the first validator errors, each with `file` and `path`. */
function invalidLibrary(report: LibraryReport): ToolError {
  const errors = report.errors.map(issueView);
  const first = report.errors[0];
  return new ToolError(
    'invalid-library',
    `the library has ${plural(report.errors.length, 'error', 'errors')} and cannot be used${
      first ? `: ${first.file === '' ? '' : `${first.file} `}${first.message}` : ''
    }`,
    {
      errors: errors.slice(0, MAX_ERRORS_IN_ERROR),
      ...(errors.length > MAX_ERRORS_IN_ERROR
        ? { moreErrors: errors.length - MAX_ERRORS_IN_ERROR }
        : {}),
      hint: 'run validate_library on the folder (with `previous` on an update), fix each error by its `file` and `path` and propose again',
    },
  );
}

/** Text of the package files by path (to find the specialization file). */
function textsOf(pkg: ReadPackage): Map<string, string> {
  const texts = new Map<string, string>();
  for (const file of pkg.files) {
    if (file.text !== undefined) texts.set(file.path, file.text);
  }
  return texts;
}

/**
 * Validator level 1: reads the package's specialization (without it, there is no way to go on). The rest
 * of the errors is left to `validatePackage`, once the previous version is known.
 */
export function parsePackage(pkg: ReadPackage): ParsedPackage {
  const report = validateLibrary({
    files: pkg.files,
    ...(pkg.specPath === undefined ? {} : { specPath: pkg.specPath }),
    level: 1,
  });
  if (report.spec === undefined) throw invalidLibrary(report);
  return {
    spec: report.spec,
    specName: pkg.specPath ?? packageSpecNameOf(textsOf(pkg), report.spec.id),
  };
}

/** The three validator levels, with `previous` (the applied copy) wiring up the version contract. */
export function validatePackage(pkg: ReadPackage, previous?: Spec): LibraryReport {
  const report = validateLibrary({
    files: pkg.files,
    ...(pkg.specPath === undefined ? {} : { specPath: pkg.specPath }),
    ...(previous === undefined ? {} : { previous }),
  });
  const ignored = ignoredPathsIssues(pkg.ignoredPaths);
  return ignored.length === 0
    ? report
    : { ...report, warnings: [...report.warnings, ...ignored] };
}

/** A validator error prevents use; a warning allows it and is returned. */
export function requireValid(report: LibraryReport): readonly LibraryIssue[] {
  if (!report.ok) throw invalidLibrary(report);
  return report.warnings;
}

// ---------------------------------------------------------------------------
// Update: the contract before proposing

/**
 * Checks what `updateSpecialization` would require and returns the impact: the specialization must
 * be applied, the version must grow, and a break without a migration (v4 with the applied copy
 * available) is refused with the list of what is missing.
 */
export function checkUpdate(p: Project, spec: Spec): SpecUpdateImpact {
  const applied = getSpecialization(p, spec.id);
  if (!applied) {
    throw new ToolError(
      'not-found',
      `specialization not applied: ${spec.id} (use apply_specialization)`,
      { specId: spec.id },
    );
  }
  if (spec.version <= applied.version) fail('spec-not-newer', spec.id);
  const impact = specializationUpdateImpact(p, spec);
  if (impact.refused) {
    throw new ToolError(
      'spec-missing-migrations',
      MODEL_ERROR_MESSAGES['spec-missing-migrations'],
      {
        specId: spec.id,
        from: applied.version,
        to: spec.version,
        missingMigrations: missingView(impact.missingMigrations),
        hint: `declare in \`migrations\` an entry with \`from: ${applied.version}\` and \`to: ${spec.version}\` with a step for each listed break, validate with validate_library (previous = the applied copy) and check with plan_library_update`,
      },
    );
  }
  return impact;
}

function missingView(changes: readonly SpecChange[]): Json[] {
  return changes.slice(0, MAX_LIST).map((c) => ({ message: c.message, path: c.path }));
}

/** What the migration does to the project, in a short phrase for the operation's description. */
export function updateSummary(impact: SpecUpdateImpact): string[] {
  const parts: string[] = [];
  if (impact.addedLayers.length > 0) {
    parts.push(`new layers: ${impact.addedLayers.map((l) => `"${l.name}"`).join(', ')}`);
  }
  if (impact.freedLayers.length > 0) {
    parts.push(
      `layers that become free-form: ${impact.freedLayers.map((l) => `"${l.name}"`).join(', ')}`,
    );
  }
  if (impact.steps.length > 0) {
    const values = impact.steps.reduce((n, s) => n + s.values, 0);
    const refs = impact.steps.reduce((n, s) => n + s.refs, 0);
    const migration = [`migration in ${plural(impact.steps.length, 'step', 'steps')}`];
    if (values > 0) {
      migration.push(plural(values, 'value changed', 'values changed'));
    }
    if (impact.converted > 0) {
      migration.push(
        plural(
          impact.converted,
          'annotation converted to free-form',
          'annotations converted to free-form',
        ),
      );
    }
    if (impact.deleted > 0) {
      migration.push(plural(impact.deleted, 'annotation deleted', 'annotations deleted'));
    }
    if (refs > 0) {
      migration.push(plural(refs, 'reference rewritten', 'references rewritten'));
    }
    parts.push(migration.join(', '));
  }
  const unlinked = impact.losses.filter((l) => l.reason === 'unlinked').length;
  const lost = valueLosses(impact.losses) - unlinked;
  if (lost > 0) parts.push(plural(lost, 'value lost', 'values lost'));
  if (unlinked > 0) parts.push(plural(unlinked, 'link undone', 'links undone'));
  if (impact.pending.length > 0) {
    parts.push(plural(impact.pending.length, 'new pending item', 'new pending items'));
  }
  if (impact.brokenRefs > 0) {
    parts.push(plural(impact.brokenRefs, 'broken reference', 'broken references'));
  }
  return parts;
}

/** Value losses, cleared role and undone link (the annotation deleted by `remove-type` already counts in `deleted`). */
function valueLosses(losses: readonly MigrationLoss[]): number {
  return losses.filter((l) => l.reason !== 'removed-type').length;
}

// ---------------------------------------------------------------------------
// Package files that accompany the proposal

/**
 * The folder's files with the final path in the project (`specs/<folder>/<relative>`), which
 * is what the proposal keeps in `proposals/<id>/…`. The specialization file follows the name of the
 * project's `file` (the model cleans the name for a file).
 */
export function packageFileEntries(
  pkg: ReadPackage,
  specName: string,
  entryFile: string,
): [string, Uint8Array][] {
  const dir = packageDirOf(entryFile);
  if (dir === null) {
    throw new Error(`the specialization's file is not from a package: ${entryFile}`);
  }
  const target = entryFile.slice(dir.length + 1);
  const entries: [string, Uint8Array][] = [];
  for (const [path, bytes] of pkg.bytes ?? []) {
    entries.push([`${dir}/${path === specName ? target : path}`, bytes]);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// plan_library_update

const LOSS_TEXT: Record<MigrationLossReason, (field: string) => string> = {
  'removed-field': (field) => `the value of field "${field}" is deleted`,
  'removed-type': () => 'the annotation is deleted along with the removed type',
  'replaced-value': (field) =>
    `the value of "${field}" no longer holds in the field's type and is replaced by the default`,
  'overwritten-value': (field) =>
    `field "${field}" already had a value and is overwritten`,
  'cleared-role': () => 'the annotation loses its role in the link and stays linked',
  unlinked: () => 'the annotation leaves the link with its owner',
};

function previewValue(value: JsonValue): JsonValue {
  const text = JSON.stringify(value);
  return text.length <= MAX_VALUE_PREVIEW
    ? value
    : `${text.slice(0, MAX_VALUE_PREVIEW)}…`;
}

function lossView(refs: Refs, loss: MigrationLoss): Json {
  const field = loss.field ?? '';
  return {
    reason: loss.reason,
    message: LOSS_TEXT[loss.reason](field),
    annotation: refs.ref('a', loss.annotationId),
    marking: refs.ref('m', loss.markingId),
    markingLabel: refs.label('m', loss.markingId),
    ...(loss.typeId === '' ? {} : { typeId: loss.typeId }),
    ...(loss.role === undefined ? {} : { role: loss.role }),
    ...(loss.field === undefined ? {} : { field: loss.field }),
    ...(loss.rowId === undefined ? {} : { rowId: loss.rowId }),
    ...(loss.value === undefined ? {} : { value: previewValue(loss.value) }),
  };
}

function limited<T>(list: readonly T[]): T[] {
  return list.slice(0, MAX_LIST);
}

function changeView(change: SpecChange): Json {
  return {
    code: change.code,
    kind: change.kind,
    path: change.path,
    message: change.message,
  };
}

/** The steps with the counts and the losses of each. */
function stepViews(refs: Refs, impact: SpecUpdateImpact): Json[] {
  return impact.steps.slice(0, MAX_LIST).map((s) => ({
    from: s.from,
    to: s.to,
    index: s.index,
    step: s.step,
    annotations: s.annotations,
    values: s.values,
    converted: s.converted,
    deleted: s.deleted,
    refs: s.refs,
    unlinked: s.unlinked,
    lossCount: s.losses.length,
    losses: s.losses.slice(0, MAX_STEP_LOSSES).map((l) => lossView(refs, l)),
  }));
}

function updateView(refs: Refs, impact: SpecUpdateImpact): Json {
  return {
    additive: impact.additive,
    refused: impact.refused,
    comparable: impact.comparable,
    missingMigrations: missingView(impact.missingMigrations),
    missingMigrationsTotal: impact.missingMigrations.length,
    changes: limited(impact.changes).map(changeView),
    changesTotal: impact.changes.length,
    steps: stepViews(refs, impact),
    stepsTotal: impact.steps.length,
    converted: impact.converted,
    deleted: impact.deleted,
    losses: limited(impact.losses).map((l) => lossView(refs, l)),
    lossesTotal: impact.losses.length,
    pending: limited(impact.pending).map(({ annotationId, issue }) => ({
      annotation: refs.ref('a', annotationId),
      label: refs.label('a', annotationId),
      code: issue.code,
      ...(issue.key === undefined ? {} : { field: issue.key }),
      ...(issue.rowId === undefined ? {} : { rowId: issue.rowId }),
      ...(issue.column === undefined ? {} : { column: issue.column }),
    })),
    pendingTotal: impact.pending.length,
    brokenRefs: impact.brokenRefs,
    addedLayers: impact.addedLayers.map((l) => ({ id: l.id, name: l.name })),
    freedLayers: impact.freedLayers.map((l) => ({ id: l.spec?.layerId, name: l.name })),
  };
}

function issuesView(issues: readonly LibraryIssue[]): {
  items: Json[];
  more: number;
} {
  const views = issues.map(issueView);
  return {
    items: views.slice(0, MAX_ISSUES),
    more: Math.max(0, views.length - MAX_ISSUES),
  };
}

/** Layers that become free-form: their typed annotations become text pairs, and the person needs to know. */
function freedLayersSteps(impact: SpecUpdateImpact): string[] {
  if (impact.refused || impact.freedLayers.length === 0) return [];
  return [
    'layers become free-form (`freedLayers`): their typed annotations become text pairs; confirm with the person and say so in the proposal',
  ];
}

/** What the person and the agent do next, depending on the impact. */
function updateHint(impact: SpecUpdateImpact, valid: boolean): string {
  const steps: string[] = [];
  if (!valid) {
    steps.push(
      'fix the validation errors (`file` and `path` point to the spot) before proposing',
    );
  }
  if (!impact.comparable) {
    steps.push(
      'the applied copy of the specialization is not available: the versions cannot be compared nor the breaks checked; the impact below only carries the declared migrations',
    );
  }
  if (impact.refused) {
    steps.push(
      `declare \`migrations\` for each break in \`missingMigrations\` (one step per break: rename-type, remove-type, rename-field, remove-field, map-values, fill-field, rename-role, remove-role or set-role) and run plan_library_update again; update_specialization is refused while any is missing`,
    );
  } else if (impact.additive) {
    steps.push(
      'additive change: propose update_specialization with `file` of this folder (propose_changes); the person applies it without an impact dialog',
    );
  } else {
    steps.push(
      'the declared migrations cover the breaks: propose update_specialization with `file` of this folder (propose_changes) and describe what changes in the proposal',
    );
  }
  steps.push(...freedLayersSteps(impact));
  const lost = valueLosses(impact.losses) > 0 || impact.deleted > 0;
  if (!impact.refused && lost) {
    steps.push(
      'the migration loses data (`losses`): confirm with the person before proposing and say in the proposal what is lost',
    );
  }
  if (!impact.refused && impact.pending.length > 0) {
    steps.push(
      'new pending items remain (`pending`): the person resolves them in the list after applying',
    );
  }
  return steps.join('; ');
}

/**
 * `plan_library_update`: the read-only preview of taking the package at `path` to the project
 * (apply, update or nothing). It writes nothing, not even a proposal.
 */
export async function planLibraryUpdate(
  roots: Roots,
  args: { project: string; path: string },
): Promise<Json> {
  const location = await findProject(roots, args.project);
  const loaded = await loadProject(roots, location);
  const p = loaded.project;
  const refs = new Refs(loaded);
  const input: SpecInput = await readSpecInput(roots, args.path, undefined, {
    raw: false,
  });
  const base = { project: { name: location.name, path: location.path }, path: args.path };

  let spec: Spec;
  if (input.kind === 'file') {
    spec = input.spec;
  } else {
    try {
      spec = parsePackage(input.pkg).spec;
    } catch (error) {
      if (!(error instanceof ToolError) || error.code !== 'invalid-library') throw error;
      // No readable specialization: returns the validation instead of an error.
      const report = validateLibrary({
        files: input.pkg.files,
        ...(input.pkg.specPath === undefined ? {} : { specPath: input.pkg.specPath }),
        level: 1,
      });
      const errors = issuesView(report.errors);
      return {
        ...base,
        validation: {
          valid: false,
          errors: errors.items,
          ...(errors.more > 0 ? { moreErrors: errors.more } : {}),
          warnings: [],
        },
        hint: 'fix the validation errors (`file` and `path` point to the spot): without the specialization there is no way to plan the update',
      };
    }
  }

  const decision = checkSpecApply(p, spec);
  const applied = getSpecialization(p, spec.id);

  // Validation: the v4 package with the three levels (and the version contract, when it is an update);
  // a v1 to v3 file only has the specialization's warnings.
  let valid = true;
  let validation: Json;
  if (input.kind === 'package') {
    const previous = decision === 'update' ? (applied?.spec ?? undefined) : undefined;
    const report = validatePackage(input.pkg, previous);
    const errors = issuesView(report.errors);
    // The external document is checked by the clone the project already keeps (`docRepos`).
    const docWarnings = await externalDocWarnings(
      spec,
      input.pkg.specPath ?? '',
      projectDocChecker(p, new LocalFileChecker(roots.workDir), location.dir),
    );
    const warnings = issuesView([...report.warnings, ...docWarnings]);
    valid = report.ok;
    validation = {
      valid,
      errors: errors.items,
      ...(errors.more > 0 ? { moreErrors: errors.more } : {}),
      warnings: warnings.items,
      ...(warnings.more > 0 ? { moreWarnings: warnings.more } : {}),
    };
  } else {
    validation = { valid, errors: [], warnings: plainWarnings(specWarnings(spec)) };
  }

  const identity = {
    specId: spec.id,
    name: spec.name,
    formatVersion: spec.formatVersion,
    from: applied?.version ?? null,
    to: spec.version,
    decision,
    validation,
  };

  if (decision === 'apply') {
    return {
      ...base,
      ...identity,
      hint: `${valid ? '' : 'fix the validation errors before proposing; '}the library is not applied to the project yet: propose apply_specialization with \`file\` of this ${input.kind === 'package' ? 'folder' : 'file'} (propose_changes)`,
    };
  }
  if (decision === 'not-newer') {
    return {
      ...base,
      ...identity,
      hint: `the version (v${spec.version}) is not greater than the applied one (v${applied?.version}): raise the package's \`version\` to update`,
    };
  }
  const impact = specializationUpdateImpact(p, spec);
  return {
    ...base,
    ...identity,
    ...updateView(refs, impact),
    hint: updateHint(impact, valid),
  };
}
