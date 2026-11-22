import {
  FORMAT_PLUGIN_LIMITS,
  applyFormatResult,
  buildFormatInput,
  checkFormatResult,
  projectIndex,
  type AppliedItem,
  type ComponentCatalog,
  type FormatApplyError,
  type FormatFailure,
  type FormatInput,
  type FormatFunction,
  type FormatResult,
  type FormatResultProblemCode,
  type FormatRunner,
  type FormatSlotDrawings,
  type Project,
  type TextMeasurer,
} from '../model';
import type { ProjectCatalog } from './projectCatalogs';
import type { SelectionItem } from './ui';
import type { FlushResult } from '../storage/autosave';
import { reportError } from '../utils/report';

// Export in a format (stage #2035, AF3, decisions 6, 7 and 11): the formats of the project's
// specializations, and the action that saves the pending changes, runs the plugin's `generate` on
// the projection and hands the text back as a file. The project never changes here and the action
// does not count as an export of the zip. It is pure over its dependencies (the session's `flush`,
// the project and the executor), so the tests pass fakes; nothing runs on its own: only on the
// explicit action (decision 10).

/** A format a person can pick: the declaration and the text of its plugin. */
export interface FormatChoice {
  /** `<specId>/<formatId>`. */
  readonly ref: string;
  readonly specId: string;
  readonly specName: string;
  readonly formatId: string;
  readonly name: string;
  readonly extension: string;
  readonly scope: 'project' | 'container';
  /** The plugin's text, as the package holds it. */
  readonly plugin: string;
}

/**
 * Whether the plugin's text may define the function: its name appears as a word. The text is
 * not run to find out (decision 10); a plugin that mentions it without defining it fails when it
 * is called, with a message.
 */
export function mayDefine(plugin: string, fn: FormatFunction): boolean {
  return new RegExp(`\\b${fn}\\b`).test(plugin);
}

/** How many formats the applied specializations declare (decision 6: the menu item shows when it is above 0). */
export function declaredFormats(project: Project | null): number {
  if (project === null) return 0;
  return project.specializations.reduce(
    (count, s) => count + (s.spec?.fileFormats?.length ?? 0),
    0,
  );
}

/**
 * The formats of the loaded catalogs whose plugin may define `fn`, each with its plugin text,
 * in the order of the project's specializations.
 */
export function formatChoices(
  catalogs: readonly ProjectCatalog[],
  fn: FormatFunction,
): FormatChoice[] {
  const choices: FormatChoice[] = [];
  for (const { specId, name, catalog } of catalogs) {
    for (const format of catalog.formats) {
      if (format.pluginText === null || !mayDefine(format.pluginText, fn)) continue;
      choices.push({
        ref: `${specId}/${format.id}`,
        specId,
        specName: name,
        formatId: format.id,
        name: format.name,
        extension: format.extension,
        scope: format.scope,
        plugin: format.pluginText,
      });
    }
  }
  return choices;
}

/** A name as a file name: the characters a path does not allow become `-`. */
function fileNameBase(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
  return cleaned === '' ? 'export' : cleaned;
}

/** `<name>.<extension>`: the container's name or the project's. */
export function exportFileName(name: string, extension: string): string {
  return `${fileNameBase(name)}.${extension}`;
}

export interface ExportInFormatDeps {
  /** `session.flush()`: the pending changes are saved before the plugin runs (decision 7). */
  readonly flush: () => Promise<FlushResult>;
  /** The committed project, read after the save. */
  readonly project: () => Project | null;
  readonly run: FormatRunner;
  /** The drawings of the project (they give the projection its `slot`s); without them no marking has one. */
  readonly drawings?: (project: Project) => FormatSlotDrawings | undefined;
}

export type ExportInFormatError =
  /** The pending changes could not be saved: the plugin did not run. */
  | { readonly kind: 'save' }
  | { readonly kind: 'project' }
  /** Scope `container` without a container the project has. */
  | { readonly kind: 'container' }
  | { readonly kind: 'plugin'; readonly failure: FormatFailure };

