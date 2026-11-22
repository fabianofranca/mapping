import {
  loadSpecComponents,
  type ComponentCatalog,
  type SpecComponents,
} from './componentCatalog';
import { createDrawingCache } from './componentDrawings';
import { resolvePath } from './components/library';
import type { TextMeasurer } from './components/instantiate';
import type { SpecFileFormat } from './fileFormats';
import { applyFormatResult } from './formatApply';
import { buildFormatInput } from './formatInput';
import type {
  FormatCallContext,
  FormatFunction,
  FormatInput,
  FormatOutcome,
  FormatRunner,
} from './formatPlugin';
import { checkFormatResult, formatResultProblemText } from './formatResult';
import type { LibraryFile, LibraryIssue, LibraryReport } from './library';
import { createProject } from './project';
import type { Spec } from './spec';
import { applySpecialization } from './specializations';
import type { Project } from './types';

// The checks of a specialization's file formats (stage #1923, decision 17; shared by the MCP's
// `validate_library` and the app, stage #2035, decision 13). Level 2: the plugin loads and defines at
// least one of the two functions. Level 3: each example of a format runs on an empty in-memory project
// with the specialization applied: a round trip (`parse` the file, apply the operations, project,
// `generate`, compare) when the format has both functions, the operations alone when it only has
// `parse`, and `generate(input)` against the file when it only has `generate`. A problem goes to
// `fileFormats[i]` or `fileFormats[i].examples[j]`. The plugin runs in the injected `FormatRunner`
// (QuickJS in the MCP, the sandbox in the app); nothing here reads a file or touches the browser.

export interface FormatCheckPackage {
  readonly spec: Spec;
  /** The specialization file, relative to the package folder. */
  readonly specPath: string;
}

/** Reads a file of the package by its path in the package; `null` when there is none. */
export type PackageReader = (path: string) => Promise<string | null>;

export interface FormatCheckDeps {
  readonly run: FormatRunner;
  /** The text measurer of the drawings that give the projection its slots. */
  readonly measure: TextMeasurer;
}

const NOT_DEFINED = /does not define (generate|parse)$/;
const MAX_SHOWN_LINE = 80;

/** A failure of a step of a check, worded as `<code>: <message>`. */
class CheckError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const codedText = (code: string, message: string): string => `${code}: ${message}`;

// ---------------------------------------------------------------------- the in-memory project

interface Found {
  /** `<specId>/<formatId>`. */
  readonly ref: string;
  readonly format: SpecFileFormat;
  readonly pluginPath: string;
}

interface Memory {
  readonly spec: Spec;
  readonly project: Project;
  readonly catalog: ComponentCatalog;
  readonly files: ReadonlyMap<string, string>;
  readonly deps: FormatCheckDeps;
}

/** An empty project with the specialization applied, as the app would have it after applying the package. */
function memoryProject(
  pkg: FormatCheckPackage,
  files: ReadonlyMap<string, string>,
  deps: FormatCheckDeps,
): Memory {
  const { spec } = pkg;
  const root = `specs/${spec.id}/`;
  const file = `${root}${pkg.specPath}`;
  const components = loadSpecComponents(spec, file, spec.version, (path) =>
    path.startsWith(root) ? files.get(path.slice(root.length)) : undefined,
  );
  return memoryOf(pkg, files, components, deps);
}

/** The in-memory project over components that were already read (the Catalog has them parsed). */
function memoryOf(
  pkg: FormatCheckPackage,
  files: ReadonlyMap<string, string>,
  components: SpecComponents,
  deps: FormatCheckDeps,
): Memory {
  const { spec } = pkg;
  const empty = createProject({
    name: spec.id,
    now: new Date(0).toISOString(),
    firstLayer: { id: crypto.randomUUID(), name: 'Layer 1', color: '#D32F2F' },
  });
  const applied = applySpecialization(empty, spec, { packageSpecName: pkg.specPath });
  const file = `specs/${spec.id}/${pkg.specPath}`;
  const project: Project = {
    ...applied,
    specializations: applied.specializations.map((s) => ({ ...s, file })),
  };
  return { spec, project, catalog: new Map([[spec.id, components]]), files, deps };
}

