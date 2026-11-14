import {
  codeBlueprint,
  codeLocalPath,
  effectiveDirection,
  markingAnchorDefaults,
  findPlatform,
  findSpecType,
  placedTypeNotices,
  compareNotices,
  repoLink,
  resolveCode,
  specPlatformRepo,
  projectIndex,
  projectPlatforms,
  typeOfAnnotation,
  type Annotation,
  type BlueprintAnnotation,
  type BlueprintNode,
  type BlueprintTarget,
  type Spec,
  type SpecAnnotationType,
  type SpecCode,
  type SpecRepo,
  type BlueprintParam,
  type Signature,
  unmappedParams,
} from '../src/model';
import type { LocalFile, LocalFileChecker } from './codeFiles';
import { ToolError } from './errors';
import type { Refs } from './items';
import type { SignatureReader } from './signatureFiles';

// JSON views of the specializations' instantiation code (stage 3b.4; stage 9; stage
// Instantiation code): the `code` of each type's platforms (`symbol`, what you call, and
// `definition`, the file that defines it, with the URL and the `ref` of the specialization's `repo` and
// the local path of the project's overlay) and the `get_code_hints` calls. The server only builds paths and checks existence
// (`codeFiles.ts`): no code file is read.

type Json = Record<string, unknown>;

/**
 * What a type's `code` is, repeated in the responses that show platforms
 * (`get_specialization`, `get_project`) so the concept reaches the agent by any path.
 */
export const CODE_HINT =
  "The `code` of a type is the instantiation code: `symbol` is what you call to create an instance of the type on that platform, `path` is the file that defines the `symbol` (read the signature before writing the call), `params` and `values` say how to pass the fields, `notes` guides. The library's repository is in the specialization's `platforms[].repo`; the local clone, in the project's `platformRepos`. The mapping stores nothing about the solution.";

/** What the views need to resolve a type's `path`. */
export interface CodeContext {
  readonly refs: Refs;
  readonly files: LocalFileChecker;
  /** Reads the signature sheet of the applied package (for `unmapped`); without it, the `code` carries no `unmapped`. */
  readonly signatures?: SignatureReader;
}

/** Platform requested in `platform`: it must be declared by some applied specialization. */
export function assertPlatform(refs: Refs, platformId: string): void {
  const p = refs.project;
  if (findPlatform(p, platformId)) return;
  throw new ToolError(
    'unknown-platform',
    `platform not declared by the applied specializations: ${platformId}`,
    { platform: platformId, platforms: projectPlatforms(refs.project).map((x) => x.id) },
  );
}

/** Where the file is in the client's local clone (`null`s without a configured `localPath`). */
const NO_LOCAL: LocalFile = { localFile: null, exists: null };

/**
 * `definition` of a `code` entry: the file that defines the `symbol`, with the `url` and the
 * `ref` of the specialization's `repo` and `localFile`/`exists` from the project's local overlay.
 * `null` without `path`.
 */
function definitionJson(
  path: string | null | undefined,
  repo: SpecRepo | null,
  local: LocalFile,
): Json | null {
  if (path === null || path === undefined) return null;
  return {
    path,
    url: repoLink(repo, path),
    ref: repo?.ref ?? null,
    localFile: local.localFile,
    exists: local.exists,
    ...(local.problem ? { localFileProblem: local.problem } : {}),
  };
}

async function resolveDefinition(
  ctx: CodeContext,
  specId: string,
  platform: string,
  path: string | null | undefined,
): Promise<Json | null> {
  if (path === null || path === undefined) return null;
  const local = await ctx.files.check(
    ctx.refs.loaded.location.dir,
    codeLocalPath(ctx.refs.project, { specId, platform, path }),
  );
  return definitionJson(path, specPlatformRepo(ctx.refs.project, specId, platform), {
    localFile: local.localFile,
    exists: local.exists,
    problem: local.problem,
  });
}

