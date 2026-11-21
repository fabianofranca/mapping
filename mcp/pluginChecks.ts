import {
  applySpecialization,
  buildFormatInput,
  checkFormatResult,
  createProject,
  formatResultProblemText,
  loadSpecComponents,
  type FormatInput,
  type Project,
  type Spec,
  type SpecFileFormat,
} from '../src/model';
import { resolvePath } from '../src/model/components/library';
import type { LibraryIssue } from '../src/model/library';
import { runBatch, type BatchIo } from './batch';
import { ToolError } from './errors';
import { pluginOperations } from './formatImport';
import {
  findFileFormat,
  formatProjection,
  generateFormat,
  pluginPathOf,
  type FoundFormat,
  type PluginReader,
} from './formatTools';
import { runPlugin, type PluginFailure } from './pluginRunner';
import type { LoadedProject } from './projects';

// `validate_library` for the file formats of a specialization (stage #1923, FP4, decision 17).
// Level 2: the plugin loads and defines at least one of the two functions. Level 3: each example
// of a format runs on an empty in-memory project with the specialization applied: a round trip
// (`parse` the file, apply the operations, project, `generate`, compare) when the format has both
// functions, the operations alone when it only has `parse`, and `generate(input)` against the file
// when it only has `generate`. A problem goes to `fileFormats[i]` or `fileFormats[i].examples[j]`.

export interface FormatPackage {
  readonly spec: Spec;
  /** The specialization file, relative to the package folder. */
  readonly specPath: string;
}

/** Reads a file of the package by its path in the package; `null` when there is none. */
export type PackageReader = (path: string) => Promise<string | null>;

const NOT_DEFINED = /does not define (generate|parse)$/;
const MAX_SHOWN_LINE = 80;

function issue(pkg: FormatPackage, path: string, message: string): LibraryIssue {
  return { file: pkg.specPath, path, message, severity: 'error' };
}

// ---------------------------------------------------------------------------- the in-memory project

interface Memory {
  readonly project: Project;
  readonly loaded: LoadedProject;
  readonly io: BatchIo;
  readonly readPlugin: PluginReader;
  readonly root: string;
}

/** An empty project with the specialization applied, as the app would have it after applying the package. */
function memoryProject(pkg: FormatPackage, files: ReadonlyMap<string, string>): Memory {
  const { spec } = pkg;
  const empty = createProject({
    name: spec.id,
    now: new Date(0).toISOString(),
    firstLayer: { id: crypto.randomUUID(), name: 'Layer 1', color: '#D32F2F' },
  });
  const applied = applySpecialization(empty, spec, { packageSpecName: pkg.specPath });
  const root = `specs/${spec.id}/`;
  const file = `${root}${pkg.specPath}`;
  const project: Project = {
    ...applied,
    specializations: applied.specializations.map((s) => ({ ...s, file })),
  };
  const readPlugin: PluginReader = (path) =>
    Promise.resolve(
      path.startsWith(root) ? (files.get(path.slice(root.length)) ?? null) : null,
    );
  const components = loadSpecComponents(spec, file, spec.version, (path) =>
    path.startsWith(root) ? files.get(path.slice(root.length)) : undefined,
  );
  const loaded: LoadedProject = {
    location: { name: spec.id, dir: '', root: '', path: '.' },
    project,
    readOnly: false,
    migratedFrom: null,
    specWarnings: [],
    catalog: new Map([[spec.id, components]]),
  };
  const refuse = () =>
    Promise.reject(new ToolError('invalid-path', 'a library check reads no files'));
  const io: BatchIo = {
    readSource: refuse,
    readSpecInput: refuse,
    readProjectText: readPlugin,
    takenImageFiles: new Set(),
    now: () => new Date(0),
  };
  return { project, loaded, io, readPlugin, root };
}

/** The projection of an empty project: what `parse` receives for an example (scope `container` too: no target yet). */
function emptyInput(memory: Memory, found: FoundFormat): FormatInput {
  const asProject: Project = {
    ...memory.project,
    specializations: memory.project.specializations.map((s) => ({
      ...s,
      spec: {
        ...found.spec,
        fileFormats: (found.spec.fileFormats ?? []).map((f) =>
          f.id === found.format.id ? { ...f, scope: 'project' as const } : f,
        ),
      },
    })),
  };
  const input = buildFormatInput(asProject, found.ref, { projectName: found.spec.id });
  return {
    ...input,
    format: { ...input.format, scope: found.format.scope ?? 'project' },
    specialization: found.spec,
  };
}

