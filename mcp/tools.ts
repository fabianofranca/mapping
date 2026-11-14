import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ModelError, projectIndex, READING_DIRECTIONS } from '../src/model';
import { planChanges } from './changes';
import { LocalFileChecker } from './codeFiles';
import { codeHintsView, type CodeContext } from './codeViews';
import { projectSignatureReader } from './signatureFiles';
import { createProjectFolder } from './createProject';
import { ToolError } from './errors';
import { DEFAULT_MAX_SIZE, MAX_MAX_SIZE, MIN_MAX_SIZE } from './image/compose';
import type { ImageServer } from './imageServer';
import { imageFile, markingImage, type ImageResult } from './imageTools';
import { MAX_ZOOM, MIN_ZOOM, renderContainer, renderMarking } from './renderImage';
import { findByCodeResult } from './findByCode';
import { Refs, resolveItem } from './items';
import { listMarkings } from './markingList';
import { modelToolError } from './modelErrors';
import { findPerspective, perspectiveDetail } from './perspectives';
import { operationSchema } from './operations';
import { resolveOperations } from './operationsFile';
import { Proposals } from './proposals';
import { Threads, resolveExtended } from './threads';
import { registerThreadTools } from './threadTools';
import { findBySourceResult, findTypesBySourceResult } from './sourceTools';
import { getComponent, listComponents } from './componentTools';
import { listPackageFiles, validateLibraryTool } from './library';
import { planLibraryUpdate } from './libraryUpdate';
import { planSignatureImportTool } from './signatureImport';
import { summary as specSummary, validateSpecialization } from './specValidation';
import type { Roots } from './paths';
import { discoverProjects, findProject, loadProject } from './projects';
import {
  annotationDetail,
  containerView,
  arrowView,
  markingView,
  projectDetail,
  projectSummary,
  specializationView,
} from './views';

type Json = Record<string, unknown>;

interface ToolResult {
  [key: string]: unknown;
  content: (
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  )[];
  isError?: boolean;
}

/**
 * Response as compact JSON, in the text only: MCP recommends repeating the structured content in
 * the text, and clients that show both would spend twice the agent's context.
 */
async function respondTo(produce: () => Promise<Json>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await produce()) }] };
  } catch (error) {
    return failure(error);
  }
}

/** Like `respondTo`, but the tool also returns an image (the text comes first: it describes the image). */
async function respondImageTo(produce: () => Promise<ImageResult>): Promise<ToolResult> {
  try {
    const { json, image } = await produce();
    return {
      content: [
        { type: 'text', text: JSON.stringify(json) },
        {
          type: 'image',
          data: Buffer.from(image.bytes).toString('base64'),
          mimeType: image.mimeType,
        },
      ],
    };
  } catch (error) {
    return failure(error);
  }
}

/** Warning for an old tool (accepted for one version): goes in `warnings`, like the batch's `deprecated-op`. */
function deprecatedTool(tool: string, use: string): Json {
  return {
    code: 'deprecated-tool',
    tool,
    message: `${tool} is deprecated: use ${use} (same arguments)`,
  };
}

/** Adds `warnings` to a response's JSON. */
function withWarnings<T extends { json: Json }>(result: T, warnings: Json[]): T {
  return { ...result, json: { ...result.json, warnings } };
}

/** A tool's error → `isError` response; only the unexpected becomes `internal-error` (with the stack on stderr). */
export function failure(error: unknown): ToolResult {
  if (error instanceof ModelError) return failure(modelToolError(error));
  if (error instanceof ToolError) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }] };
  }
  // stdout belongs to the protocol: diagnostics go to stderr.
  process.stderr.write(
    `mapping-mcp: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: {
            code: 'internal-error',
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      },
    ],
  };
}

const projectArg = z
  .string()
  .describe(
    'Project: folder name (e.g. "cadastro"), path relative to a root, or absolute path inside the roots. See list_projects.',
  );
const optionalProjectArg = projectArg
  .optional()
  .describe(
    'Project, when the reference does not carry it (`m/3f2a9c1e` or id). Without it, searches all projects in the roots.',
  );
const refArg = z
  .string()
  .describe(
    'Reference copied from the app (`mapping://project/m/3f2a9c1e`, the URL only, with the project encoded), `m/3f2a9c1e` (with `project`) or the full id.',
  );

const proposalRefArg = z
  .string()
  .describe(
    'Proposal reference (`mapping://project/p/3f2a9c1e`, the one propose_changes and list_proposals return), `p/3f2a9c1e` (with `project`) or the full id.',
  );

const operationsArg = z
  .array(operationSchema)
  .min(1)
  .max(1000)
  .describe('Operations, applied in order. See the AGENT-GUIDE.md resource.');

/**
 * Inline `operations` or `operationsFile` (decision 28): `plan_changes` and `propose_changes` accept
 * one of the two. Each is optional in the schema; `resolveOperations` refuses both together and neither.
 */
const batchOperationsArgs = {
  operations: operationsArg
    .optional()
    .describe(
      'Operations, applied in order (inline). See the AGENT-GUIDE.md resource. Use `operations` OR `operationsFile`, never both.',
    ),
  operationsFile: z
    .string()
    .optional()
    .describe(
      'Path of a `.json` inside the roots with the list of operations (the same as `operations`), for batches too large for the call (a measured screen has hundreds). Relative to a root or absolute inside one; outside the roots it is `outside-roots`, invalid JSON is `invalid-arguments` with the position. Both together, or neither, is `invalid-arguments`.',
    ),
};

const maxSizeArg = z
  .number()
  .int()
  .min(MIN_MAX_SIZE)
  .max(MAX_MAX_SIZE)
  .optional()
  .describe(
    `Longest side of the returned image, in pixels (default ${DEFAULT_MAX_SIZE}; never enlarges). The larger it is, the more context the agent spends.`,
  );
const formatArg = z
  .enum(['png', 'jpeg', 'webp'])
  .optional()
  .describe(
    'Format of the returned image. Default: jpeg if the original file is JPEG, otherwise png (lossless, good for screens and text).',
  );

const platformArg = z
  .string()
  .describe(
    'Id of the code platform (the target you write the solution in) declared by the applied specializations (see `platforms` in get_project).',
  );

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/** Views that resolve the `path` of `code`: the client's `workDir` limits the check of local files. */
function codeContext(roots: Roots, refs: Refs): CodeContext {
  return {
    refs,
    files: new LocalFileChecker(roots.workDir),
    signatures: projectSignatureReader(roots, refs),
  };
}