/** Single shape of a `code` entry: `symbol`, `definition` (or `null`) and the rest (`params`, `values`, `notes`). */
function codeEntryJson(
  entry: SpecCode,
  definition: Json | null,
  signature: Signature | null = null,
): Json {
  const { symbol, ...rest } = entry;
  delete (rest as { path?: string }).path;
  return {
    symbol,
    definition,
    ...rest,
    ...(signature === null ? {} : { unmapped: unmappedParams(signature, entry) }),
  };
}

/** The signature sheet of the `code` entry (for `unmapped`); `null` without a sheet or without a way to read it. */
async function signatureOf(
  ctx: CodeContext | null,
  specId: string,
  entry: SpecCode,
): Promise<Signature | null> {
  if (ctx?.signatures === undefined || entry.signature === undefined) return null;
  return ctx.signatures(specId, entry.signature);
}

/**
 * `code` of the annotation's type per platform (`symbol`, `definition`, `params`, `values`,
 * `notes`), already resolved by the annotation's values (the `variants` case applied; the output
 * does not carry `variants`). With `platform`, only that one. `null` if the type has no `code` (for that
 * platform).
 */
export async function annotationCode(
  ctx: CodeContext,
  annotation: Annotation,
  platform?: string,
): Promise<Json | null> {
  const resolved = typeOfAnnotation(ctx.refs.project, annotation);
  const code = resolved?.type.code;
  if (!resolved || !code) return null;
  const { fields } = resolved.type;
  return typeCodeView(ctx, resolved.spec.id, code, platform, (entry) =>
    resolveCode(entry, annotation.values, fields),
  );
}

/**
 * `code` of a type (or only the platforms in `only`) in the single shape, with the `definition`
 * resolved; `null` if no platform is left. `get_marking`, `get_annotation` and
 * `find_by_code` use the same one. `resolveEntry` replaces each entry beforehand (the annotation's
 * resolved code); without it, the type's raw `code` (with `variants`).
 */
