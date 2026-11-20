import { readFile, stat } from 'node:fs/promises';
import {
  changeImageFile,
  matchShortCode,
  packageDirOf,
  parseRef,
  prepareRevision,
  projectIndex,
  proposalDir,
  proposalImagePath,
  type ItemKind,
  type Project,
  type Proposal,
  type ReviseError,
} from '../src/model';
import type { BatchResult } from './batch';
import { prepareBatch } from './changes';
import { ToolError } from './errors';
import { assertFileSize } from './image/codecs';
import type { ImageResult, ImageSource } from './imageTools';
import {
  ACCEPTED_FORMATS,
  INVALID_REF_HINT,
  KIND_NOT_FOUND,
  KIND_WITH_ARTICLE,
  Refs,
} from './items';
import { resolveOptionalOperations } from './operationsFile';
import type { Operation } from './operations';
import { resolveProjectFile, type Roots } from './paths';
import { findProject, loadCatalog, loadProject, type ProjectLocation } from './projects';
import { toToolError } from './proposalRevise';
import { resolveProposal, type ResolvedProposal } from './proposalRefs';
import { renderContainer, renderMarking, type RenderOptions } from './renderImage';
import type { ImageServer } from './imageServer';

// The preview of `render_container` and `render_marking` (stage #2090, decisions 5 to 10): they draw
// the container or marking as it would be after a batch (`operations`/`operationsFile`), after an open
// proposal (its whole proposed state) or after a batch over that state, without writing anything. The
// previewed project is computed per call (no memo): the cost of a `plan_changes`.

export interface PreviewArgs {
  readonly ref: string;
  readonly project?: string | undefined;
  readonly proposal?: string | undefined;
  readonly operations?: readonly Operation[] | undefined;
  readonly operationsFile?: string | undefined;
}

/** Does the call carry a preview argument? (An empty inline list counts as absent, as in `revise_proposal`.) */
export function hasPreview(args: Omit<PreviewArgs, 'ref'>): boolean {
  return (
    args.proposal !== undefined ||
    (args.operations?.length ?? 0) > 0 ||
    args.operationsFile !== undefined
  );
}

type Aliases = BatchResult['aliases'];

/** What the preview draws: the previewed project and what the drawing needs to read from it. */
interface Previewed {
  readonly refs: Refs;
  /** The project the batch started from (disk, or the proposal's whole proposed state): what is not here is provisional. */
  readonly before: Project;
  readonly aliases: Aliases;
  readonly source: ImageSource;
  readonly operations: number | undefined;
  readonly proposal: string | undefined;
  readonly warning: string | undefined;
  /** Revision of the `mapping.json` that was read. */
  readonly revision: number;
}

/** The preview refusals of a proposal that cannot be drawn (decision 6), with the hint of each. */
const PREVIEW_HINTS: Partial<Record<ReviseError['code'], string>> = {
  'not-open':
    'only an open proposal can be drawn: draw without `proposal` (what was applied is in the project) or use the proposal that replaced it',
  'proposal-applied':
    'some change was already applied, so it is already in the project: draw without `proposal`',
  'proposal-not-applicable':
    'the project changed after the proposal was written and it no longer applies: draw without `proposal`, or send a new proposal with `supersedes`',
};

const projectOfRef = (ref: string): string | undefined =>
  parseRef(ref)?.project ?? undefined;

/** The project of a preview without a proposal: `project`, or the one the reference carries. */
async function locationOf(roots: Roots, args: PreviewArgs): Promise<ProjectLocation> {
  const name = args.project ?? projectOfRef(args.ref);
  if (name === undefined) {
    throw new ToolError(
      'invalid-arguments',
      args.ref.startsWith('$')
        ? 'give `project`: a `$alias` does not carry the project'
        : 'give `project`: a batch is applied to one project',
    );
  }
  return findProject(roots, name);
}

/** The package folders (`specs/<folder>`) that the proposal brings or replaces. */
function packageDirsOf(proposal: Proposal): Set<string> {
  const dirs = new Set<string>();
  for (const c of proposal.changes) {
    if (c.entity !== 'specialization' || c.kind === 'remove') continue;
    const file = (c.to as { file?: unknown } | null)?.file;
    const dir = typeof file === 'string' ? packageDirOf(file) : null;
    if (dir !== null) dirs.add(dir);
  }
  return dirs;
}

/** Where a component file is read: in the proposal folder when the proposal brings its package. */
function componentPath(proposal: Proposal) {
  const dirs = packageDirsOf(proposal);
  if (dirs.size === 0) return undefined;
  return (path: string): string => {
    const dir = packageDirOf(path);
    return dir !== null && dirs.has(dir) ? `${proposalDir(proposal.id)}/${path}` : path;
  };
}

