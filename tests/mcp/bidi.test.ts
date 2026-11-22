import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

// Stage #2448 (BD1, decision 2): `bidiRuns` splits a text into directional runs with the Unicode bidirectional
// algorithm (UAX #9) and gives them in visual order. `bidi-js` is counted through a spy to check the fast path.

const calls = vi.hoisted(() => ({ levels: 0 }));

vi.mock('bidi-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bidi-js')>();
  return {
    default: () => {
      const real = actual.default();
      return {
        ...real,
        getEmbeddingLevels: (...args: Parameters<typeof real.getEmbeddingLevels>) => {
          calls.levels++;
          return real.getEmbeddingLevels(...args);
        },
      };
    },
  };
});

const { bidiRuns } = await import('../../mcp/image/bidi');

const run = (start: number, end: number, rtl: boolean) => ({ start, end, rtl });

describe('bidiRuns (mcp/image/bidi.ts)', () => {
  it('a text below U+0590 in ltr is one left-to-right run, without calling bidi-js', () => {
    const before = calls.levels;
    expect(bidiRuns('Pay invoice 123, (ok).', 'ltr')).toEqual([run(0, 22, false)]);
    expect(bidiRuns('\u00e9', 'ltr')).toEqual([run(0, 1, false)]);
    expect(calls.levels).toBe(before);
  });

  it('a left-to-right letter above U+FFFF is not a neutral: it keeps its order in an rtl base', () => {
    // MATHEMATICAL BOLD CAPITAL A, B, C (surrogate pairs): strong left-to-right, like Chromium
    expect(bidiRuns('\u{1D400}\u{1D401}\u{1D402}', 'rtl')).toEqual([run(0, 6, false)]);
  });

  it('an empty text has no runs', () => {
    expect(bidiRuns('', 'ltr')).toEqual([]);
    expect(bidiRuns('', 'rtl')).toEqual([]);
  });

  it('a Hebrew run inside a Latin line is its own right-to-left run, in place', () => {
    // `abc ` | `אבג` | ` def`
    expect(bidiRuns('abc אבג def', 'ltr')).toEqual([
      run(0, 4, false),
      run(4, 7, true),
      run(7, 11, false),
    ]);
  });

  it('a Hebrew-only text in ltr is one right-to-left run', () => {
    expect(bidiRuns('אבג', 'ltr')).toEqual([run(0, 3, true)]);
  });

  it('rtl with Latin: the runs come in visual order, from the left', () => {
    // logical `abc` | ` אבג ` | `def` in an rtl paragraph (the spaces between L and R take the paragraph's direction):
    // it reads right to left, so on screen the last logical run is the leftmost
    expect(bidiRuns('abc אבג def', 'rtl')).toEqual([
      run(8, 11, false),
      run(3, 8, true),
      run(0, 3, false),
    ]);
  });

  it('a number inside an rtl line keeps its left-to-right order', () => {
    // `אבג ` | `123` | ` דה`: visual order is the logical one reversed, and the digits stay a left-to-right run
    expect(bidiRuns('אבג 123 דה', 'rtl')).toEqual([
      run(7, 10, true),
      run(4, 7, false),
      run(0, 4, true),
    ]);
  });

  it('a neutral at the edge of an rtl line goes to the right-to-left side (the period of Pay invoice.)', () => {
    // the period takes the paragraph's direction: it is the leftmost run, and `Pay invoice` stays in order
    expect(bidiRuns('Pay invoice.', 'rtl')).toEqual([
      run(11, 12, true),
      run(0, 11, false),
    ]);
    // in ltr it is the fast path: the period stays on the right
    expect(bidiRuns('Pay invoice.', 'ltr')).toEqual([run(0, 12, false)]);
  });

  it('brackets around Hebrew in an rtl line are one right-to-left run (mirroring is HarfBuzz’s)', () => {
    expect(bidiRuns('א(ב)', 'rtl')).toEqual([run(0, 4, true)]);
  });

  it('a surrogate pair is never split and an emoji is a neutral', () => {
    expect(bidiRuns('a\u{1F600}b', 'ltr')).toEqual([run(0, 4, false)]);
    const bounds = bidiRuns('א\u{1F600}ב', 'rtl').flatMap((r) => [r.start, r.end]);
    expect(bounds).not.toContain(2);
    // between two Hebrew words the emoji joins them in one right-to-left run, as in the browser
    expect(bidiRuns('אבג \u{1F600} דהו', 'ltr')).toEqual([run(0, 10, true)]);
    expect(bidiRuns('abc \u{1F600} def', 'rtl')).toEqual([run(0, 10, false)]);
  });

  it('every run covers the text once, whatever the direction', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const text = 'abc אבג 12 (דה) x.';
      const covered = bidiRuns(text, direction)
        .flatMap((r) => Array.from({ length: r.end - r.start }, (_, i) => r.start + i))
        .sort((a, b) => a - b);
      expect(covered).toEqual(Array.from({ length: text.length }, (_, i) => i));
    }
  });
});

// Decision 2 and the acceptance criteria: only `bidi.ts` imports `bidi-js`, only `harfbuzz.ts` imports `bidi.ts`, and the
// scene rasterizer that the e2e specs bundle for Chromium pulls in neither.
describe('where bidi-js is imported', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(dir, entry.name))
        : /\.(ts|tsx|mjs)$/.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
    );
  const importing = (pattern: RegExp) =>
    ['mcp', 'src', 'scripts']
      .flatMap(sources)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .sort();

  it('only mcp/image/bidi.ts imports bidi-js', () => {
    expect(importing(/from 'bidi-js'/)).toEqual([join('mcp', 'image', 'bidi.ts')]);
  });

  it('only mcp/image/harfbuzz.ts imports bidi.ts', () => {
    expect(importing(/from '\.\/bidi'/)).toEqual([join('mcp', 'image', 'harfbuzz.ts')]);
  });

  it('the scene rasterizer bundles neither bidi.ts nor bidi-js nor HarfBuzz', async () => {
    const result = await build({
      stdin: {
        contents: "import './mcp/image/sceneRaster';",
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'iife',
      metafile: true,
    });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((file) => /bidi|harfbuzz/.test(file))).toEqual([]);
  });
});