export function registerTools(
  server: McpServer,
  roots: Roots,
  images: ImageServer | null = null,
): void {
  // Each tool call starts with the roots reset: their `realpath` and the discovery of projects
  // are done once per call (`Roots.beginCall`).
  const respond = (produce: () => Promise<Json>) =>
    respondTo(() => {
      roots.beginCall();
      return produce();
    });
  const respondWithImage = (produce: () => Promise<ImageResult>) =>
    respondImageTo(() => {
      roots.beginCall();
      return produce();
    });

  server.registerTool(
    'list_projects',
    {
      description:
        'Lists the Mapping projects (folders with mapping.json) found in the configured roots: name, path, counts and applied specializations.',
      annotations: READ_ONLY,
    },
    () =>
      respond(async () => {
        const locations = await discoverProjects(roots);
        const reals = await roots.realRoots();
        const projects = await Promise.all(
          locations.map(async (location) => {
            try {
              return projectSummary(
                await loadProject(roots, location, undefined, { fonts: false }),
              );
            } catch (error) {
              if (!(error instanceof ToolError)) throw error;
              // An unreadable project does not hide the others: it shows up with the reason.
              return {
                name: location.name,
                path: location.path,
                dir: location.dir,
                root: location.root,
                error: error.toJSON().error,
              };
            }
          }),
        );
        return {
          roots: roots.roots,
          missingRoots: roots.roots.filter((_, i) => reals[i] === null),
          projects,
        };
      }),
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Creates an empty Mapping project (mapping.json and .gitignore; images/ is created with the first image applied) in a folder inside a root, already with the notes library applied (the `Notas` layer and specs/notas/; `notes: false` skips it). The folder name becomes the <project> of the references.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Folder to create: relative to a root (e.g. "cadastro") or absolute inside one.',
          ),
        name: z.string().describe('Name of the project (shown in the app).'),
        root: z
          .string()
          .optional()
          .describe(
            'Root to create in, when there is more than one and `path` is relative: one of the `roots` of list_projects, the path as it is in `--root` (relative to the client\'s working directory, e.g. "design/mapeamentos") or the name of the root folder, if only one root has it. With an absolute `path`, it must be inside this root.',
          ),
        firstLayerName: z
          .string()
          .optional()
          .describe('Name of the first layer (default: "Camada 1").'),
        notes: z
          .boolean()
          .optional()
          .describe(
            'Applies the bundled notes library (floating post-its: the `Notas` layer and the specs/notas/ folder). Default: true; false creates the project without it.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) =>
      respond(async () => {
        const created = await createProjectFolder(roots, args);
        const loaded = await loadProject(roots, await findProject(roots, created.dir));
        return { created: true, ...projectSummary(loaded) };
      }),
  );

  server.registerTool(
    'get_project',
    {
      description:
        "Project summary: containers (with `file`, `background` and `parent`), layers, specializations (with the state of the copy), code platforms (`platforms`, each with the `repos` the specializations declare and the `localPath` of the local clone; with `codeHint`: the `code` of the types is the instantiation code, not the generated code), the local clone per platform (`platformRepos`), the specializations' document repositories (`docRepos`: `id`, the `repos` each specialization declares and the `localPath` of the project's clone, `null` without a clone), the project's drawing mode (`drawingMode`, `null` without a mode; each container carries its own pinned `drawingMode` and the `effectiveDrawingMode`), the project's reading direction (`direction`: `ltr` or `rtl`, `ltr` when none is saved; each container carries its own pinned `direction`, `null` = follows the project, and the `effectiveDirection`), counts (`counts`: containers, markings, `canvasMarkings`, `floatingMarkings`, `arrows`, annotations, layers) and pending items (incomplete annotations).",
      inputSchema: { project: projectArg },
      annotations: READ_ONLY,
    },
    ({ project }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        return projectDetail(new Refs(loaded));
      }),
  );

  server.registerTool(
    'get_perspective',
    {
      description:
        'A perspective of the project (a crop per audience: which roots appear, where they sit on the canvas and which layers are hidden): `roots` (canvas root = container without a parent, canvas marking or floating one, with `ref`, `kind`, `name` and the top-left `x`/`y` position, in canvas units) and `hiddenLayers`. `id` accepts the id (see `perspectives` in get_project) or the name. Read-only: the server does not create or change perspectives (always propose in the Main one). The Main perspective (the whole project) is not a saved perspective, and the "Only me" ones stay in the browser.',
      inputSchema: {
        project: projectArg,
        id: z.string().min(1).describe('Id or name of the perspective; see get_project.'),
      },
      annotations: READ_ONLY,
    },
    ({ project, id }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        const refs = new Refs(loaded);
        return perspectiveDetail(refs, findPerspective(refs.project, id));
      }),
  );

  server.registerTool(
    'list_markings',
    {
      description:
        "Lists markings in compact rows (reference, path, `space` (`container` or `canvas`), `floating`, rectangle in container pixels (on the canvas, in canvas units), lock, annotations, `effectiveDrawingMode`: the drawing mode that applies in the marking's space). Without `container` or `canvas`, lists the markings of the containers. The filters combine; those for layer, type and incomplete apply to the same own annotation of the marking (inherited ones do not count).",
      inputSchema: {
        project: projectArg,
        container: z
          .string()
          .optional()
          .describe('Only this container: reference, id, name or file name.'),
        image: z
          .string()
          .optional()
          .describe('Old: use `container`. Accepted with a warning.'),
        canvas: z
          .boolean()
          .optional()
          .describe(
            '`true`: only the canvas markings (no container; `space: "canvas"`), in depth. Does not combine with `container`.',
          ),
        floating: z
          .boolean()
          .optional()
          .describe(
            'Only the floating ones (`true`, which live on the canvas) or only the non-floating ones (`false`).',
          ),
        layer: z
          .string()
          .optional()
          .describe('Only markings with an annotation in this layer (id or name).'),
        annotationType: z
          .string()
          .optional()
          .describe(
            'Only markings with an annotation of this type: typeId, specId/typeId or type name.',
          ),
        incomplete: z
          .boolean()
          .optional()
          .describe(
            'Only markings with an incomplete annotation (empty required field, broken reference…).',
          ),
        text: z
          .string()
          .optional()
          .describe(
            'Text in the marking name or in the name, keys and values of the annotations (accent- and case-insensitive).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('Rows per page (default 100).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('How many rows to skip (pagination).'),
      },
      annotations: READ_ONLY,
    },
    ({ project, ...filters }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        return listMarkings(new Refs(loaded), filters);
      }),
  );

  server.registerTool(
    'get_marking',
    {
      description:
        'Everything about a marking (or an arrow): path (for a canvas marking it starts with "Canvas"), container (`null` on the canvas), `space` (`container` or `canvas`), `floating`, rectangle (container pixels; on the canvas, canvas units), lock, children, `members` (the markings and containers that have this marking as their parent, by geometry), `arrows` (the arrows attached to it), `anchor` (the marking this one is anchored to, with `to` as a reference, `side`, `align` and `offset` when declared; `null` without an anchor) and `anchoredBy` (the references of the markings anchored to this one), annotations per layer (own and inherited, with the origin), link tree, resolved outgoing references (`refs`, each with a 0-based `row` and the `column` of a cell, or `null` for a field; `field` is the 1-based text to read), backlinks (`backlinks`: one entry per source annotation, with `fields`) and pending items. ' +
        "On typed annotations, `code` carries the type's instantiation code per platform: `symbol` (what you call to create an instance), `definition` (the file that defines the `symbol`, to read the signature: `path`, `url` and `ref` of the specialization's `repo`, `localFile` relative to the client's working directory and `exists` per the project's local clone; `null` without `path`), `params`, `values` and `notes`. The server only checks whether the file exists: it never reads code.",
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        platform: platformArg
          .optional()
          .describe(
            'Only the `code` of this platform (e.g. the one you will write the solution in).',
          ),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, platform }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        const arrow = projectIndex(item.refs.project).arrows.get(item.id);
        if (arrow) return arrowView(codeContext(roots, item.refs), arrow, platform);
        const marking = projectIndex(item.refs.project).markings.get(item.id);
        if (!marking) throw new ToolError('not-found', `marking not found: ${ref}`);
        return markingView(codeContext(roots, item.refs), marking, platform);
      }),
  );

  server.registerTool(
    'get_code_hints',
    {
      description:
        "The calls to write on a platform from a marking, with the instantiation code of each type. `types` carries, per `specId/typeId`, the `symbol` (what you call to create an instance), the `definition` (the file that defines it, to read the signature: `path`, `url` and `ref` of the specialization's `repo`, `localFile` and `exists` per the local clone), `params`, `values` and `notes`. `repos` carries the platform's repository (`url`, `ref`, `localPath`). `anchor` (`marking`, `side`, `align`: only when the marking is anchored, also on the `tree` node) gives the target marking and the effective side and alignment (the declared ones or the component's), to position the anchored element (tooltip, badge, menu) relative to the target on the platform. `direction` (`ltr` or `rtl`) is the effective reading direction of the marking's container (also on each `tree` node): there is no parameter in `code`; write the platform's wrapper (Compose: `CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl)`; web: `dir=\"rtl\"`). The `tree` mirrors the marking and its descendants and, on each typed annotation, carries `type` (the key of `types`), `label`, `layer`, `args` (the call's arguments, with the instance's values already translated), `values` (resolved reference values, e.g. `User.name`) and the linked events under the owner (`linked`), with no file per annotation. " +
        "Specialization 9: `types` carries the base's raw `code` (it may have `variants`) and, on annotations of types with `variants`, the `tree` carries `code` with the variant's resolved code (`symbol`, `definition`, `params`, `values`, `notes`, without `variants`; the `symbol` of an `outlined` Button is that of the `outlined` case): when the annotation has `code`, use it in place of the one in `types`. " +
        'On each type in `types`, `notices` (only when there are any) carries the fidelity notices of the specialization, the type, the fields and the columns, by severity: `kind`, `message`, `since?`, `ref?` (the origin) and the place (`key?`, `column?`). Read them before writing and tell the user about the `diverges` ones; ignore those whose `message` starts with the id of another platform (there is no per-platform filter). ' +
        'Types in `unmappedTypes` have no instantiation code on this platform and carry no notices (see `get_specialization`).',
      inputSchema: { ref: refArg, platform: platformArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, platform, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'm');
        return codeHintsView(codeContext(roots, item.refs), item.id, platform);
      }),
  );

  server.registerTool(
    'find_by_code',
    {
      description:
        "From code to mapping (which types are instantiated with this file or symbol, and where they are marked): the types of the applied specializations whose `code` points to a file (`code.<platform>.path`) and/or symbol (`code.<platform>.symbol`), with the annotations of those types. `path` matches the whole path or the last segments (`DSButton.kt` matches `app/…/DSButton.kt`; `Button.kt` does not); `symbol` matches by equality; with both, the same platform must match both. Without `project`, searches all projects in the roots. In specialization 9 (`variants`), the search compares against each annotation's resolved code: the base symbol only brings the base annotations and a variant's only its own; `path` brings all those that point to the file. Returns the project (`project`, the folder name, and `path`, its path as in list_projects), the type, the raw `code` (`symbol` and `definition`, with `variants`) of the platforms that matched and the `mapping://` references of the annotation, the marking and the container. Does not open code files.",
      inputSchema: {
        project: projectArg
          .optional()
          .describe('Project to search in. Without it, searches all those in the roots.'),
        path: z
          .string()
          .optional()
          .describe(
            'File: whole path (relative to the repository root) or only the end by whole segments (e.g. "DSButton.kt").',
          ),
        symbol: z
          .string()
          .optional()
          .describe("Exact symbol of the type's `code` (class, component or function)."),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findByCodeResult(roots, args)),
  );

  server.registerTool(
    'get_annotation',
    {
      description:
        "An annotation (free-form or typed): content, layer, marking, owner and linked ones, resolved outgoing references (`refs`, with a 0-based `row` and the `column`), backlinks (one entry per source, with `fields`) and pending items. A linked annotation carries the role it holds in the owner (`parentRole` and `roleName`); an owner whose type declares roles carries `linkedByRole` (`label`, `roles` with the children of each role in the type's order and `unassigned`: those without a role or with a role the owner does not offer, which are `missing-role` / `unknown-role` pending items). To find an owner's children read `linkedByRole` (or `linked`), not the raw `allowedChildren` list.",
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const item = await resolveItem(roots, ref, project, 'a');
        const annotation = projectIndex(item.refs.project).annotations.get(item.id);
        if (!annotation) throw new ToolError('not-found', `annotation not found: ${ref}`);
        return annotationDetail(codeContext(roots, item.refs), annotation);
      }),
  );

  const containerOf = async (ref: string, project: string | undefined) => {
    const item = await resolveItem(roots, ref, project, 'i');
    const container = projectIndex(item.refs.project).containers.get(item.id);
    if (!container) throw new ToolError('not-found', `container not found: ${ref}`);
    return { item, container };
  };

  server.registerTool(
    'get_container',
    {
      description:
        'A container of the project (the reference `mapping://<project>/i/<code>`: the letter `i` is the container): `file` (image file, or `null`) and `background` (color, when there is no file), absolute path of the file (if it exists), dimensions, position, lock, `drawingMode` (the drawing mode the container pins, `null` = follows the project), `effectiveDrawingMode` (the one that applies to it), `direction` (the reading direction the container pins, `ltr` or `rtl`; `null` = follows the project), `effectiveDirection` (the one that applies to it), `parent` (the canvas marking that contains the container, or `null`) and the first-level markings.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const { item, container } = await containerOf(ref, project);
        return containerView(roots, item.refs, container);
      }),
  );

  server.registerTool(
    'get_image',
    {
      description:
        'Old (accepted with a warning for one version): use get_container, which returns the same.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const { item, container } = await containerOf(ref, project);
        return {
          ...(await containerView(roots, item.refs, container)),
          warnings: [deprecatedTool('get_image', 'get_container')],
        };
      }),
  );

  server.registerTool(
    'resolve',
    {
      description:
        'Finds out what a reference designates (marking, container or annotation; the letter `i` of the reference is the container; also layer `…/l/…`, conversation `…/c/…` and, inside an annotation, field `…/a/<code>/f/<field>`, entry `…/a/<code>/e/<code>` and row `…/a/<code>/f/<field>/r/<code>`) and returns the reference (the URL only), the kind (`marking`, `arrow`, `container`, `annotation`, `layer`, `thread`, `field`, `entry` or `row`) and the identification fields (id, project, name, container or marking/layer, rect; for field, entry and row, `annotation`, `key` and `value`), without the readable path; for the readable path use get_marking, get_container or get_annotation. Use before get_* when you do not know the kind.',
      inputSchema: { ref: refArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) =>
      respond(async () => {
        const extended = await resolveExtended(roots, ref, project, resolveItem);
        if (extended) return extended;
        const item = await resolveItem(roots, ref, project);
        const index = projectIndex(item.refs.project);
        const { refs } = item;
        const arrow = item.kind === 'm' ? index.arrows.get(item.id) : undefined;
        const base = {
          kind: arrow
            ? 'arrow'
            : { m: 'marking', i: 'container', a: 'annotation' }[item.kind],
          ref: refs.ref(item.kind, item.id),
          id: item.id,
          project: { name: refs.projectName, path: item.loaded.location.path },
        };
        if (arrow) {
          return {
            ...base,
            name: arrow.name,
            from: refs.ref('m', arrow.from),
            to: refs.ref('m', arrow.to),
            style: arrow.style,
          };
        }
        if (item.kind === 'm') {
          const marking = index.markings.get(item.id)!;
          return {
            ...base,
            name: marking.name,
            container:
              marking.containerId === null ? null : refs.ref('i', marking.containerId),
            rect: marking.rect,
          };
        }
        if (item.kind === 'i') {
          const container = index.containers.get(item.id)!;
          return {
            ...base,
            name: container.name,
            file: container.file,
            background: container.background,
          };
        }
        const annotation = index.annotations.get(item.id)!;
        return {
          ...base,
          marking: refs.ref('m', annotation.markingId),
          layer: index.layers.get(annotation.layerId)?.name ?? annotation.layerId,
        };
      }),
  );

  server.registerTool(
    'get_specialization',
    {
      description:
        "The full JSON of a specialization applied to the project (layers, types, fields, descriptions and guidance, and the code platforms with each one's `repo`; with platforms, `codeHint` says what the `code` of the types is (the instantiation code: `symbol` is what you call to create an instance, `path` the file that defines it, to read the signature)), to learn the annotation types before reading or writing typed annotations. In formatVersion 4 it also carries `component`, `doc`, `examples`, `fonts`, `origins` and `migrations` and, when the copy is a package, `package: { dir, files }` (see list_components and get_component to read the components). In formatVersion 10 the `table` types, fields and columns may carry `notices` (notices `{ kind, message, since?, ref? }`, with `kind` `removed`, `deprecated`, `diverges` or `pending`): read them before creating an annotation or saving a value; a notice only informs and blocks nothing, but do not use anything `removed` or `deprecated` without telling the user. In formatVersion 11 the JSON comes as it is: `allowedChildren` may mix type ids and CLAUSES `{ layer, groups? }` (the whole layer, or only the types of the listed groups; the types an owner accepts are the union, in order; the server already resolves this for you in the views and in validation, so do not build the list by hand), layers declare `groups` and types say which ones they belong to, `childRoles` (+ `childRolesLabel`) on the owner list the ROLES in which a child links to it (use `role` in create_annotation/update_annotation) and `docRepos` + the `doc` object `{ repo, path }` point to the type's document in an external repository (get_component reads it through the project's clone). In formatVersion 12 `migrations` gains the role steps `rename-role` (`type`, `from`, `to`), `remove-role` (`type`, `role`, `mode`: `clear` or `unlink`) and `set-role` (`type`, `role`, `childType`?): renaming or removing a role from `childRoles`, or giving roles to a type that had none, is a BREAKING change of the version contract and requires the step; a role step in a version before 12 is an error (`only allowed with formatVersion 12`).",
      inputSchema: {
        project: projectArg,
        specId: z
          .string()
          .describe('Id of the specialization (e.g. "sdui"); see get_project.'),
      },
      annotations: READ_ONLY,
    },
    ({ project, specId }) =>
      respond(async () => {
        const loaded = await loadProject(roots, await findProject(roots, project));
        const view = specializationView(new Refs(loaded), specId);
        // Applied v4 package: the list of the files in the `specs/<id>/` folder (the app's copy).
        const pkg = await listPackageFiles(roots, loaded.location.dir, String(view.file));
        return pkg === null ? view : { ...view, package: pkg };
      }),
  );

  /** The container marking of an `m` reference (an arrow and a canvas marking have no image). */
  const imageMarkingOf = async (ref: string, project: string | undefined) => {
    const item = await resolveItem(roots, ref, project, 'm');
    if (projectIndex(item.refs.project).arrows.has(item.id)) {
      throw new ToolError(
        'arrow',
        'an arrow has no image: it is a line between two markings',
        {
          hint: 'ask for the image of the source or target marking (`from`/`to` of get_marking on the arrow)',
        },
      );
    }
    const marking = projectIndex(item.refs.project).markings.get(item.id);
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
    return { item, marking };
  };

  server.registerTool(
    'get_marking_image',
    {
      description:
        'Returns, as an image, the crop of a container marking (a canvas marking and an arrow fail with `canvas-marking` and `arrow`; mode "crop", with optional `padding` in container pixels) or the whole container with the marking outlined in magenta (mode "context"). With `outlineChildren`, outlines the direct children in different colors and the response carries the legend color → name → reference. The response text says the region shown, the scale and where the marking ended up in the returned image. In a container without a file (background only), the crop shows the drawing of the components (`drawing: "rendered"`, the same as render_container: real text, shadow, dashes and icons). The response carries `url` (local HTTP, only on this computer, valid while this server runs) and `markdown`: paste the `markdown` in the reply when the client does not show the `image` content in the chat (e.g. Cursor).',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        padding: z
          .number()
          .int()
          .min(0)
          .max(4096)
          .optional()
          .describe(
            'Margin around the marking, in container pixels (default 0; limited to its edges). Only in "crop" mode.',
          ),
        mode: z
          .enum(['crop', 'context'])
          .optional()
          .describe(
            '"crop" (default): only the crop. "context": the whole container with the marking highlighted.',
          ),
        outlineChildren: z
          .boolean()
          .optional()
          .describe(
            'Outlines the child markings in different colors and returns the legend as text.',
          ),
        maxSize: maxSizeArg,
        format: formatArg,
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const { item, marking } = await imageMarkingOf(ref, project);
        return markingImage(roots, item.refs, marking, options, images);
      }),
  );

  server.registerTool(
    'get_container_file',
    {
      description:
        'Returns the whole image of a container that has a file, scaled down if the longest side exceeds `maxSize`. On a container with only a background (no file) it fails with `container-without-file`: use get_marking_image. To see just one marking, use get_marking_image. The response carries `url` (local HTTP, only on this computer, valid while this server runs) and `markdown`: paste the `markdown` in the reply when the client does not show the `image` content in the chat (e.g. Cursor).',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        maxSize: maxSizeArg,
        format: formatArg,
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const { item, container } = await containerOf(ref, project);
        return imageFile(roots, item.refs, container, options, images);
      }),
  );

  const zoomArg = z
    .number()
    .min(MIN_ZOOM)
    .max(MAX_ZOOM)
    .optional()
    .describe(
      `Magnification of the drawing (default 1 = one container pixel per output pixel; from ${MIN_ZOOM} to ${MAX_ZOOM}). Above the image pixel limit the tool fails with \`image-too-large\`, like get_marking_image.`,
    );
  const drawingModeArg = z
    .string()
    .optional()
    .describe(
      'Drawing mode (one of the `modes` of the `tokens` of the applied specializations, such as "light" or "dark") across the whole drawing. Default: each container\'s effective mode (the one it pins, otherwise the project\'s, otherwise the first mode).',
    );
  const directionArg = z
    .enum(READING_DIRECTIONS)
    .optional()
    .describe(
      "Reading direction (`ltr` or `rtl`) across the whole drawing: in `rtl` the rows, grids and `start`/`end` positions mirror, as in the app with the container set to Right to left. Default: each container's effective direction (the one it pins, otherwise the project's, otherwise `ltr`). The result carries the `direction` used (`null` = each container's own).",
    );
  const backgroundArg = z
    .enum(['image', 'none'])
    .optional()
    .describe(
      '"image" (default): paints the container\'s file underneath (without a file, its background color); "none": transparent background, only the drawing of the components (png or webp).',
    );
  const RENDER_NOTE =
    "The drawing is the server's, with real text (bundled free font, or the library's `fonts` when declared), stroke with `align`/`cap`/`join`/`sides`/dashes, blurred shadow and icons; the gradient takes the first color and the remote image becomes a placeholder. It is not a capture of the app. The response carries `url` (local HTTP, only on this computer, valid while this server runs) and `markdown`: paste the `markdown` in the reply when the client does not show the `image` content in the chat.";

  server.registerTool(
    'render_marking',
    {
      description:
        "Draws, as a PNG image, the component of a container marking and that of its whole subtree (the children), with `zoom`, `drawingMode`, `direction` and `background`. This is how the agent checks a component's drawing without opening the app. " +
        RENDER_NOTE,
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        zoom: zoomArg,
        drawingMode: drawingModeArg,
        direction: directionArg,
        background: backgroundArg,
        padding: z
          .number()
          .int()
          .min(0)
          .max(4096)
          .optional()
          .describe('Margin around the marking, in container pixels (default 0).'),
        format: z.enum(['png', 'webp', 'jpeg']).optional().describe('Default png.'),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const { item, marking } = await imageMarkingOf(ref, project);
        return renderMarking(roots, item.refs, marking, options, images);
      }),
  );

  server.registerTool(
    'render_container',
    {
      description:
        'Draws, as a PNG image, the components of all the markings of a container (with or without a file), with `zoom`, `drawingMode`, `direction` and `background`. On a container without a file it is the same drawing get_marking_image shows. ' +
        RENDER_NOTE,
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        zoom: zoomArg,
        drawingMode: drawingModeArg,
        direction: directionArg,
        background: backgroundArg,
        format: z.enum(['png', 'webp', 'jpeg']).optional().describe('Default png.'),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const { item, container } = await containerOf(ref, project);
        return renderContainer(roots, item.refs, container, options, images);
      }),
  );

  server.registerTool(
    'get_image_file',
    {
      description:
        'Old (accepted with a warning for one version): use get_container_file, which returns the same.',
      inputSchema: {
        ref: refArg,
        project: optionalProjectArg,
        maxSize: maxSizeArg,
        format: formatArg,
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) =>
      respondWithImage(async () => {
        const { item, container } = await containerOf(ref, project);
        return withWarnings(
          await imageFile(roots, item.refs, container, options, images),
          [deprecatedTool('get_image_file', 'get_container_file')],
        );
      }),
  );

  server.registerTool(
    'plan_changes',
    {
      description:
        'Preview of a batch of changes: validates against the Mapping rules and returns whether it is valid, the errors per operation, a readable summary, the counts, the new pending items (`issues`), the new specialization notices (`notices.new`: the type, field or column notices that the created or changed annotations come to have; a notice blocks nothing), the references of the items that will be created and how many changes the user would have to review. It does NOT write anything (not even a proposal). ' +
        'The operations are applied in order; a created item can be cited in the following ones by its `as` alias (e.g. "$door"). Locked items cannot be moved, resized or deleted. The rectangle does not follow the content on its own: after changing a value that alters it (text, a field that turns a part on or off) in a component whose `sizing` is `hug` or an expression, include `fit_marking` on the same marking. A marking with `anchor` (`create_marking`/`update_marking`) is only linked to the target: to snap it against the target (after anchoring it or changing its size) include `snap_to_anchor`; moving the target already carries the anchored ones along. To send the change to the user, use propose_changes (the agent never writes the project directly).',
      inputSchema: {
        project: projectArg,
        ...batchOperationsArgs,
      },
      annotations: READ_ONLY,
    },
    ({ project, ...args }) =>
      respond(async () =>
        planChanges(
          roots,
          await findProject(roots, project),
          await resolveOperations(roots, args),
          Date.now,
        ),
      ),
  );

  const clientName = () => server.server.getClientVersion()?.name;
  const threads = new Threads(roots, Date.now, clientName);
  const proposals = new Proposals(roots, Date.now, clientName, threads);
  registerThreadTools(server, {
    threads,
    respond,
    projectArg,
    optionalProjectArg,
  });

  server.registerTool(
    'propose_changes',
    {
      description:
        'Sends a change to the user as a PROPOSAL for review: validates the batch like plan_changes, computes the changes (creations, field-by-field alterations, removals) and writes `proposals/<id>/proposal.json` (new images in `proposals/<id>/images/`). The `mapping.json` is NOT changed: the user reviews in the app, accepts or rejects at any level (proposal, container, item, change), leaves notes and applies what they accepted. ' +
        'Returns the reference `mapping://<project>/p/<code>`, a summary per level and the final references of the created items, with the new pending items (`issues`) and the new specialization notices (`notices.new`, as in plan_changes; a notice does not block the proposal). Then, tell the user and wait for the review to finish (get_proposal: nothing pending or accepted without being applied); read the result with get_proposal_review and, to correct it, use revise_proposal on the same proposal (while nothing has been applied) or, afterwards, send another proposal with `supersedes` containing only the corrections. Re-exports: use `source` on containers and markings and find_by_source to propose only what changed.',
      inputSchema: {
        project: projectArg,
        title: z
          .string()
          .describe("Title of the proposal (shown in the app's Proposals window)."),
        description: z
          .string()
          .optional()
          .describe('Description: what the proposal does and why.'),
        origin: z
          .string()
          .optional()
          .describe(
            'Where the data came from (free text, e.g. "Figma: Loja v3 › Checkout").',
          ),
        author: z
          .string()
          .optional()
          .describe(
            'Who is sending (default: the name of the MCP client, e.g. the agent).',
          ),
        supersedes: z
          .string()
          .optional()
          .describe(
            'Proposal that this one replaces (reference `mapping://project/p/code`, `p/code` or id). The previous one becomes `superseded` (decisions and notes stay saved). If its review had not finished, the response carries a warning.',
          ),
        thread: z
          .string()
          .optional()
          .describe(
            'Conversation to link the proposal to (reference `mapping://project/c/code` from list_threads or open_thread). The tool checks the conversation BEFORE writing (nonexistent or resolved: it refuses and writes nothing) and, once the proposal is written, adds to the conversation a message of its own with the proposal, which the app shows as a card with the Review button. The proposal format does not change.',
          ),
        ...batchOperationsArgs,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ operations: inline, operationsFile, ...args }) =>
      respond(async () =>
        proposals.propose({
          ...args,
          operations: await resolveOperations(roots, {
            operations: inline,
            operationsFile,
          }),
        }),
      ),
  );

  server.registerTool(
    'revise_proposal',
    {
      description:
        'Corrects an OPEN proposal in place (same reference), without the user losing what they have already decided. Use it when they rejected changes (and left notes) or when you want to add or remove changes and NOTHING in the proposal has been applied yet (`revisable: true` in get_proposal_review). If any change has already been applied, the proposal was superseded or withdrawn, or the batch carries a library package, use propose_changes with `supersedes`. ' +
        '`drop`: change ids (`c3`, as get_proposal shows) to remove, along with what depends on them (removing the creation of an item removes its annotations and children). `operations`: the propose_changes vocabulary, applied to the WHOLE PROPOSED STATE (the current project with all the proposal\'s changes, even the rejected ones, after the `drop`); an item the proposal creates is cited by its final reference and can be edited. Each change ends up: untouched (identical, with the decision and notes), replaced (same id, new value, goes back to undecided and gets the "Revised" mark), new (new id, undecided) or removed (it leaves; its note moves up to the proposal). ' +
        'FROZEN: a change the user accepted is neither replaced nor removed; if the batch would hit it, nothing is written (`change-frozen`). `dryRun: true` returns the result without writing. The mapping.json is never changed. Then tell the user and wait for the review to finish.',
      inputSchema: {
        ref: proposalRefArg,
        project: optionalProjectArg,
        drop: z
          .array(z.string())
          .optional()
          .describe('Ids of the changes to remove (`c3`), as get_proposal shows.'),
        operations: z
          .array(operationSchema)
          .max(1000)
          .optional()
          .describe(
            'Batch applied to the whole proposed state, with propose_changes validation (`$name` aliases work). A new or replaced library package does not fit here.',
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe('Only computes and returns the result, without writing.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ ref, project, ...args }) => respond(() => proposals.revise(ref, project, args)),
  );

  server.registerTool(
    'list_proposals',
    {
      description:
        "Lists the project's proposals (open and closed): reference, title, origin, author, date, status, review progress (pending, accepted without being applied, rejected, applied), conflicts and the supersede relation.",
      inputSchema: {
        project: projectArg,
        status: z
          .enum(['open', 'applied', 'superseded', 'withdrawn'])
          .optional()
          .describe('Only the proposals in this status.'),
      },
      annotations: READ_ONLY,
    },
    ({ project, status }) => respond(() => proposals.list(project, status)),
  );

  server.registerTool(
    'get_proposal',
    {
      description:
        'A proposal: review progress (`progress.complete` = nothing pending or accepted without being applied), summary per level (Project and containers), the changes with the state of each one (pending, accepted, rejected, applied), conflicts (the project changed after the proposal), locked-item warning and the notes. Use it to know whether the review has finished.',
      inputSchema: {
        ref: proposalRefArg,
        project: optionalProjectArg,
        state: z
          .enum(['pending', 'accepted', 'rejected', 'applied', 'conflict'])
          .optional()
          .describe(
            'Only the changes in this state (`conflict` = current value differs from the before).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Changes per page (default 200).'),
        offset: z.number().int().min(0).optional().describe('How many changes to skip.'),
      },
      annotations: READ_ONLY,
    },
    ({ ref, project, ...options }) => respond(() => proposals.get(ref, project, options)),
  );

  server.registerTool(
    'get_proposal_review',
    {
      description:
        "The result of the review, only what matters for the next round: the rejected changes (with the target, before/after and the user's notes), the general notes (proposal, project, container, item), the conflicts and whether the review has finished (`ready`). Fix only that: with `revisable: true`, use revise_proposal on the same proposal; otherwise send propose_changes with `supersedes`. `awaitingUser` are the changes you replaced or added that are still waiting for the user (they are not rejected).",
      inputSchema: { ref: proposalRefArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) => respond(() => proposals.review(ref, project)),
  );

  server.registerTool(
    'withdraw_proposal',
    {
      description:
        'Withdraws an open proposal (status `withdrawn`): nothing more from it will be applied; what has already been applied stays in the project. The files stay in proposals/ for history.',
      inputSchema: { ref: proposalRefArg, project: optionalProjectArg },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ ref, project }) => respond(() => proposals.withdraw(ref, project)),
  );

  server.registerTool(
    'find_by_source',
    {
      description:
        'Finds the containers and markings whose origin (`source`) is `system` + `id` (exact comparison), so a re-export can match the elements that already exist instead of duplicating them. Without `project`, searches all projects in the roots. Also lists (`proposed`) the still-open proposals that create an element with that origin.',
      inputSchema: {
        project: projectArg
          .optional()
          .describe('Project to search in. Without it, searches all those in the roots.'),
        system: z.string().describe('Sistema de origem (ex: "figma").'),
        id: z.string().describe('Id do elemento no sistema de origem.'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findBySourceResult(roots, args)),
  );

  server.registerTool(
    'find_types_by_source',
    {
      description:
        'From the source element to the annotation type: the types of the specializations applied to the project whose `sources` declares the element (e.g. the Figma component `DS/Button`), by `id` (stronger) and/or by `name`. Each type comes with the fields that have a source property of the system (and how the values translate), so you can fill in `values` without deducing from the name.',
      inputSchema: {
        project: projectArg,
        system: z.string().describe('Sistema de origem (ex: "figma").'),
        id: z
          .string()
          .optional()
          .describe('Id do elemento (ou do componente) na origem.'),
        name: z
          .string()
          .optional()
          .describe('Nome do elemento na origem (ex: "DS/Button").'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => findTypesBySourceResult(roots, args)),
  );

  server.registerTool(
    'validate_specialization',
    {
      description:
        "Validates a specialization file (`path`, inside the roots) or a JSON text (`text`), without applying it to any project (formatVersion 12 accepts the role steps `rename-role`, `remove-role` and `set-role` in `migrations`). Accepts any formatVersion from 1 to 12, but validates only the FILE (for the whole package use validate_library). Returns the SAME errors as the app's import, each with the exact path (e.g. `layers[0].annotationTypes[2].fields[1].sources[0].values.Primary: …`), and warnings that do not prevent the import (`unused-platform`: platform declared and not used; `type-without-code`: type without `code`; `path-without-repo`: `path` on a platform without `repo`; `legacy-format`: old `format`; `ignored-field`: field that left the format; `many-children-ids`: `allowedChildren` with many ids in text; `unused-group`: group that no type of the layer uses; `unused-doc-repo`: `docRepos` repository that no `doc` uses). It is the generate, validate, fix cycle.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            'Specialization file (JSON), relative to a root or absolute inside them.',
          ),
        text: z.string().optional().describe('The JSON content of the specialization.'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => validateSpecialization(roots, args)),
  );

  server.registerTool(
    'validate_library',
    {
      description:
        'Validates the PACKAGE of a library (formatVersion 4 specialization with `components/`, `docs/`, `examples/` and `fonts/`) with the same three levels as the app and the skill: (1) each file (including the icon set pointed to by `icons`, formatVersion 15), (2) the coherence between them (component, slot, fields, examples, fonts, origins, literal icon name outside the set and, with `previous`, the version contract) and (3) the drawing proof (instantiates each component and runs the external-system examples through the declaration; warns about an `enum` field read by the `name` of an `icon` node with an option outside the icon set). `path` is the package folder or the specialization file inside it, inside the roots. Returns `valid`, `errors` and `warnings` (each with `file`, `path`, `message`, `severity`): an error prevents use, a warning allows it. Read-only: it applies nothing to any project (to apply or update, use apply_specialization/update_specialization in propose_changes; beforehand, plan_library_update shows the impact). The document of a type in an external repository (`doc` object) is outside the package: with `docClones` (`{ repository: folder inside the roots }`) each document is checked in the clone and a missing one is a WARNING; without the clone of a repository, one warning per repository counts the unchecked documents. A `doc` whose `repo` is not in `docRepos` is a level 1 error. It is the generate, validate, fix cycle.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Package folder or specialization file inside it, relative to a root or absolute inside them.',
          ),
        previous: z
          .string()
          .optional()
          .describe(
            'File of the previous version of the specialization (enables the version contract: a break without `migrations` is an error, including a removed or renamed role without `rename-role`/`remove-role` and an owner that gains roles without `set-role`).',
          ),
        level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .describe('Up to which level to validate (default 3, the drawing proof).'),
        docClones: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Clones of the document repositories (`docRepos` of the specialization): `{ "<repository id>": "<folder inside the roots>" }`. With the clone, each external document (`doc` object) is checked: one that is not there is a WARNING ("document not found in <repo>"). Without the clone of a repository, one warning per repository counts the unchecked documents.',
          ),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => validateLibraryTool(roots, args, specSummary)),
  );

  server.registerTool(
    'plan_library_update',
    {
      description:
        'Preview, WITHOUT writing anything, of bringing a library to a project: returns what `apply_specialization` or `update_specialization` would do. `path` is the folder of the new package (or the specialization file inside it; it also accepts a v1 to v3 file), inside the roots; `project` is the project. Returns `specId`, `from` (applied version, `null` if not applied) and `to`, `decision` (`apply`: not applied yet; `update`: version greater than the applied one; `not-newer`), `validation` (`valid`, `errors`, `warnings`: the same levels as validate_library, with the applied copy as `previous`) and, in `update`: `additive` (only adds, with no break and no `freedLayers`: applies directly; false when some layer becomes free), `refused` (a break without migration: `update_specialization` would fail with `spec-missing-migrations`) with `missingMigrations`, `changes` (the differences between the versions), `steps` (each step of `migrations`, including the role steps `rename-role`, `remove-role` and `set-role`, with the counts of what it does in this project (`unlinked` counts the links undone by `remove-role` with `unlink`) and its losses), `losses` (values the migration erases or overwrites, cleared roles (`cleared-role`) and undone links (`unlinked`), each with the annotation, the marking and, for the role ones, the `role`), `pending` (new pending items the migration leaves), `brokenRefs`, `addedLayers`, `freedLayers` and a `hint` for the next step. Large lists come cut at 100, with the total in `…Total`. Run it before proposing `update_specialization`; if there are losses, confirm with the person.',
      inputSchema: {
        project: projectArg,
        path: z
          .string()
          .describe(
            'Folder of the new package or specialization file inside it, relative to a root or absolute inside them.',
          ),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => planLibraryUpdate(roots, args)),
  );

  server.registerTool(
    'plan_signature_import',
    {
      description:
        "Preview, WITHOUT writing anything, of importing the signature of a component (the `mapping-signature` sheet, format in mapping-docs://SIGNATURE-FORMAT.md) as fields of a library type: returns the new fields (`fields`, as ready JSON), the links (`links`: each parameter linked to the field that cites it in `params`, to the one with the same name or to a new field), the platform's `code` (or the system's `sources`), the notices the import writes (`notices`, all with the sheet's `ref` and the `message` starting with the platform), the `unmapped` (the sheet's parameters with no field), `changes` (what came in, left, changed and the probable rename, relative to the sheet saved in the package), `suggestedMigrations` (remove-field, rename-field: only if the person asks, the import never writes `migrations`), `versionBump` (the contract changed: raise the `version`) and `spec`, the whole specialization already imported, ready to write. `path` is the package folder (or the specialization file inside it), inside the roots; `type` is the type id; `platform` (code target: the id declared in `platforms`) or `system` (design target, such as figma); `variant` is the value of the `variants` field when the sheet is that of a case. The sheet comes inline in `signature` or in a `.json` inside the roots in `signatureFile` (another extension is refused without being read: the server never reads code; extract the sheet with `mapping-signature.mjs` or write it by hand with `source.extractor: \"agent\"`). Errors: `signature-invalid` (with the path of the problem in the sheet), `type-not-found`, `platform-not-declared`, `signature-mismatch` (the sheet's symbol, file or system differ from the code or the source) and `variant-not-found`. The sheet saved in the package (the code's `signature`) is the previous one of the sync. Afterwards: write the `spec` and the sheet to the package and run validate_library.",
      inputSchema: {
        path: z
          .string()
          .describe(
            'Folder of the library package or specialization file inside it, relative to a root or absolute inside them.',
          ),
        type: z.string().describe('Id of the annotation type that receives the fields.'),
        platform: z
          .string()
          .optional()
          .describe(
            'Code target: the id of the platform (`platforms`). Use this OR `system`.',
          ),
        system: z
          .string()
          .optional()
          .describe(
            'Alvo de design: o sistema (ex: figma), nas `sources` do tipo. Use este OU `platform`.',
          ),
        variant: z
          .string()
          .optional()
          .describe(
            "Value of the code's `variants` field when the sheet is that of the case (only with `platform`).",
          ),
        signature: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('A ficha `mapping-signature` inline. Use esta OU `signatureFile`.'),
        signatureFile: z
          .string()
          .optional()
          .describe(
            'The sheet in a `.json` file inside the roots (another extension is refused).',
          ),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => planSignatureImportTool(roots, args)),
  );

  const packageArgs = {
    project: z
      .string()
      .optional()
      .describe(
        'Project with the library applied (reads the copy in `specs/<folder>/`); use with `specId`.',
      ),
    specId: z
      .string()
      .optional()
      .describe('Id of the specialization applied to the project (see get_project).'),
    path: z
      .string()
      .optional()
      .describe(
        'Alternative to project + specId: the package folder or the specialization file inside it.',
      ),
  };

  server.registerTool(
    'list_components',
    {
      description:
        'The components of a library (formatVersion 4): per annotation type with a component, `type`, `name`, `layer`, `size` and `minSize` (px), whether it has a document (`hasDoc`) and how many examples. Provide `project` + `specId` (the applied copy) or the package `path`. Read-only.',
      inputSchema: packageArgs,
      annotations: READ_ONLY,
    },
    (args) => respond(() => listComponents(roots, args)),
  );

  server.registerTool(
    'get_component',
    {
      description:
        "Everything about a library type for building screens with it: the markdown document (`doc`), the fields (key, label, type, required, options, default, description), the named examples (values, or system + file with the JSON of the external example when small), `code` (the instantiation code per platform: `symbol` and `definition`, with the `url` and `ref` of the specialization's `repo` and, with `project`, the `localFile` from the local clone), `sources` and the component JSON (`component`). `type` is the id (or the name) of the type. A type without a component or document: response with `hasComponent: false` and `hint`. Provide `project` + `specId` or the package `path`. A document in an external repository (`doc` object, formatVersion 11): with `project`, the server reads the `.md` from the repository clone (the project's `docRepos[<id>].localPath`, see set_doc_repo), inside the client's working directory, and returns the text in `doc`; without a clone, without the file or outside the working directory, `doc` is `null` and `docExternal` carries `{ repo, path, url, localFile, exists }` (the `url` comes from the repository's `urlTemplate`, or is `null`) plus a `hint`. Read-only.",
      inputSchema: {
        ...packageArgs,
        type: z
          .string()
          .describe('Id of the annotation type (or the name), see list_components.'),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => getComponent(roots, args)),
  );
}