/** Image bytes of the preview: the batch's new images, then `proposals/<id>/images/`; else the project folder. */
function imageSourceOf(
  roots: Roots,
  location: ProjectLocation,
  proposalId: string | undefined,
  batchFiles: ReadonlyMap<string, Uint8Array>,
): ImageSource {
  return async (file) => {
    const given = batchFiles.get(file);
    if (given !== undefined) return given;
    if (proposalId === undefined) return null;
    const real = await resolveProjectFile(
      roots,
      location.dir,
      proposalImagePath(proposalId, file),
    );
    if (real === null) return null;
    assertFileSize((await stat(real)).size);
    return new Uint8Array(await readFile(real));
  };
}

/** The specializations the preview brings (new or changed) that declare `fonts`: they count only once applied. */
function fontsWarning(disk: Project, previewed: Project): string | undefined {
  const brought = previewed.specializations.filter((s) => {
    if ((s.spec?.fonts?.length ?? 0) === 0) return false;
    const was = disk.specializations.find((d) => d.id === s.id);
    return (
      was === undefined ||
      (was.spec !== s.spec && JSON.stringify(was.spec) !== JSON.stringify(s.spec))
    );
  });
  if (brought.length === 0) return undefined;
  const ids = brought.map((s) => s.id).join(', ');
  return `the library ${ids} declares fonts: the preview draws its text with the fonts already in the project (or the embedded one); the library's fonts count only after it is applied`;
}

function invalidBatch(result: BatchResult): ToolError {
  return new ToolError('invalid-batch', 'the batch has errors: nothing was drawn', {
    ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    ...(result.invariantIssues.length > 0
      ? { invariantIssues: result.invariantIssues }
      : {}),
    hint: 'fix the batch with plan_changes and draw again',
  });
}

/** The whole proposed state of the proposal, refused with the codes of `revise_proposal` (decision 6). */
function proposedState(project: Project, proposal: Proposal): Project {
  const prep = prepareRevision(project, proposal, []);
  if (!prep.ok) throw toToolError(prep.error, PREVIEW_HINTS);
  return prep.proposed;
}

/** `proposal` alone: the proposal's whole proposed state, with the proposal's package components. */
async function previewProposal(
  roots: Roots,
  resolved: ResolvedProposal,
): Promise<Previewed> {
  const { location, stored } = resolved;
  const loaded = await loadProject(roots, location);
  const proposed = proposedState(loaded.project, stored.proposal);
  const catalog = await loadCatalog(
    roots,
    location.dir,
    proposed,
    componentPath(stored.proposal),
  );
  return {
    refs: new Refs({ ...loaded, project: proposed, catalog }),
    before: proposed,
    aliases: new Map(),
    source: imageSourceOf(roots, location, stored.id, new Map()),
    operations: undefined,
    proposal: resolved.refs.ref(stored.id),
    warning: fontsWarning(loaded.project, proposed),
    revision: loaded.project.revision,
  };
}

/** A batch, over the project or (with `resolved`) over the proposal's whole proposed state. */
async function previewBatch(
  roots: Roots,
  now: () => number,
  location: ProjectLocation,
  batch: readonly Operation[],
  resolved: ResolvedProposal | undefined,
): Promise<Previewed> {
  const proposal = resolved?.stored.proposal;
  const prepared = await prepareBatch(roots, location, batch, {
    now,
    ...(proposal === undefined
      ? {}
      : {
          reservedImages: new Set(
            proposal.changes.flatMap((c) => changeImageFile(c) ?? []),
          ),
          startFrom: (project: Project) => proposedState(project, proposal),
          catalogFor: (base: Project) =>
            loadCatalog(roots, location.dir, base, componentPath(proposal)),
        }),
  });
  if (!prepared.valid) throw invalidBatch(prepared.result);
  const { result } = prepared;
  return {
    refs: prepared.refs,
    before: result.before,
    aliases: result.aliases,
    source: imageSourceOf(roots, location, resolved?.stored.id, result.imageFiles),
    operations: batch.length,
    proposal: resolved?.refs.ref(resolved.stored.id),
    warning: fontsWarning(prepared.loaded.project, result.project),
    revision: prepared.loaded.project.revision,
  };
}

async function openPreview(
  roots: Roots,
  now: () => number,
  args: PreviewArgs,
): Promise<Previewed> {
  const batch = await resolveOptionalOperations(roots, args);
  const resolved =
    args.proposal === undefined
      ? undefined
      : await resolveProposal(
          roots,
          args.proposal,
          args.project ?? projectOfRef(args.ref),
        );
  if (resolved !== undefined && batch === undefined) {
    return previewProposal(roots, resolved);
  }
  const location = resolved?.location ?? (await locationOf(roots, args));
  return previewBatch(roots, now, location, batch ?? [], resolved);
}

/** The item a `$alias` names in the batch (the wrong kind and an unknown alias are refused). */
function aliasTarget(aliases: Aliases, alias: string, kind: ItemKind): string {
  const target = aliases.get(alias);
  if (target === undefined) {
    throw new ToolError(
      'unknown-alias',
      `unknown alias: ${alias} (an alias names an item that the batch creates with "as"; a proposal's items are cited by their final reference)`,
      { alias },
    );
  }
  if (target.kind !== kind) {
    throw new ToolError(
      'wrong-kind',
      `the alias ${alias} is not ${KIND_WITH_ARTICLE[kind]}`,
    );
  }
  return target.id;
}

