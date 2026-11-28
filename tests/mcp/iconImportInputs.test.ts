// IF1 (stage #2931): `import_icons` reads its `svg` from a scratch folder too (read-only, like the
// `operationsFile`), and `ignoreFilters` imports a file with a `filter` without it, with a warning.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

const PACKAGE = 'examples/libraries/drawing-keys';
const FIXTURES = 'tests/fixtures/svg-icons';

interface Imported {
  formatVersion: number;
  added: string[];
  replaced: string[];
  skipped: { name: string; reason: string }[];
  errors: { file: string; message: string }[];
  warnings: { file: string; message: string }[];
  written: boolean;
}

const WARNING = {
  file: 'inner-shadow.svg',
  message: 'dropped in SVG: g filter="url(#filter0_i_1_2)" (ignoreFilters)',
};

let base: string;
let root: string;
let scratch: string;
let mcp: Connection;
let plain: Connection;
let pristine: string;

const iconsPath = (): string => join(root, 'dk/icons/icons.json');
const readIcons = (): { icons: Record<string, unknown> } =>
  JSON.parse(readFileSync(iconsPath(), 'utf8')) as { icons: Record<string, unknown> };

/** Every file under `dir` with its bytes, to compare before and after. */
function snapshot(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else
        found.push(
          `${relative(dir, full)}:${statSync(full).size}:${readFileSync(full, 'base64')}`,
        );
    }
  };
  walk(dir);
  return found.sort();
}

const importIcons = (args: Record<string, unknown>, via: Connection = mcp) =>
  via.call<Imported>('import_icons', { path: 'dk', ...args });

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-import-inputs-'));
  root = join(base, 'root');
  scratch = join(base, 'scratch');
  mkdirSync(join(scratch, 'icons'), { recursive: true });
  mkdirSync(join(scratch, 'links'), { recursive: true });
  mkdirSync(join(scratch, 'dup'), { recursive: true });
  mkdirSync(join(root, 'dup'), { recursive: true });
  mkdirSync(join(base, 'outside'), { recursive: true });
  cpSync(PACKAGE, join(root, 'dk'), { recursive: true });
  for (const file of ['icon-flag.svg', 'icon-stroked.svg'])
    cpSync(join(FIXTURES, file), join(scratch, 'icons', file));
  // A relative path in both: the root's wins.
  cpSync(join(FIXTURES, 'icon-shapes.svg'), join(root, 'dup/icon-shapes.svg'));
  cpSync(join(FIXTURES, 'icon-flag.svg'), join(scratch, 'dup/icon-flag.svg'));
  // A folder of the scratch folder with a link that leaves the roots and the scratch folders.
  cpSync(join(FIXTURES, 'icon-flag.svg'), join(scratch, 'links/icon-flag.svg'));
  cpSync(join(FIXTURES, 'icon-stroked.svg'), join(base, 'outside/leaked.svg'));
  symlinkSync(join(base, 'outside/leaked.svg'), join(scratch, 'links/leaked.svg'));
  cpSync(join(FIXTURES, 'filter/inner-shadow.svg'), join(scratch, 'inner-shadow.svg'));
  cpSync(join(FIXTURES, 'icon-flag.svg'), join(base, 'outside/icon-flag.svg'));
  // The package state before the import, as R39.1 sets it up: without its `icon-` entries.
  const file = JSON.parse(readFileSync(join(root, 'dk/icons/icons.json'), 'utf8')) as {
    icons: Record<string, unknown>;
  };
  for (const name of Object.keys(file.icons))
    if (name.startsWith('icon-')) delete file.icons[name];
  pristine = `${JSON.stringify(file, null, 2)}\n`;
  writeFileSync(join(root, 'dk/icons/icons.json'), pristine);
  mcp = await connect([root], { args: ['--scratch', scratch] });
  plain = await connect([root]);
});

// Each test starts from the package as it was copied.
beforeEach(() => writeFileSync(iconsPath(), pristine));