export type ExportInFormatResult =
  | { readonly ok: true; readonly file: File }
  | { readonly ok: false; readonly error: ExportInFormatError };

const fail = (error: ExportInFormatError): ExportInFormatResult => ({ ok: false, error });

/** The name of an image file without its folder and extension (`images/plan1.png` → `plan1`). */
function stemOf(file: string | null): string | null {
  const base = file
    ?.split('/')
    .pop()
    ?.replace(/\.[^.]*$/, '');
  return base === undefined || base === '' ? null : base;
}

/** What the plugin sees: the project (`target` null) or one container; the name of the file comes with it. */
function targetOf(
  project: Project,
  choice: FormatChoice,
  container: string | null | undefined,
): { readonly target: string | null; readonly name: string } | null {
  if (choice.scope !== 'container') return { target: null, name: project.project.name };
  const found = project.containers.find((c) => c.id === container);
  return found === undefined
    ? null
    : {
        target: found.id,
        name: found.name ?? stemOf(found.file) ?? project.project.name,
      };
}

/** The projection of the project for the plugin; `null` when it cannot be built (reported). */
function projectionOf(
  deps: ExportInFormatDeps,
  project: Project,
  choice: FormatChoice,
  target: string | null,
  targetOptional = false,
): FormatInput | null {
  try {
    const drawings = deps.drawings?.(project);
    return buildFormatInput(project, choice.ref, {
      projectName: project.project.name,
      // An import may have no container: `parse` then creates the one it reads (decision 12).
      ...(targetOptional ? { targetOptional } : {}),
      ...(target === null ? {} : { target }),
      ...(drawings === undefined ? {} : { drawings }),
    });
  } catch (error) {
    reportError('formatActions.projection', error);
    return null;
  }
}

/**
 * Exports the project (scope `project`) or the container `container` (scope `container`, the id)
 * in `choice`'s format: saves, builds the projection, runs `generate` and returns the text as
 * `<container or project name>.<extension>`.
 */
export async function exportInFormat(
  deps: ExportInFormatDeps,
  choice: FormatChoice,
  container?: string | null,
): Promise<ExportInFormatResult> {
  const saved = await deps.flush();
  if (!saved.ok) return fail({ kind: 'save' });
  const project = deps.project();
  if (project === null) return fail({ kind: 'project' });
  const found = targetOf(project, choice, container);
  if (found === null) return fail({ kind: 'container' });
  const input = projectionOf(deps, project, choice, found.target);
  if (input === null) return fail({ kind: 'project' });
  const outcome = await deps.run(choice.plugin, 'generate', [input]);
  if (!outcome.ok) return fail({ kind: 'plugin', failure: outcome.failure });
  if (typeof outcome.value !== 'string') {
    return fail({
      kind: 'plugin',
      failure: {
        code: 'plugin-output-invalid',
        message: 'generate must return a string',
      },
    });
  }
  const file = new File([outcome.value], exportFileName(found.name, choice.extension), {
    type: 'text/plain;charset=utf-8',
  });
  return { ok: true, file };
}

// ---------------------------------------------------------------------------------------- import

// Import from a format (stage #2035, AF4, decisions 4, 7 and 12). The preview checks the file before it
// is read, saves the pending changes, runs `parse` on the projection of the current project, checks the
// result against the contract and applies it with the model's applier on a copy: the counts, the
// warnings or the error with its path. It changes nothing; the `importFormat` store action
// (`project.ts`) applies the same checked result to the project, in one undo entry, without running
// the plugin again.