/** The projection of an empty project: what `parse` receives for an example (scope `container` too: no target yet). */
function emptyInput(memory: Memory, found: Found): FormatInput {
  const { spec } = memory;
  const asProject: Project = {
    ...memory.project,
    specializations: memory.project.specializations.map((s) => ({
      ...s,
      spec: {
        ...spec,
        fileFormats: (spec.fileFormats ?? []).map((f) =>
          f.id === found.format.id ? { ...f, scope: 'project' as const } : f,
        ),
      },
    })),
  };
  const input = buildFormatInput(asProject, found.ref, { projectName: spec.id });
  return {
    ...input,
    format: { ...input.format, scope: found.format.scope ?? 'project' },
    specialization: spec,
  };
}

/** Only a specialization with components has slots to look up: the others skip the drawing. */
function hasComponents(spec: Spec): boolean {
  return spec.layers.some((layer) =>
    layer.annotationTypes.some((type) => type.component !== undefined),
  );
}

/** The projection of `project` for the format; `container` is the target container's id (scope `container`). */
function projectionOf(
  memory: Memory,
  project: Project,
  found: Found,
  container: string | undefined,
): FormatInput {
  const drawings = hasComponents(memory.spec)
    ? createDrawingCache()(project, memory.catalog, memory.deps.measure, 0)
    : undefined;
  return buildFormatInput(project, found.ref, {
    projectName: memory.spec.id,
    ...(container === undefined ? {} : { target: container }),
    ...(drawings === undefined ? {} : { drawings }),
  });
}

// ------------------------------------------------------------------------------ running a plugin

function context(found: Found): FormatCallContext {
  return { format: found.ref, pluginPath: found.pluginPath };
}

function callPlugin(
  memory: Memory,
  found: Found,
  fn: FormatFunction,
  args: readonly unknown[],
): Promise<FormatOutcome> {
  const source = memory.files.get(found.pluginPath) ?? '';
  return memory.deps.run(source, fn, args, context(found));
}

/** The value a call returned; its failure is thrown as a `CheckError`. */
async function valueOf(
  memory: Memory,
  found: Found,
  fn: FormatFunction,
  args: readonly unknown[],
): Promise<unknown> {
  if (!memory.files.has(found.pluginPath)) {
    throw new CheckError(
      'plugin-failed',
      `the plugin of ${found.ref} is missing from the project's copy: specs/${memory.spec.id}/${found.pluginPath}`,
    );
  }
  const outcome = await callPlugin(memory, found, fn, args);
  if (!outcome.ok) throw new CheckError(outcome.failure.code, outcome.failure.message);
  return outcome.value;
}

/** `generate(input)`: the text of the file. */
async function generateText(
  memory: Memory,
  found: Found,
  input: FormatInput,
): Promise<string> {
  const value = await valueOf(memory, found, 'generate', [input]);
  if (typeof value !== 'string') {
    throw new CheckError(
      'plugin-output-invalid',
      `generate of ${found.ref} must return a string`,
    );
  }
  return value;
}

// ----------------------------------------------------------------------------------------- level 2

interface Defined {
  readonly generate: boolean;
  readonly parse: boolean;
}

/**
 * Which of the two functions the plugin defines, or why it does not load. The plugin is run for each
 * function on the empty projection: a missing function is told apart from one that fails.
 */
async function definedFunctions(
  memory: Memory,
  found: Found,
  input: FormatInput,
): Promise<Defined | string> {
  const generated = await callPlugin(memory, found, 'generate', [input]);
  const parsed = await callPlugin(memory, found, 'parse', ['', input]);
  for (const run of [generated, parsed]) {
    if (!run.ok && run.failure.phase === 'load') {
      return codedText(run.failure.code, run.failure.message);
    }
  }
  const defines = (run: FormatOutcome) =>
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

/** Why an example could not be applied: the failure's code and message, and the line the checks word it as. */
export interface ExampleFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly text: string;
}

type ExampleApplied = { readonly ok: true; readonly project: Project } | ExampleFailure;

const failed = (code: string, message: string, text?: string): ExampleFailure => ({
  ok: false,
  code,
  message,
  text: text ?? codedText(code, message),
});

/** Applies the example text with `parse` on an empty project; the project, or why it failed. */
async function applyExample(
  memory: Memory,
  found: Found,
  text: string,
): Promise<ExampleApplied> {
  const input = emptyInput(memory, found);
  const run = await callPlugin(memory, found, 'parse', [text, input]);
  if (!run.ok) return failed(run.failure.code, run.failure.message);
  const checked = checkFormatResult(run.value, input);
  if (!checked.ok) {
    const first = checked.problems[0]!;
    return failed(first.code, formatResultProblemText(first));
  }
  const outcome = applyFormatResult(memory.project, checked.result, {
    input,
    catalog: memory.catalog,
    measure: memory.deps.measure,
  });
  if (!outcome.ok) {
    const { index, op, code, message } = outcome.error;
    const where = `operation ${index} (${op}) refused`;
    return failed(code, `${where}: ${message}`, `${where}: ${codedText(code, message)}`);
  }
  return { ok: true, project: outcome.project };
}

