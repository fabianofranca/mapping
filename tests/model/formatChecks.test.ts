import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  formatCheckIssues,
  parseSpecText,
  type FormatFunction,
  type FormatOutcome,
  type FormatRunner,
  type Spec,
} from '../../src/model';

// The format checks of the model (stage #2035, AF5): levels 2 and 3 of the formats with an injected
// runner. The fake runner stands in for the plugin of `tests/fixtures/format-library/` (the `notes`
// format, a line per item); the same cases run against QuickJS in `tests/mcp/formatPlugins.test.ts`.

const DIR = 'tests/fixtures/format-library';
const EXAMPLE = readFileSync(`${DIR}/examples/notes.txt`, 'utf8');

function specOf(edit?: (spec: Record<string, unknown>) => void): Spec {
  const data = JSON.parse(
    readFileSync(`${DIR}/format-library.spec.json`, 'utf8'),
  ) as Record<string, unknown>;
  edit?.(data);
  const parsed = parseSpecText(JSON.stringify(data));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const PLUGIN = 'plugins/notes.js';

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

const ok = (value: unknown): FormatOutcome => ({ ok: true, value });
const fail = (message: string, phase?: 'load' | 'call'): FormatOutcome => ({
  ok: false,
  failure: { code: 'plugin-failed', message, ...(phase ? { phase } : {}) },
});

function notesGenerate(input: Input): string {
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

function notesParse(text: string): unknown {
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
type Behavior = (fn: FormatFunction, args: readonly unknown[]) => FormatOutcome;

const NOTES: Behavior = (fn, args) =>
  fn === 'generate'
    ? ok(notesGenerate(args[0] as Input))
    : ok(notesParse(args[0] as string));

function runnerOf(behaviors: Record<string, Behavior>): FormatRunner {
  return (source, fn, args) => {
    const behavior = behaviors[source];
    return Promise.resolve(
      behavior === undefined ? fail('unknown plugin') : behavior(fn, args),
    );
  };
}

function reader(files: Record<string, string>) {
  return (path: string): Promise<string | null> => Promise.resolve(files[path] ?? null);
}

const FILES = { [PLUGIN]: 'NOTES', 'examples/notes.txt': EXAMPLE };

async function issuesOf(options: {
  behavior?: Behavior;
  files?: Record<string, string>;
  spec?: Spec;
  level?: 2 | 3;
}) {
  const files = options.files ?? FILES;
  return formatCheckIssues(
    { spec: options.spec ?? specOf(), specPath: 'format-library.spec.json' },
    reader(files),
    options.level ?? 3,
    {
      run: runnerOf({ NOTES: options.behavior ?? NOTES, ...behaviorsOf(files) }),
      measure: approximateMeasurer,
    },
  );
}

/** Every plugin text other than `NOTES` that the case writes is its own behavior key (it throws on load). */
function behaviorsOf(files: Record<string, string>): Record<string, Behavior> {
  const found: Record<string, Behavior> = {};
  for (const text of Object.values(files)) {
    if (text.startsWith('THROWS-ON-LOAD'))
      found[text] = () => fail('Error: boom', 'load');
    if (text === 'EMPTY') found[text] = (fn) => fail(`the plugin does not define ${fn}`);
  }
  return found;
}

describe('formatCheckIssues', () => {
  it('a valid format runs its example in both directions and gives no problem', async () => {
    expect(await issuesOf({})).toEqual([]);
  });

  it('a package with no format has nothing to check', async () => {
    const spec = specOf((s) => {
      delete s['fileFormats'];
    });
    expect(await issuesOf({ spec })).toEqual([]);
  });

  it('a plugin that fails while loading is an error at fileFormats[0], also at level 2', async () => {
    const files = { ...FILES, [PLUGIN]: 'THROWS-ON-LOAD' };
    const issues = await issuesOf({ files, level: 2 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      file: 'format-library.spec.json',
      path: 'fileFormats[0]',
      severity: 'error',
    });
    expect(issues[0]!.message).toMatch(/boom/);
  });

  it('a plugin that loads without functions defines neither generate nor parse', async () => {
    const issues = await issuesOf({ files: { ...FILES, [PLUGIN]: 'EMPTY' }, level: 2 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: 'fileFormats[0]' });
    expect(issues[0]!.message).toBe(
      'the plugin plugins/notes.js defines neither generate nor parse',
    );
  });

  it('an example that does not round-trip cites the first differing line, and level 2 does not run it', async () => {
    const files = { ...FILES, 'examples/notes.txt': 'Alpha\n\n  color=red\nBeta\n' };
    const issues = await issuesOf({ files });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      file: 'format-library.spec.json',
      path: 'fileFormats[0].examples[0]',
      severity: 'error',
    });
    expect(issues[0]!.message).toMatch(
      /^example "basic": it does not round-trip: line 2/,
    );
    expect(await issuesOf({ files, level: 2 })).toEqual([]);
  });

  it('a function that throws makes the example fail with the failure code and message', async () => {
    const throwing: Behavior = (fn) =>
      fn === 'generate' ? fail('Error: nope') : ok({ operations: [] });
    const issues = await issuesOf({ behavior: throwing });
    expect(issues[0]).toMatchObject({ path: 'fileFormats[0].examples[0]' });
    expect(issues[0]!.message).toMatch(/nope/);
  });

  it('a parse-only format only has to apply its example; an operation the model refuses fails it', async () => {
    const parseOnly: Behavior = (fn, args) =>
      fn === 'parse'
        ? ok(notesParse(args[0] as string))
        : fail('the plugin does not define generate');
    expect(await issuesOf({ behavior: parseOnly })).toEqual([]);

    const refused: Behavior = (fn) =>
      fn === 'parse'
        ? ok({
            operations: [
              {
                op: 'create_marking',
                container: '$missing',
                rect: { x: 0, y: 0, width: 10, height: 10 },
              },
            ],
          })
        : fail('the plugin does not define generate');
    const issues = await issuesOf({ behavior: refused });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('fileFormats[0].examples[0]');
    expect(issues[0]!.message).toMatch(/^example "basic": parse: /);
  });

  it('a generate-only format compares generate(input) with the file, and needs `input`', async () => {
    const generateOnly: Behavior = (fn) =>
      fn === 'generate'
        ? ok('Alpha\n  color=red\n  size=2\nBeta\n')
        : fail('the plugin does not define parse');
    const spec = specOf((s) => {
      (s['fileFormats'] as { examples: unknown[] }[])[0]!.examples = [
        { name: 'one', input: 'examples/input.json', file: 'examples/notes.txt' },
      ];
    });
    const files = { ...FILES, 'examples/input.json': '{}' };
    expect(await issuesOf({ behavior: generateOnly, spec, files })).toEqual([]);

    const noInput = await issuesOf({ behavior: generateOnly });
    expect(noInput[0]!.message).toMatch(/only generates needs `input`/);
  });
});
