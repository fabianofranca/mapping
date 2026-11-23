import { describe, expect, it } from 'vitest';
import { approximateMeasurer, formatCheckIssues, type Spec } from '../../src/model';
import {
  FORMAT_LIB_SPEC_FILE,
  NOTES,
  NOTES_EXAMPLE,
  NOTES_PLUGIN,
  behaviorsOf,
  fail,
  notesParse,
  notesSpecOf,
  ok,
  runnerOf,
  type Behavior,
} from '../support/notesFormat';

// The format checks of the model (stage #2035, AF5): levels 2 and 3 of the formats with an injected
// runner. The fake runner stands in for the plugin of `tests/fixtures/format-library/` (the `notes`
// format, a line per item); the same cases run against QuickJS in `tests/mcp/formatPlugins.test.ts`.

const FILES: Record<string, string> = {
  [NOTES_PLUGIN]: 'NOTES',
  'examples/notes.txt': NOTES_EXAMPLE,
};
const specOf = notesSpecOf;
const PLUGIN = NOTES_PLUGIN;

function reader(files: Record<string, string>) {
  return (path: string): Promise<string | null> => Promise.resolve(files[path] ?? null);
}

async function issuesOf(options: {
  behavior?: Behavior;
  files?: Record<string, string>;
  spec?: Spec;
  level?: 2 | 3;
}) {
  const files = options.files ?? FILES;
  return formatCheckIssues(
    { spec: options.spec ?? specOf(), specPath: FORMAT_LIB_SPEC_FILE },
    reader(files),
    options.level ?? 3,
    {
      run: runnerOf({ ...behaviorsOf(files), NOTES: options.behavior ?? NOTES }),
      measure: approximateMeasurer,
    },
  );
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

  it('a plugin that goes past the time limit is run once, not once per function (R44.4: about 6 s, not 10)', async () => {
    const calls: string[] = [];
    const timesOut: Behavior = (fn) => {
      calls.push(fn);
      return {
        ok: false,
        failure: { code: 'plugin-timeout', message: 'went past the time limit of 5 s' },
      };
    };
    const issues = await issuesOf({ behavior: timesOut, level: 2 });
    expect(calls).toEqual(['generate']);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/plugin-timeout/);
    expect(issues[0]!.message).toMatch(/time limit of 5 s/);
  });

  it('a plugin that throws gives the plugin path and line:column (R44.6, as the MCP server words it)', async () => {
    const throwing: Behavior = () => ({
      ok: false,
      failure: { code: 'plugin-failed', message: 'Error: boom', line: 1, column: 100 },
    });
    const issues = await issuesOf({ behavior: throwing });
    expect(issues[0]!.message).toMatch(/plugin-failed/);
    expect(issues[0]!.message).toMatch(/Error: boom/);
    expect(issues[0]!.message).toContain(`${PLUGIN}:1:100`);
  });
});