// ----------------------------------------------------------------------------------------- level 2

interface Defined {
  readonly generate: boolean;
  readonly parse: boolean;
}

function failureText(failure: PluginFailure): string {
  return `${failure.code}: ${failure.message}`;
}

/**
 * Which of the two functions the plugin defines, or why it does not load. The plugin is run for each
 * function on the empty projection: a missing function is told apart from one that fails.
 */
async function definedFunctions(
  source: string,
  found: FoundFormat,
  pluginPath: string,
  input: FormatInput,
): Promise<Defined | string> {
  const options = { format: found.ref, pluginPath };
  const generated = await runPlugin(source, 'generate', [input], options);
  const parsed = await runPlugin(source, 'parse', ['', input], options);
  for (const run of [generated, parsed]) {
    if (!run.ok && run.failure.details.phase === 'load') {
      return failureText(run.failure);
    }
  }
  const defines = (run: typeof generated) =>
    run.ok || !NOT_DEFINED.test(run.failure.message);
  return { generate: defines(generated), parse: defines(parsed) };
}

// ----------------------------------------------------------------------------------------- level 3

function quoted(line: string | undefined): string {
  if (line === undefined) return 'nothing (the text ends)';
  return JSON.stringify(
    line.length > MAX_SHOWN_LINE ? `${line.slice(0, MAX_SHOWN_LINE)}…` : line,
  );
}

/** LF endings and no final newline: what two texts are compared by. */
const normalized = (text: string): string =>
  text.replace(/\r\n/g, '\n').replace(/\n$/, '');