export async function typeCodeView(
  ctx: CodeContext,
  specId: string,
  code: Readonly<Record<string, SpecCode>>,
  only?: string | ReadonlySet<string>,
  resolveEntry?: (entry: SpecCode) => SpecCode,
): Promise<Json | null> {
  const wanted = (id: string) =>
    only === undefined || (typeof only === 'string' ? id === only : only.has(id));
  const entries = await Promise.all(
    Object.entries(code)
      .filter(([id]) => wanted(id))
      .map(async ([id, raw]): Promise<[string, Json]> => {
        const entry = resolveEntry ? resolveEntry(raw) : raw;
        return [
          id,
          codeEntryJson(
            entry,
            await resolveDefinition(ctx, specId, id, entry.path),
            await signatureOf(ctx, specId, entry),
          ),
        ];
      }),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * `code` of a type read from a package (`get_component`): the `repo` comes from the package's
 * specialization and, with `ctx` (a package applied to a project), so does the local overlay.
 */
export async function packageCodeView(
  spec: Spec,
  code: Readonly<Record<string, SpecCode>>,
  ctx: CodeContext | null,
  readSignature?: (ref: string) => Promise<Signature | null>,
): Promise<Json> {
  const entries = await Promise.all(
    Object.entries(code).map(async ([id, entry]): Promise<[string, Json]> => {
      const repo = spec.platforms?.find((x) => x.id === id)?.repo ?? null;
      let local = NO_LOCAL;
      if (ctx && entry.path) {
        const checked = await ctx.files.check(
          ctx.refs.loaded.location.dir,
          codeLocalPath(ctx.refs.project, {
            specId: spec.id,
            platform: id,
            path: entry.path,
          }),
        );
        local = {
          localFile: checked.localFile,
          exists: checked.exists,
          problem: checked.problem,
        };
      }
      const signature =
        readSignature === undefined || entry.signature === undefined
          ? null
          : await readSignature(entry.signature);
      return [
        id,
        codeEntryJson(entry, definitionJson(entry.path, repo, local), signature),
      ];
    }),
  );
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// get_code_hints

/** Target of a `ref` for the whole annotation: the position, the label and the expanded target. */
function hintTarget(
  target: BlueprintTarget,
  refs: Refs,
  codes: ReadonlyMap<string, Json>,
): Json {
  const base = {
    field: target.field,
    row: target.row,
    column: target.column,
    label: target.label,
  };
  if (target.annotation === null) return { ...base, repeated: true };
  const children = target.children.map((c) => hintNode(c, refs, codes));
  return {
    ...base,
    annotation: hintAnnotation(target.annotation, refs, codes),
    ...(children.length > 0 ? { children } : {}),
  };
}

/**
 * An argument of the call: `{ field, name, value }`; the positional one (`#n`, formatVersion 16) carries
 * `position` in place of `name`; a factory's (`calls`) is `{ name, call, args }`, with only the
 * filled-in fields.
 */
function argJson(param: BlueprintParam): Json {
  if (param.call !== undefined) {
    return {
      name: param.name,
      call: param.call,
      args: (param.args ?? []).map((arg) => argJson(arg)),
    };
  }
  if (param.position !== undefined) {
    return { field: param.key, position: param.position, value: param.value };
  }
  return { field: param.key, name: param.name, value: param.value };
}

function hintAnnotation(
  annotation: BlueprintAnnotation,
  refs: Refs,
  codes: ReadonlyMap<string, Json>,
): Json {
  const linked = annotation.linked.map((a) => hintAnnotation(a, refs, codes));
  const targets = annotation.targets.map((t) => hintTarget(t, refs, codes));
  const code = codes.get(annotation.annotationId);
  const parentRole = projectIndex(refs.project).annotations.get(
    annotation.annotationId,
  )?.parentRole;
  return {
    ref: refs.ref('a', annotation.annotationId),
    type: `${annotation.specId}/${annotation.typeId}`,
    label: annotation.label,
    layer: annotation.layer,
    ...(parentRole ? { parentRole } : {}),
    ...(code === undefined ? {} : { code }),
    ...(annotation.params.length > 0
      ? { args: annotation.params.map((param) => argJson(param)) }
      : {}),
    ...(Object.keys(annotation.values).length > 0 ? { values: annotation.values } : {}),
    ...(linked.length > 0 ? { linked } : {}),
    ...(targets.length > 0 ? { targets } : {}),
  };
}

/**
 * The marking's anchor for whoever writes the code: the target marking and the effective side and alignment
 * (the ones declared on the marking or, failing that, the component's: `top` and `center` without them).
 * `null` without an anchor.
 */
function hintAnchor(refs: Refs, markingId: string): Json | null {
  const marking = projectIndex(refs.project).markings.get(markingId);
  if (marking?.anchor == null) return null;
  const defaults = markingAnchorDefaults(refs.project, refs.loaded.catalog)(marking);
  return {
    marking: refs.ref('m', marking.anchor.to),
    side: marking.anchor.side ?? defaults?.side ?? 'top',
    align: marking.anchor.align ?? defaults?.align ?? 'center',
  };
}

function hintNode(
  node: BlueprintNode,
  refs: Refs,
  codes: ReadonlyMap<string, Json>,
): Json {
  const annotations = node.annotations.map((a) => hintAnnotation(a, refs, codes));
  const children = node.children.map((c) => hintNode(c, refs, codes));
  const marking = projectIndex(refs.project).markings.get(node.markingId);
  const anchor = hintAnchor(refs, node.markingId);
  return {
    ref: refs.ref('m', node.markingId),
    name: node.name,
    rect: node.rect,
    // Effective reading direction of the marking's space (its container, otherwise the project's).
    direction: effectiveDirection(refs.project, marking?.containerId ?? null),
    ...(anchor === null ? {} : { anchor }),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Annotations of the tree, with the linked ones and those of the expanded targets (and of their children). */
function allAnnotations(node: BlueprintNode): BlueprintAnnotation[] {
  const out: BlueprintAnnotation[] = [];
  const visitAnnotation = (a: BlueprintAnnotation) => {
    out.push(a);
    a.linked.forEach(visitAnnotation);
    for (const target of a.targets) {
      if (target.annotation) visitAnnotation(target.annotation);
      target.children.forEach(visit);
    }
  };
  function visit(n: BlueprintNode): void {
    n.annotations.forEach(visitAnnotation);
    n.children.forEach(visit);
  }
  visit(node);
  return out;
}

/**
 * `notices` of the type for `get_code_hints`: the notices of the type, fields and columns, by
 * severity, each with its place (`key`, `column`). Empty (without the key) if there is no notice; it does not
 * filter by platform (the guide says to ignore another platform's prefix).
 */
function noticesJson(type: SpecAnnotationType): Json {
  const placed = placedTypeNotices(type);
  if (placed.length === 0) return {};
  const sorted = [...placed].sort((a, b) => compareNotices(a.notice, b.notice));
  return {
    notices: sorted.map(({ notice, key, column }) => ({
      kind: notice.kind,
      message: notice.message,
      ...(notice.since === undefined ? {} : { since: notice.since }),
      ...(notice.ref === undefined ? {} : { ref: notice.ref }),
      ...(key === undefined ? {} : { key }),
      ...(column === undefined ? {} : { column }),
    })),
  };
}

/**
 * `get_code_hints`: the calls to write on the platform, from the marking and its
 * descendants. `types` carries, per `specId/typeId`, the type's instantiation code (only
 * once); the tree carries, per annotation, only what belongs to the instance (`args`, `values`, `linked`).
 */
export async function codeHintsView(
  ctx: CodeContext,
  markingId: string,
  platformId: string,
): Promise<Json> {
  const { refs } = ctx;
  assertPlatform(refs, platformId);
  const blueprint = codeBlueprint(refs.project, markingId, platformId);
  const annotations = allAnnotations(blueprint.root);
  const unmapped = [
    ...new Set(
      annotations.filter((a) => a.symbol === null).map((a) => `${a.specId}/${a.typeId}`),
    ),
  ];
  const types: Record<string, Json> = {};
  // Type with `variants`: each annotation's resolved code goes in the tree (`code`), because
  // the `symbol`, `path`, `params` and `notes` in `types` are the base's.
  const codes = new Map<string, Json>();
  for (const a of annotations) {
    if (a.symbol === null) continue;
    const key = `${a.specId}/${a.typeId}`;
    const type = findSpecType(refs.project, { specId: a.specId, typeId: a.typeId })?.type;
    const entry = type?.code?.[platformId];
    if (!type || !entry) continue;
    if (!Object.hasOwn(types, key)) {
      types[key] = {
        name: a.type,
        ...codeEntryJson(
          entry,
          await resolveDefinition(ctx, a.specId, platformId, entry.path),
          await signatureOf(ctx, a.specId, entry),
        ),
        ...noticesJson(type),
      };
    }
    if (entry.variants !== undefined) {
      const resolved = resolveCode(entry, a.values, type.fields);
      codes.set(
        a.annotationId,
        codeEntryJson(
          resolved,
          await resolveDefinition(ctx, a.specId, platformId, resolved.path),
          await signatureOf(ctx, a.specId, resolved),
        ),
      );
    }
  }
  const rootAnchor = hintAnchor(refs, markingId);
  return {
    marking: refs.ref('m', markingId),
    platform: {
      id: blueprint.platform.id,
      name: blueprint.platform.name,
      language: blueprint.platform.language,
    },
    repos: blueprint.repo === null ? {} : { [platformId]: blueprint.repo },
    // The requested marking's effective reading direction: the platform applies it in the wrapper.
    direction: effectiveDirection(
      refs.project,
      projectIndex(refs.project).markings.get(markingId)?.containerId ?? null,
    ),
    ...(rootAnchor === null ? {} : { anchor: rootAnchor }),
    types,
    ...(unmapped.length > 0
      ? {
          unmappedTypes: unmapped,
          hint: 'types in `unmappedTypes` have no `code` on this platform in the specialization: there is no instantiation code mapped for them',
        }
      : {}),
    tree: hintNode(blueprint.root, refs, codes),
  };
}
