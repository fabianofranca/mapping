import {
  buildFormatInput,
  checkFormatResult,
  formatResultProblemText,
  projectIndex,
  type ProjectSpecialization,
  type FormatInput,
  type FormatResult,
  type FormatResultProblem,
  type Project,
  type Spec,
  type SpecFileFormat,
} from '../src/model';
import { resolvePathChecked } from '../src/model/components/library';
import { projectDrawings } from './drawings';
import { ToolError } from './errors';
import { Refs } from './items';
import { findContainer } from './markingList';
import { pluginToolError, runPlugin, type PluginFunction } from './pluginRunner';
import { findProject, loadProject, readText, type LoadedProject } from './projects';
import { listFileFormats } from './views';
import type { Roots } from './paths';

// The file formats of the specializations through the MCP (stage #1923, FP4, decisions 18 and 19):
// finding `<specId>/<formatId>` among the applied specializations, the plugin text in the project's
// copy (`specs/<id>/…`), the projection, the run of `generate` and `parse` with every failure as a
// typed `ToolError`, and the `export_format` tool. The batch's `import_format` operation and the
// `validate_library` checks use the same functions (`mcp/batch.ts`, `mcp/pluginChecks.ts`).

type Json = Record<string, unknown>;

/** Reads a package file of the project by its path in the project (`specs/<id>/plugins/a.js`). */
export type PluginReader = (path: string) => Promise<string | null>;

/** A declared format with the specialization that declares it and the project's copy of its file. */
export interface FoundFormat {
  /** `<specId>/<formatId>`. */
  readonly ref: string;
  readonly spec: Spec;
  readonly format: SpecFileFormat;
  /** The specialization file in the project (`specs/<id>/<id>.spec.json`). */
  readonly file: string;
}

function appliedOf(project: Project, specId: string): ProjectSpecialization | undefined {
  return projectIndex(project).specializations.get(specId);
}

/** The declared format `ref` (`<specId>/<formatId>`); `format-not-found` lists the available ones. */
export function findFileFormat(project: Project, ref: string): FoundFormat {
  const cut = ref.indexOf('/');
  const applied = cut < 0 ? undefined : appliedOf(project, ref.slice(0, cut));
  const format = applied?.spec?.fileFormats?.find((f) => f.id === ref.slice(cut + 1));
  if (applied?.spec && format) {
    return { ref, spec: applied.spec, format, file: applied.file };
  }
  throw new ToolError(
    'format-not-found',
    `no file format ${ref} among the applied specializations (use \`<specId>/<formatId>\`, see \`fileFormats\` in get_project)`,
    { format: ref, formats: listFileFormats(project).map((f) => f.format) },
  );
}

/** The plugin's path in the project (`specs/<id>/plugins/a.js`). */
export function pluginPathOf(found: FoundFormat): string {
  const path = resolvePathChecked(found.file, found.format.plugin);
  if (path === undefined) {
    throw new ToolError(
      'plugin-failed',
      `the plugin of ${found.ref} points outside the package: ${found.format.plugin}`,
      { plugin: found.format.plugin },
    );
  }
  return path;
}

/** The plugin text of the project's copy, from the project folder. */
export function projectPluginReader(roots: Roots, dir: string): PluginReader {
  return (path) => readText(roots, dir, path);
}

async function runFormatFunction(
  found: FoundFormat,
  fn: PluginFunction,
  args: readonly unknown[],
  readPlugin: PluginReader,
): Promise<unknown> {
  const path = pluginPathOf(found);
  const source = await readPlugin(path);
  if (source === null) {
    throw new ToolError(
      'plugin-failed',
      `the plugin of ${found.ref} is missing from the project's copy: ${path}`,
      { plugin: path, function: fn },
    );
  }
  const run = await runPlugin(source, fn, args, { format: found.ref, pluginPath: path });
  if (!run.ok) throw pluginToolError(run.failure);
  return run.value;
}

/** `generate(input)`: the text of the file. */
export async function generateFormat(
  found: FoundFormat,
  input: FormatInput,
  readPlugin: PluginReader,
): Promise<string> {
  const value = await runFormatFunction(found, 'generate', [input], readPlugin);
  if (typeof value !== 'string') {
    throw new ToolError(
      'plugin-output-invalid',
      `generate of ${found.ref} must return a string`,
      { path: 'result' },
    );
  }
  return value;
}

/** The first problem as the error: its code and path, the other ones listed in `problems`. */
function resultError(problems: readonly FormatResultProblem[]): ToolError {
  const first = problems[0]!;
  return new ToolError(first.code, formatResultProblemText(first), {
    path: first.path,
    problems: problems.slice(0, 20).map((p) => ({ path: p.path, message: p.message })),
  });
}

/** `parse(text, input)`: the checked result (the operations of the allowed subset and the warnings). */
export async function parseFormat(
  found: FoundFormat,
  text: string,
  input: FormatInput,
  readPlugin: PluginReader,
): Promise<FormatResult> {
  const value = await runFormatFunction(found, 'parse', [text, input], readPlugin);
  const checked = checkFormatResult(value, input);
  if (!checked.ok) throw resultError(checked.problems);
  return checked.result;
}

/** Only a specialization with components has slots to look up: the others skip the drawing. */
function hasComponents(spec: Spec): boolean {
  return spec.layers.some((layer) =>
    layer.annotationTypes.some((type) => type.component !== undefined),
  );
}

/** The projection of the project for the format; `container` is the target container's id (scope `container`). */
export function formatProjection(
  loaded: LoadedProject,
  found: FoundFormat,
  container?: string,
  targetOptional = false,
): FormatInput {
  return buildFormatInput(loaded.project, found.ref, {
    projectName: loaded.location.name,
    ...(targetOptional ? { targetOptional } : {}),
    ...(container === undefined ? {} : { target: container }),
    ...(hasComponents(found.spec) ? { drawings: projectDrawings(loaded) } : {}),
  });
}

/** A name as a file name: the characters a path does not allow become `-`. */
function fileNameBase(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
  return cleaned === '' ? 'export' : cleaned;
}

export interface ExportFormatArgs {
  readonly project: string;
  readonly format: string;
  readonly container?: string | undefined;
}

/** `export_format`: the text the format's plugin generates for the project or one container. */
export async function exportFormat(roots: Roots, args: ExportFormatArgs): Promise<Json> {
  const location = await findProject(roots, args.project);
  const loaded = await loadProject(roots, location);
  const found = findFileFormat(loaded.project, args.format);
  const scope = found.format.scope ?? 'project';
  const warnings: string[] = [];
  let containerId: string | undefined;
  let containerName: string | null = null;
  if (scope === 'container') {
    if (args.container === undefined) {
      throw new ToolError(
        'invalid-arguments',
        `${found.ref} has scope container: pass \`container\` (a container reference, code or name)`,
        { format: found.ref, scope },
      );
    }
    const container = findContainer(new Refs(loaded), args.container);
    containerId = container.id;
    containerName = container.name;
  } else if (args.container !== undefined) {
    warnings.push(
      `\`container\` was ignored: ${found.ref} has scope project and exports the whole project`,
    );
  }
  const input = formatProjection(loaded, found, containerId);
  const text = await generateFormat(
    found,
    input,
    projectPluginReader(roots, location.dir),
  );
  const base = scope === 'container' ? containerName : null;
  return {
    text,
    fileName: `${fileNameBase(base ?? loaded.project.project.name)}.${found.format.extension}`,
    warnings,
  };
}
