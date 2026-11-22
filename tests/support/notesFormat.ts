import { readFileSync } from 'node:fs';
import {
  parseSpecText,
  type FormatFunction,
  type FormatOutcome,
  type FormatRunner,
  type Spec,
} from '../../src/model';

// A stand-in for the QuickJS / sandbox executor over the plugin of `tests/fixtures/format-library/`
// (the `notes` format, a line per item): the format checks and the app's tests run the same plugin
// logic without a sandbox. A "plugin text" is a key that picks a behavior.

export const FORMAT_LIB_DIR = 'tests/fixtures/format-library';
export const FORMAT_LIB_SPEC_FILE = 'format-library.spec.json';
export const NOTES_EXAMPLE = readFileSync(`${FORMAT_LIB_DIR}/examples/notes.txt`, 'utf8');

export function notesSpecOf(edit?: (spec: Record<string, unknown>) => void): Spec {
  const data = JSON.parse(
    readFileSync(`${FORMAT_LIB_DIR}/${FORMAT_LIB_SPEC_FILE}`, 'utf8'),
  ) as Record<string, unknown>;
  edit?.(data);
  const parsed = parseSpecText(JSON.stringify(data));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export const NOTES_PLUGIN = 'plugins/notes.js';

interface Row {
  readonly values: { readonly key: string; readonly value: string };
}
interface Annotation {
  readonly name?: string;
  readonly values: { readonly title?: string };
  readonly rows: { readonly tags?: readonly Row[] };
}
interface Input {
  readonly annotations: readonly Annotation[];
}

export const ok = (value: unknown): FormatOutcome => ({ ok: true, value });
export const fail = (message: string, phase?: 'load' | 'call'): FormatOutcome => ({
  ok: false,
  failure: { code: 'plugin-failed', message, ...(phase ? { phase } : {}) },
});

export function notesGenerate(input: Input): string {
  return (
    input.annotations
      .map((a) =>
        [a.values.title ?? a.name ?? '']
          .concat((a.rows.tags ?? []).map((r) => `  ${r.values.key}=${r.values.value}`))
          .join('\n'),
      )
      .join('\n') + '\n'
  );
}

export function notesParse(text: string): unknown {
  const items: { title: string; tags: { key: string; value: string }[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    if (line.startsWith(' ')) {
      const cut = line.indexOf('=');
      items[items.length - 1]!.tags.push({
        key: line.slice(2, cut),
        value: line.slice(cut + 1),
      });
    } else {
      items.push({ title: line, tags: [] });
    }
  }
  return {
    operations: [
      {
        op: 'add_container',
        as: '$notes',
        name: 'Notes',
        width: 400,
        height: 600,
        background: '#FFFFFF',
      },
      ...items.map((item, index) => ({
        op: 'create_marking',
        container: '$notes',
        rect: { x: 10, y: 10 + index * 60, width: 200, height: 50 },
        annotation: {
          type: 'format-lib/item',
          values: { title: item.title, tags: item.tags },
        },
      })),
    ],
    warnings: [],
  };
}

/** What a plugin source (the text `read` gives) does when run; the fake of QuickJS. */
export type Behavior = (fn: FormatFunction, args: readonly unknown[]) => FormatOutcome;

export const NOTES: Behavior = (fn, args) =>
  fn === 'generate'
    ? ok(notesGenerate(args[0] as Input))
    : ok(notesParse(args[0] as string));

export function runnerOf(behaviors: Record<string, Behavior>): FormatRunner {
  return (source, fn, args) => {
    const behavior = behaviors[source];
    return Promise.resolve(
      behavior === undefined ? fail('unknown plugin') : behavior(fn, args),
    );
  };
}

/** The text each plugin key stands for in a test package (`THROWS-ON-LOAD`, `EMPTY`, `NOTES`). */
export function behaviorsOf(files: Record<string, string>): Record<string, Behavior> {
  const found: Record<string, Behavior> = { NOTES };
  for (const text of Object.values(files)) {
    if (text.startsWith('THROWS-ON-LOAD'))
      found[text] = () => fail('Error: boom', 'load');
    if (text === 'EMPTY') found[text] = (fn) => fail(`the plugin does not define ${fn}`);
  }
  return found;
}
