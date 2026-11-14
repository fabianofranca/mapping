import { readFile, stat } from 'node:fs/promises';
import {
  parseSpecText,
  specWarnings,
  usesPackageFiles,
  type Spec,
  type SpecWarning,
} from '../src/model';
import { ToolError } from './errors';
import { libraryCounts } from './library';
import type { Roots } from './paths';

// `validate_specialization` (stage 4.2): the "generate, validate, fix" cycle of an agent that
// creates specializations. It uses the same validation as the app's import (`parseSpecText`, in
// `src/model/spec.ts`), so the errors are the same, with the exact path; the warnings
// (`specWarnings`, including the one for the removed type's fields that the reader ignores) block
// nothing. It does not apply to any project.

type Json = Record<string, unknown>;

/** A specialization file larger than this is refused. */
const MAX_SPEC_BYTES = 16 * 1024 * 1024;
/** Errors returned at once; the app's import also shows only the first ones. */
const MAX_ERRORS = 100;

/** The warnings as the MCP returns them: `code`, `path` and `message` (without the interface's message code). */
export function plainWarnings(
  warnings: readonly SpecWarning[],
): { code: string; path: string; message: string }[] {
  return warnings.map(({ code, path, message }) => ({ code, path, message }));
}

export async function readSpecFile(roots: Roots, path: string): Promise<string> {
  const { real } = await roots.resolveExisting(path);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `not a file: ${path}`, { path });
  }
  if (info.size > MAX_SPEC_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${path}`, { path });
  }
  return readFile(real, 'utf8');
}

export function summary(spec: Spec): Json {
  const types = spec.layers.flatMap((layer) => layer.annotationTypes);
  const fieldsWithSources = types.reduce(
    (sum, type) => sum + type.fields.filter((f) => (f.sources ?? []).length > 0).length,
    0,
  );
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    formatVersion: spec.formatVersion,
    platforms: (spec.platforms ?? []).map((p) => p.id),
    ...(spec.containers !== undefined ? { containers: spec.containers.length } : {}),
    layers: spec.layers.length,
    types: types.length,
    typesWithSources: types.filter((t) => (t.sources ?? []).length > 0).length,
    fieldsWithSources,
    ...(spec.formatVersion >= 4 ? libraryCounts(spec) : {}),
  };
}

export async function validateSpecialization(
  roots: Roots,
  args: { path?: string | undefined; text?: string | undefined },
): Promise<Json> {
  if ((args.path === undefined) === (args.text === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'provide exactly one of `path` (a file inside the roots) or `text` (the JSON)',
    );
  }
  const text =
    args.path !== undefined ? await readSpecFile(roots, args.path) : args.text!;
  const parsed = parseSpecText(text);
  const origin = args.path !== undefined ? { path: args.path } : {};
  if (!parsed.ok) {
    return {
      valid: false,
      ...origin,
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, MAX_ERRORS),
      // Only `path` and `message`: the model's code (`code`/`params`) belongs to the interface, not the MCP.
      issues: parsed.issues
        .slice(0, MAX_ERRORS)
        .map(({ path, message }) => ({ path, message })),
      ...(parsed.errors.length > MAX_ERRORS
        ? { moreErrors: parsed.errors.length - MAX_ERRORS }
        : {}),
      hint: "fix the errors (each one's path points to the stretch of JSON) and validate again; the file was not applied to any project",
    };
  }
  // Only `code`, `path` and `message`: the model's message code belongs to the interface, not the MCP.
  const warnings = plainWarnings(specWarnings(parsed.spec, parsed.ignored));
  return {
    valid: true,
    ...origin,
    spec: summary(parsed.spec),
    errors: [],
    warnings,
    hint: usesPackageFiles(parsed.spec)
      ? "only the specialization FILE was validated: to check the package's components, documents, examples and fonts use validate_library on the folder; to apply a v4 package use apply_specialization (or update_specialization) in propose_changes with the folder's `file`, or the app (Specializations)"
      : warnings.length > 0
        ? 'the specialization is valid; the warnings do not prevent the import, but they usually point to oversights'
        : 'the specialization is valid and can be applied (apply_specialization in propose_changes)',
  };
}