/** The file a person picked: its name, its size and its text (read as UTF-8, only when it is accepted). */
export interface ImportFile {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export interface ImportInFormatDeps extends ExportInFormatDeps {
  /** The component catalog and the text measurer the applier draws the new markings with. */
  readonly catalog: () => ComponentCatalog;
  readonly measure: () => TextMeasurer;
  /** The open page: the containers the result creates without naming a page land on it. */
  readonly page?: () => string | undefined;
  /** The open "Only me" perspective (`null` = Main): what the import creates lands in Main, so it is refused. */
  readonly perspective?: () => string | null;
}

/** How many items of each kind; an arrow is counted as an arrow, not as a marking. */
export interface ImportCounts {
  readonly containers: number;
  readonly markings: number;
  readonly annotations: number;
  readonly arrows: number;
}

/** What Import would do: the counts by kind, the plugin's warnings and the checked result. */
export interface ImportPreview {
  readonly choice: FormatChoice;
  /** The projection the plugin read (the result's references are its). */
  readonly input: FormatInput;
  /** The result as `checkFormatResult` accepted it: what Import applies, with no new run. */
  readonly result: FormatResult;
  readonly created: ImportCounts;
  readonly updated: ImportCounts;
  readonly warnings: readonly string[];
  /** What the rules noted while applying (a component missing from the catalog, an ignored `near`, …). */
  readonly notes: readonly string[];
}

export type ImportInFormatError =
  /** The file does not have the format's extension (refused before it is read). */
  | { readonly kind: 'extension'; readonly extension: string }
  /** The file is above the limit (refused before it is read). */
  | { readonly kind: 'size' }
  | { readonly kind: 'read' }
  | { readonly kind: 'save' }
  | { readonly kind: 'project' }
  /** A perspective other than Main is open: Import would be refused. */
  | { readonly kind: 'principal-only' }
  /** Scope `container` with a container the project does not have. */
  | { readonly kind: 'container' }
  | { readonly kind: 'plugin'; readonly failure: FormatFailure }
  /** The result breaks the contract: the first problem, and how many more there are. */
  | {
      readonly kind: 'result';
      readonly code: FormatResultProblemCode;
      readonly path: string;
      readonly message: string;
      readonly more: number;
    }
  /** The model's rules refuse an operation: its code, its message and where it is. */
  | {
      readonly kind: 'apply';
      readonly code: string;
      readonly path: string;
      readonly message: string;
    };

export type ImportInFormatResult =
  | { readonly ok: true; readonly preview: ImportPreview }
  | { readonly ok: false; readonly error: ImportInFormatError };

const refuse = (error: ImportInFormatError): ImportInFormatResult => ({
  ok: false,
  error,
});

/** The extension or the size of the file, before anything reads it. */
function fileProblem(choice: FormatChoice, file: ImportFile): ImportInFormatError | null {
  const extension = choice.extension;
  if (!file.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
    return { kind: 'extension', extension };
  }
  return file.size > FORMAT_PLUGIN_LIMITS.parseTextBytes ? { kind: 'size' } : null;
}

/** The container the plugin reads: scope `container` takes the chosen one (or none); scope `project` takes none. */
function importTarget(
  project: Project,
  choice: FormatChoice,
  container: string | null | undefined,
): { readonly target: string | null } | null {
  if (choice.scope !== 'container' || container === null || container === undefined) {
    return { target: null };
  }
  return project.containers.some((c) => c.id === container)
    ? { target: container }
    : null;
}

/** The counts of `items` by kind, in `p`: an arrow is a marking of `arrows`. */
export function countItems(p: Project, items: readonly AppliedItem[]): ImportCounts {
  const index = projectIndex(p);
  const counts = { containers: 0, markings: 0, annotations: 0, arrows: 0 };
  for (const item of items) {
    if (item.kind === 'i') counts.containers++;
    else if (item.kind === 'a') counts.annotations++;
    else if (index.arrows.has(item.id)) counts.arrows++;
    else counts.markings++;
  }
  return counts;
}

/**
 * Where an applier error is (the value that has the wrong type, or else the operation) and what it
 * says without repeating the path.
 */
export function applyErrorAt(error: FormatApplyError): {
  readonly path: string;
  readonly message: string;
} {
  const at = error.details.path;
  const path = typeof at === 'string' ? at : `operations[${error.index}]`;
  const prefix = `${path}: `;
  const message = error.message.startsWith(prefix)
    ? error.message.slice(prefix.length)
    : error.message;
  return { path, message };
}

/** The result of `parse` as the contract accepts it, or the error to show. */
function checkedResult(
  value: unknown,
  input: FormatInput,
): { readonly result: FormatResult } | ImportInFormatError {
  const checked = checkFormatResult(value, input);
  if (checked.ok) return { result: checked.result };
  const [first, ...rest] = checked.problems;
  return {
    kind: 'result',
    code: first!.code,
    path: first!.path,
    message: first!.message,
    more: rest.length,
  };
}

/** What the plugin's `parse` returned, from the file's text: the checked result or the error. */
async function parsedResult(
  deps: ImportInFormatDeps,
  choice: FormatChoice,
  text: string,
  input: FormatInput,
): Promise<{ readonly result: FormatResult } | ImportInFormatError> {
  const outcome = await deps.run(choice.plugin, 'parse', [text, input]);
  if (!outcome.ok) return { kind: 'plugin', failure: outcome.failure };
  return checkedResult(outcome.value, input);
}

/** Reads the file's text; `null` when it cannot be read. */
async function readText(file: ImportFile): Promise<string | null> {
  try {
    return await file.text();
  } catch (error) {
    reportError('formatActions.read', error);
    return null;
  }
}

/** Runs `parse` and the applier on a copy: the preview, or the error. */
async function previewOf(
  deps: ImportInFormatDeps,
  choice: FormatChoice,
  text: string,
  container: string | null | undefined,
): Promise<ImportInFormatResult> {
  const project = deps.project();
  if (project === null) return refuse({ kind: 'project' });
  const found = importTarget(project, choice, container);
  if (found === null) return refuse({ kind: 'container' });
  const input = projectionOf(deps, project, choice, found.target, true);
  if (input === null) return refuse({ kind: 'project' });
  const parsed = await parsedResult(deps, choice, text, input);
  if ('kind' in parsed) return refuse(parsed);
  const outcome = applyFormatResult(project, parsed.result, {
    input,
    catalog: deps.catalog(),
    measure: deps.measure(),
    page: deps.page?.(),
  });
  if (!outcome.ok) {
    return refuse({
      kind: 'apply',
      code: outcome.error.code,
      ...applyErrorAt(outcome.error),
    });
  }
  return {
    ok: true,
    preview: {
      choice,
      input,
      result: parsed.result,
      created: countItems(outcome.project, outcome.created),
      updated: countItems(outcome.project, outcome.updated),
      warnings: outcome.warnings,
      notes: outcome.notes,
    },
  };
}

/**
 * The preview of importing `file` in `choice`'s format (and `container`, the target of scope
 * `container`; none lets the plugin create it). The file is checked, then read; the pending changes
 * are saved before the plugin runs (and a save that fails stops it); the project does not change.
 */
export async function previewImport(
  deps: ImportInFormatDeps,
  choice: FormatChoice,
  file: ImportFile,
  container?: string | null,
): Promise<ImportInFormatResult> {
  const problem = fileProblem(choice, file);
  if (problem !== null) return refuse(problem);
  if ((deps.perspective?.() ?? null) !== null) return refuse({ kind: 'principal-only' });
  const text = await readText(file);
  if (text === null) return refuse({ kind: 'read' });
  const saved = await deps.flush();
  if (!saved.ok) return refuse({ kind: 'save' });
  return previewOf(deps, choice, text, container);
}

/**
 * What Import selects: the markings and arrows it created; with none, the containers it created;
 * with only changes, nothing (the selection stays as it is).
 */
export function importSelection(
  p: Project,
  created: readonly AppliedItem[],
): SelectionItem[] {
  const index = projectIndex(p);
  const items: SelectionItem[] = created
    .filter((c) => c.kind === 'm')
    .map((c) => ({ kind: index.arrows.has(c.id) ? 'arrow' : 'marking', id: c.id }));
  if (items.length > 0) return items;
  return created.filter((c) => c.kind === 'i').map((c) => ({ kind: 'image', id: c.id }));
}