/** The text `generate` gives for `project` (scope `container`: the first container). */
function generated(memory: Memory, project: Project, found: Found): Promise<string> {
  const scoped = found.format.scope === 'container';
  const container = scoped ? project.containers[0]?.id : undefined;
  if (scoped && container === undefined) {
    throw new CheckError(
      'plugin-output-invalid',
      'parse created no container to generate from',
    );
  }
  return generateText(memory, found, projectionOf(memory, project, found, container));
}

async function roundTrip(
  memory: Memory,
  found: Found,
  text: string,
): Promise<string | null> {
  const applied = await applyExample(memory, found, text);
  if (!applied.ok) return `parse: ${applied.text}`;
  const back = await generated(memory, applied.project, found);
  const difference = firstDifference(text, back);
  return difference === null ? null : `it does not round-trip: ${difference}`;
}

async function fromProjection(
  memory: Memory,
  found: Found,
  inputText: string,
  expected: string,
): Promise<string | null> {
  let input: unknown;
  try {
    input = JSON.parse(inputText);
  } catch {
    return 'the `input` file is not valid JSON';
  }
  const text = await generateText(memory, found, input as FormatInput);
  const difference = firstDifference(expected, text);
  return difference === null
    ? null
    : `generate(input) differs from the file: ${difference}`;
}

interface ExampleContext {
  readonly pkg: FormatCheckPackage;
  readonly read: PackageReader;
  readonly memory: Memory;
  readonly found: Found;
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
    return applied.ok ? null : `parse: ${applied.text}`;
  }
  return 'a format that only generates needs `input` in the example (the projection `generate` receives)';
}