/** The item a reference cites in the previewed project (an existing item's or a proposal's final reference). */
function citedItem(preview: Previewed, ref: string, kind: ItemKind): string {
  const parsed = parseRef(ref);
  if (parsed === null) {
    throw new ToolError('invalid-ref', `invalid reference: ${ref}`, {
      accepted: ACCEPTED_FORMATS,
      hint: INVALID_REF_HINT,
    });
  }
  if (parsed.kind !== null && parsed.kind !== kind) {
    throw new ToolError(
      'wrong-kind',
      `the reference is to ${KIND_WITH_ARTICLE[parsed.kind]}, not ${KIND_WITH_ARTICLE[kind]}`,
      { kind: parsed.kind },
    );
  }
  const found = matchShortCode(preview.refs.project, kind, parsed.code);
  if (found.length === 0) {
    throw new ToolError('not-found', `${KIND_NOT_FOUND[kind]}: ${ref}`, { ref });
  }
  if (found.length > 1) {
    throw new ToolError(
      'ambiguous-ref',
      `${found.length} items start with that code: use the full reference of one of them`,
      { ref },
    );
  }
  return found[0]!.id;
}

interface Target {
  readonly id: string;
  /** Set when the reference was a `$alias`. */
  readonly alias: string | undefined;
}

function targetOf(preview: Previewed, ref: string, kind: ItemKind): Target {
  return ref.startsWith('$')
    ? { id: aliasTarget(preview.aliases, ref, kind), alias: ref }
    : { id: citedItem(preview, ref, kind), alias: undefined };
}

/** The `preview` of the response, with the item's `alias` and `provisional` when the batch creates it. */
function withPreview(
  preview: Previewed,
  target: Target,
  kind: ItemKind,
  result: ImageResult,
): ImageResult {
  const known = projectIndex(preview.before);
  const exists = (kind === 'i' ? known.containers : known.markings).has(target.id);
  const warning = [result.json.warning, preview.warning]
    .filter((w): w is string => typeof w === 'string')
    .join('; ');
  return {
    ...result,
    json: {
      ...result.json,
      ...(target.alias === undefined ? {} : { alias: target.alias }),
      ...(exists ? {} : { provisional: true }),
      ...(warning === '' ? {} : { warning }),
      preview: {
        ...(preview.proposal === undefined ? {} : { proposal: preview.proposal }),
        ...(preview.operations === undefined ? {} : { operations: preview.operations }),
        revision: preview.revision,
      },
    },
  };
}

/** `render_container` with `proposal`, `operations` or `operationsFile`. */
export async function previewContainer(
  roots: Roots,
  now: () => number,
  args: PreviewArgs,
  options: RenderOptions,
  images: ImageServer | null,
): Promise<ImageResult> {
  const preview = await openPreview(roots, now, args);
  const target = targetOf(preview, args.ref, 'i');
  const container = projectIndex(preview.refs.project).containers.get(target.id);
  if (!container) throw new ToolError('not-found', `container not found: ${args.ref}`);
  const result = await renderContainer(
    roots,
    preview.refs,
    container,
    options,
    images,
    preview.source,
  );
  return withPreview(preview, target, 'i', result);
}

/** `render_marking` with `proposal`, `operations` or `operationsFile`. */
export async function previewMarking(
  roots: Roots,
  now: () => number,
  args: PreviewArgs,
  options: RenderOptions,
  images: ImageServer | null,
): Promise<ImageResult> {
  const preview = await openPreview(roots, now, args);
  const target = targetOf(preview, args.ref, 'm');
  const marking = drawableMarking(preview.refs, target.id, args.ref);
  const result = await renderMarking(
    roots,
    preview.refs,
    marking,
    options,
    images,
    preview.source,
  );
  return withPreview(preview, target, 'm', result);
}

/**
 * The marking a render draws: an arrow has no drawing and a canvas marking has no container (the
 * same refusals as `get_marking_image`).
 */
export function drawableMarking(refs: Refs, id: string, ref: string) {
  if (projectIndex(refs.project).arrows.has(id)) {
    throw new ToolError(
      'arrow',
      'an arrow has no image: it is a line between two markings',
      {
        hint: 'ask for the image of the source or target marking (`from`/`to` of get_marking on the arrow)',
      },
    );
  }
  const marking = projectIndex(refs.project).markings.get(id);
  if (!marking) throw new ToolError('not-found', `marking not found: ${ref}`);
  if (marking.containerId === null) {
    throw new ToolError(
      'canvas-marking',
      'a canvas marking has no image: it does not belong to a container',
      {
        hint: 'use get_container_file of the containers under it (`members` of get_marking), or get_marking_image of a marking inside a container',
      },
    );
  }
  return marking;
}