afterAll(async () => {
  await mcp?.close();
  await plain?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('svg from the scratch folder', () => {
  it('imports a relative folder and writes nothing in the scratch folder', async () => {
    const before = snapshot(scratch);
    const result = ok(await importIcons({ svg: 'icons' }));
    expect(result.added).toEqual(['icon-flag', 'icon-stroked']);
    expect(result.written).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(Object.keys(readIcons().icons)).toEqual(
      expect.arrayContaining(['icon-flag', 'icon-stroked']),
    );
    expect(snapshot(scratch)).toEqual(before);
  });

  it('imports an absolute .svg path and a single relative file', async () => {
    const absolute = ok(
      await importIcons({
        svg: join(scratch, 'icons/icon-flag.svg'),
        name: 'abs-flag',
        dryRun: true,
      }),
    );
    expect(absolute.added).toEqual(['abs-flag']);
    expect(absolute.written).toBe(false);
    const single = ok(
      await importIcons({ svg: 'icons/icon-stroked.svg', name: 'one', dryRun: true }),
    );
    expect(single.added).toEqual(['one']);
  });

  it('a relative path in a root and in the scratch folder resolves to the root', async () => {
    const result = ok(await importIcons({ svg: 'dup', dryRun: true }));
    expect(result.added).toEqual(['icon-shapes']);
  });

  it('a link that leaves the roots and the scratch folders is an error of that entry only', async () => {
    const result = ok(await importIcons({ svg: 'links', name: undefined, dryRun: true }));
    expect(result.added).toEqual(['icon-flag']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ file: 'leaked.svg' });
    expect(result.errors[0]?.message).toMatch(/^outside-roots: /);
  });

  it('refuses a path outside both areas and reports a missing one', async () => {
    for (const svg of [join(base, 'outside/icon-flag.svg'), '../outside/icon-flag.svg'])
      expect(errorOf(await importIcons({ svg, dryRun: true })).code).toBe(
        'outside-roots',
      );
    expect(errorOf(await importIcons({ svg: 'nowhere', dryRun: true })).code).toBe(
      'path-not-found',
    );
  });

  it('without --scratch the same relative path is not found', async () => {
    const error = errorOf(await importIcons({ svg: 'icons', dryRun: true }, plain));
    expect(error.code).toBe('path-not-found');
  });
});

describe('ignoreFilters', () => {
  it('refuses a file with a filter by default, with no warnings', async () => {
    const result = ok(await importIcons({ svg: 'inner-shadow.svg', dryRun: true }));
    expect(result.added).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ file: 'inner-shadow.svg' });
    expect(result.errors[0]?.message).toContain('unsupported in SVG: g filter');
  });

  it('previews, imports and keeps warning on a second call', async () => {
    const preview = ok(
      await importIcons({ svg: 'inner-shadow.svg', ignoreFilters: true, dryRun: true }),
    );
    expect(preview.added).toEqual(['inner-shadow']);
    expect(preview.written).toBe(false);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([WARNING]);
    expect(readIcons().icons['inner-shadow']).toBeUndefined();

    const real = ok(await importIcons({ svg: 'inner-shadow.svg', ignoreFilters: true }));
    expect(real.added).toEqual(['inner-shadow']);
    expect(real.written).toBe(true);
    expect(real.warnings).toEqual([WARNING]);
    expect(readIcons().icons['inner-shadow']).toEqual({
      paths: [{ d: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z', fill: true }],
    });
    expect(readFileSync(iconsPath(), 'utf8')).not.toContain('filter');

    const again = ok(await importIcons({ svg: 'inner-shadow.svg', ignoreFilters: true }));
    expect(again.added).toEqual([]);
    expect(again.skipped).toEqual([
      expect.objectContaining({ name: 'inner-shadow', reason: 'icon-exists' }),
    ]);
    expect(again.warnings).toEqual([WARNING]);
  });
});