function issue(pkg: FormatCheckPackage, path: string, message: string): LibraryIssue {
  return { file: pkg.specPath, path, message, severity: 'error' };
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
      if (!(error instanceof CheckError)) throw error;
      problem = codedText(error.code, error.message);
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
async function oneFormatIssues(
  pkg: FormatCheckPackage,
  read: PackageReader,
  memory: Memory,
  format: SpecFileFormat,
  fi: number,
  level: 2 | 3,
): Promise<LibraryIssue[]> {
  const pluginPath = resolvePath(pkg.specPath, format.plugin);
  const found: Found = { ref: `${pkg.spec.id}/${format.id}`, format, pluginPath };
  const path = `fileFormats[${fi}]`;
  if (!memory.files.has(pluginPath)) return []; // level 1 already says the plugin is missing
  const defined = await definedFunctions(memory, found, emptyInput(memory, found));
  if (typeof defined === 'string') return [issue(pkg, path, defined)];
  if (!defined.generate && !defined.parse) {
    return [
      issue(pkg, path, `the plugin ${pluginPath} defines neither generate nor parse`),
    ];
  }
  if (level < 3) return [];
  return exampleIssues({ pkg, read, memory, found, defined }, format, fi);
}

/**
 * The texts the checks read, by package path: each plugin, the files its examples cite and the
 * components and icon set of the specialization (a `parse` result that puts a child in a slot is
 * applied with the components drawn, as in a project).
 */
async function readTexts(
  pkg: FormatCheckPackage,
  read: PackageReader,
  formats: readonly SpecFileFormat[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const refs: (string | undefined)[] = [pkg.spec.icons];
  for (const layer of pkg.spec.layers) {
    for (const type of layer.annotationTypes) refs.push(type.component);
  }
  for (const format of formats) {
    const cited = (format.examples ?? []).flatMap((e) => [e.file, e.input]);
    refs.push(format.plugin, ...cited);
  }
  for (const ref of refs) {
    if (ref === undefined) continue;
    const path = resolvePath(pkg.specPath, ref);
    const text = files.has(path) ? null : await read(path);
    if (text !== null) files.set(path, text);
  }
  return files;
}

/**
 * The problems of the specialization's file formats at level 2 (the plugin loads and defines a
 * function) and, with `level` 3, of their examples. Only for a package that passed level 1.
 */
export async function formatCheckIssues(
  pkg: FormatCheckPackage,
  read: PackageReader,
  level: 2 | 3,
  deps: FormatCheckDeps,
): Promise<LibraryIssue[]> {
  const formats = pkg.spec.fileFormats ?? [];
  if (formats.length === 0) return [];
  const memory = memoryProject(pkg, await readTexts(pkg, read, formats), deps);
  const issues: LibraryIssue[] = [];
  for (const [fi, format] of formats.entries()) {
    issues.push(...(await oneFormatIssues(pkg, read, memory, format, fi, level)));
  }
  return issues;
}

// ---------------------------------------------------------------------------------- the report

/** The checks of a package's formats, with the executor already chosen (`formatCheckIssues` with `deps`). */
export type FormatChecker = (
  pkg: FormatCheckPackage,
  read: PackageReader,
  level: 2 | 3,
) => Promise<LibraryIssue[]>;

/** The package file that holds `spec` (the validator found it, but does not say which one it was). */
export function specFileOf(
  files: readonly LibraryFile[],
  spec: Spec,
): string | undefined {
  return files.find((file) => {
    if (file.text === undefined || !file.path.toLowerCase().endsWith('.json'))
      return false;
    try {
      const raw = JSON.parse(file.text) as { format?: unknown; id?: unknown };
      return raw.format === 'mapping-spec' && raw.id === spec.id;
    } catch {
      return false;
    }
  })?.path;
}

/**
 * The report with the file formats' problems added: level 2 (the plugin loads and defines a function)
 * and, when the report reached level 3, the examples. Only for a package that passed level 1 and
 * reached the level they belong to; a problem is an error, so `ok` turns false. `specPath` is the
 * specialization file in the package (`specFileOf` finds it).
 */
export async function reportWithFormatChecks(
  report: LibraryReport,
  specPath: string | undefined,
  read: PackageReader,
  check: FormatChecker,
): Promise<LibraryReport> {
  const level = report.summary.level;
  if (!report.ok || report.spec === undefined || level < 2 || specPath === undefined) {
    return report;
  }
  const extra = await check({ spec: report.spec, specPath }, read, level === 2 ? 2 : 3);
  if (extra.length === 0) return report;
  return {
    ...report,
    ok: false,
    issues: [...report.issues, ...extra],
    errors: [...report.errors, ...extra],
  };
}

// ------------------------------------------------------------------------------ one example, applied

export interface FormatExampleInput {
  readonly spec: Spec;
  /** The specialization file, relative to the package folder. */
  readonly specPath: string;
  readonly format: SpecFileFormat;
  /** The plugin's text. */
  readonly pluginText: string;
  /** The components of the specialization, already read. */
  readonly components: SpecComponents;
}

export type FormatExampleOutcome =
  | {
      readonly ok: true;
      readonly project: Project;
      /** The component catalog the project was built with (what draws its markings). */
      readonly catalog: ComponentCatalog;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** The in-memory project and the format, as the checks have them. */
function formatMemory(
  input: FormatExampleInput,
  deps: FormatCheckDeps,
): { memory: Memory; found: Found } {
  const { spec, specPath, format } = input;
  const pluginPath = resolvePath(specPath, format.plugin);
  const memory = memoryOf(
    { spec, specPath },
    new Map([[pluginPath, input.pluginText]]),
    input.components,
    deps,
  );
  return { memory, found: { ref: `${spec.id}/${format.id}`, format, pluginPath } };
}

/**
 * An example's text through `parse` on an empty in-memory project with the specialization, as level 3
 * does for a format that parses: the project the operations build, or the first failure (the plugin's, the
 * result's or an operation's). Used by the Catalog to draw the example (decision 14 of #2035).
 */
export async function applyFormatExample(
  input: FormatExampleInput,
  text: string,
  deps: FormatCheckDeps,
): Promise<FormatExampleOutcome> {
  const { memory, found } = formatMemory(input, deps);
  const applied = await applyExample(memory, found, text);
  if (!applied.ok) return { ok: false, code: applied.code, message: applied.message };
  return { ok: true, project: applied.project, catalog: memory.catalog };
}

/** Which of `generate` and `parse` the plugin defines. */
export type FormatFunctions = Defined;

/**
 * Which of the two functions the plugin defines, or why it does not load (`<code>: <message>`): level 2 of the
 * checks, for the Catalog to say what a format does.
 */
export function definedFormatFunctions(
  input: FormatExampleInput,
  deps: FormatCheckDeps,
): Promise<FormatFunctions | string> {
  const { memory, found } = formatMemory(input, deps);
  return definedFunctions(memory, found, emptyInput(memory, found));
}