/** `null` when the two texts are equal, else the first line where they differ. */
function firstDifference(expected: string, actual: string): string | null {
  const a = normalized(expected).split('\n');
  const b = normalized(actual).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: the file has ${quoted(a[i])} and generate gives ${quoted(b[i])}`;
    }
  }
  return null;
}

/** Applies the example text with `parse` on an empty project; the project, or why it failed. */
async function applyExample(
  memory: Memory,
  found: FoundFormat,
  text: string,
): Promise<Project | string> {
  const input = emptyInput(memory, found);
  const run = await runPlugin(await sourceOf(memory, found), 'parse', [text, input], {
    format: found.ref,
    pluginPath: pluginPathOf(found),
  });
  if (!run.ok) return failureText(run.failure);
  const checked = checkFormatResult(run.value, input);
  if (!checked.ok) {
    const first = checked.problems[0]!;
    return `${first.code}: ${formatResultProblemText(first)}`;
  }
  const operations = pluginOperations(checked.result.operations);
  const result = await runBatch(memory.loaded, operations, memory.io);
  const error = result.errors[0];
  if (error)
    return `operation ${error.index} (${error.op}) refused: ${error.code}: ${error.message}`;
  return result.project;
}

async function sourceOf(memory: Memory, found: FoundFormat): Promise<string> {
  return (await memory.readPlugin(pluginPathOf(found))) ?? '';
}

/** The text `generate` gives for `project` (scope `container`: the first container). */
async function generated(
  memory: Memory,
  project: Project,
  found: FoundFormat,
): Promise<string> {
  const scoped = found.format.scope === 'container';
  const container = scoped ? project.containers[0]?.id : undefined;
  if (scoped && container === undefined) {
    throw new ToolError(
      'plugin-output-invalid',
      'parse created no container to generate from',
    );
  }
  const after = { ...memory.loaded, project };
  const reread = findFileFormat(project, found.ref);
  return generateFormat(
    reread,
    formatProjection(after, reread, container),
    memory.readPlugin,
  );
}

async function roundTrip(
  memory: Memory,
  found: FoundFormat,
  text: string,
): Promise<string | null> {
  const project = await applyExample(memory, found, text);
  if (typeof project === 'string') return `parse: ${project}`;
  const back = await generated(memory, project, found);
  const difference = firstDifference(text, back);
  return difference === null ? null : `it does not round-trip: ${difference}`;
}

async function fromProjection(
  memory: Memory,
  found: FoundFormat,
  inputText: string,
  expected: string,
): Promise<string | null> {
  let input: unknown;
  try {
    input = JSON.parse(inputText);
  } catch {
    return 'the `input` file is not valid JSON';
  }
  const text = await generateFormat(found, input as FormatInput, memory.readPlugin);
  const difference = firstDifference(expected, text);
  return difference === null
    ? null
    : `generate(input) differs from the file: ${difference}`;
}

interface ExampleContext {
  readonly pkg: FormatPackage;
  readonly read: PackageReader;
  readonly memory: Memory;
  readonly found: FoundFormat;
  readonly defined: Defined;
}

/** What is wrong with one example, or `null`. */
async function exampleProblem(
  ctx: ExampleContext,
  example: NonNullable<SpecFileFormat['examples']>[number],
): Promise<string | null> {
  const { pkg, read, memory, found, defined } = ctx;
  const text = await read(resolvePath(pkg.specPath, example.file));
  if (text === null) return null; // level 1 already says the file is missing
  if (example.input !== undefined) {
    if (!defined.generate)
      return 'the example has an `input`, but the plugin defines no generate';
    const input = await read(resolvePath(pkg.specPath, example.input));
    return input === null ? null : fromProjection(memory, found, input, text);
  }
  if (defined.parse && defined.generate) return roundTrip(memory, found, text);
  if (defined.parse) {
    const applied = await applyExample(memory, found, text);
    return typeof applied === 'string' ? `parse: ${applied}` : null;
  }
  return 'a format that only generates needs `input` in the example (the projection `generate` receives)';
}

/** Runs the examples of a format; the problems, each at `fileFormats[i].examples[j]`. */
async function exampleIssues(
  ctx: ExampleContext,
  format: SpecFileFormat,
  fi: number,
): Promise<LibraryIssue[]> {
  const issues: LibraryIssue[] = [];
  for (const [ej, example] of (format.examples ?? []).entries()) {
    let problem: string | null;
    try {
      problem = await exampleProblem(ctx, example);
    } catch (error) {
      if (!(error instanceof ToolError)) throw error;
      problem = `${error.code}: ${error.message}`;
    }
    if (problem !== null) {
      issues.push(
        issue(
          ctx.pkg,
          `fileFormats[${fi}].examples[${ej}]`,
          `example "${example.name}": ${problem}`,
        ),
      );
    }
  }
  return issues;
}

// ------------------------------------------------------------------------------------------ the check

/** One declared format: level 2 and, at level 3, its examples. */
async function formatIssues(
  pkg: FormatPackage,
  read: PackageReader,
  memory: Memory,
  format: SpecFileFormat,
  fi: number,
  level: 2 | 3,
): Promise<LibraryIssue[]> {
  const found = findFileFormat(memory.project, `${pkg.spec.id}/${format.id}`);
  const path = `fileFormats[${fi}]`;
  const pluginPath = resolvePath(pkg.specPath, format.plugin);
  const source = await read(pluginPath);
  if (source === null) return []; // level 1 already says the plugin is missing
  const defined = await definedFunctions(
    source,
    found,
    pluginPath,
    emptyInput(memory, found),
  );
  if (typeof defined === 'string') return [issue(pkg, path, defined)];
  if (!defined.generate && !defined.parse) {
    return [
      issue(pkg, path, `the plugin ${pluginPath} defines neither generate nor parse`),
    ];
  }
  if (level < 3) return [];
  return exampleIssues({ pkg, read, memory, found, defined }, format, fi);
}

/** The texts the checks read: each plugin and the files its examples cite, by package path. */
async function readTexts(
  pkg: FormatPackage,
  read: PackageReader,
  formats: readonly SpecFileFormat[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const format of formats) {
    const cited = (format.examples ?? []).flatMap((e) => [e.file, e.input]);
    for (const ref of [format.plugin, ...cited]) {
      if (ref === undefined) continue;
      const path = resolvePath(pkg.specPath, ref);
      const text = files.has(path) ? null : await read(path);
      if (text !== null) files.set(path, text);
    }
  }
  return files;
}

/**
 * The problems of the specialization's file formats at level 2 (the plugin loads and defines a
 * function) and, with `level` 3, of their examples. Only for a package that passed level 1.
 */
export async function pluginIssues(
  pkg: FormatPackage,
  read: PackageReader,
  level: 2 | 3,
): Promise<LibraryIssue[]> {
  const formats = pkg.spec.fileFormats ?? [];
  if (formats.length === 0) return [];
  const files = await readTexts(pkg, read, formats);
  const memory = memoryProject(pkg, files);
  const issues: LibraryIssue[] = [];
  for (const [fi, format] of formats.entries()) {
    issues.push(...(await formatIssues(pkg, read, memory, format, fi, level)));
  }
  return issues;
}
