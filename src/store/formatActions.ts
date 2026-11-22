import {
  buildFormatInput,
  type FormatFailure,
  type FormatFunction,
  type FormatRunner,
  type FormatSlotDrawings,
  type Project,
} from '../model';
import type { ProjectCatalog } from './projectCatalogs';
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
  const target = choice.scope === 'container' ? (container ?? null) : null;
  const found =
    target === null ? undefined : project.containers.find((c) => c.id === target);
  if (choice.scope === 'container' && found === undefined) {
    return fail({ kind: 'container' });
  }
  let input;
  try {
    const drawings = deps.drawings?.(project);
    input = buildFormatInput(project, choice.ref, {
      projectName: project.project.name,
      ...(target === null ? {} : { target }),
      ...(drawings === undefined ? {} : { drawings }),
    });
  } catch (error) {
    reportError('formatActions.projection', error);
    return fail({ kind: 'project' });
  }
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
  const name = found?.name ?? project.project.name;
  const file = new File([outcome.value], exportFileName(name, choice.extension), {
    type: 'text/plain;charset=utf-8',
  });
  return { ok: true, file };
}
