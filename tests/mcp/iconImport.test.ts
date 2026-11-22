// FG3 (stage #2087): `import_icons` turns SVG files into entries of the package's icons file.
// Each case runs on a temporary root, through the stdio client, with the FG2 fixtures.
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

const FIXTURES = 'tests/fixtures/svg-icons';
const PACKAGE = 'tests/fixtures/icons';
/** The fixtures that convert (every one but the `transform` error), in name order. */
const GOOD = [
  'icon-current-color',
  'icon-figma-evenodd',
  'icon-flag',
  'icon-shapes',
  'icon-stroked',
];

interface Imported {
  file: string;
  formatVersion: number;
  added: string[];
  replaced: string[];
  skipped: { name: string; file: string; reason: string }[];
  errors: { file: string; message: string }[];
  written: boolean;
  hint: string;
}
interface Failed {
  error: { code: string; message: string; hint?: string };
}
interface IconsFile {
  format: string;
  formatVersion: number;
  viewBox: [number, number];
  icons: Record<string, { viewBox?: number[]; mirror?: boolean; paths: unknown[] }>;
}
interface Validated {
  valid: boolean;
  errors: { file: string; path: string; message: string }[];
  warnings: unknown[];
}

let base: string;
let root: string;
let outside: string;
let mcp: Connection;
let counter = 0;

/** A fresh copy of the test package under the root; `mutate` adjusts its icons file first. */
function library(mutate?: (set: IconsFile) => void): string {
  const name = `lib-${++counter}`;
  cpSync(PACKAGE, join(root, name), { recursive: true });
  if (mutate !== undefined) {
    const file = join(root, name, 'icons', 'set.json');
    const set = JSON.parse(readFileSync(file, 'utf8')) as IconsFile;
    mutate(set);
    writeFileSync(file, `${JSON.stringify(set, null, 2)}\n`);
  }
  return name;
}

const iconsPath = (lib: string): string => join(root, lib, 'icons', 'set.json');
const readIcons = (lib: string): IconsFile =>
  JSON.parse(readFileSync(iconsPath(lib), 'utf8')) as IconsFile;

/** Copies the good fixtures (and, with `withError`, the `transform` one) to a folder under the root. */
function svgFolder(name: string, withError = false): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const icon of GOOD) cpSync(`${FIXTURES}/${icon}.svg`, join(dir, `${icon}.svg`));
  if (withError)
    cpSync(`${FIXTURES}/icon-transform.svg`, join(dir, 'icon-transform.svg'));
  return name;
}

/** One fixture copied to the root under `name` (a file, not a folder). */
function svgFile(name: string, fixture: string): string {
  cpSync(`${FIXTURES}/${fixture}.svg`, join(root, name));
  return name;
}

/** The specialization of a copy, rewritten by `mutate`. */
function editSpec(lib: string, mutate: (spec: Record<string, unknown>) => void): void {
  const file = join(root, lib, 'icons.spec.json');
  const spec = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  mutate(spec);
  writeFileSync(file, JSON.stringify(spec, null, 2));
}

const failed = (call: { isError: boolean; data: unknown }): Failed['error'] => {
  expect(call.isError).toBe(true);
  return (call.data as Failed).error;
};

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-import-icons-'));
  root = join(base, 'root');
  outside = join(base, 'outside');
  mkdirSync(root, { recursive: true });
  mkdirSync(outside, { recursive: true });
  cpSync(`${FIXTURES}/icon-flag.svg`, join(outside, 'icon-flag.svg'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('import_icons: a folder into an existing file', () => {
  it('adds the icons in name order, raises the file to 3 only because of evenodd, keeps the rest in place', async () => {
    const lib = library((set) => {
      set.formatVersion = 2;
    });
    const before = readIcons(lib);
    const svgs = svgFolder('svgs-folder');
    const result = ok(await mcp.call<Imported>('import_icons', { path: lib, svg: svgs }));
    expect(result).toMatchObject({
      file: 'icons/set.json',
      formatVersion: 3,
      added: GOOD,
      replaced: [],
      skipped: [],
      errors: [],
      written: true,
    });
    expect(result.hint).toContain('validate_library');
    const text = readFileSync(iconsPath(lib), 'utf8');
    const after = JSON.parse(text) as IconsFile;
    expect(Object.keys(after.icons)).toEqual([...Object.keys(before.icons), ...GOOD]);
    for (const name of Object.keys(before.icons))
      expect(after.icons[name]).toEqual(before.icons[name]);
    expect(after.viewBox).toEqual([24, 24]);
    // Only `icon-flag` has a box other than the file's: the others omit their own.
    expect(after.icons['icon-flag']!.viewBox).toEqual([24, 16]);
    expect(after.icons['icon-shapes']!.viewBox).toBeUndefined();
    // 2-space indentation, a final newline, and a `viewBox` on one line.
    expect(text).toMatch(/^\{\n {2}"format": "mapping-icons",\n/);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('"viewBox": [24, 24],');
    expect(text).toContain('"viewBox": [24, 16]');
  });

  it('keeps the version when nothing needs a newer one', async () => {
    const lib = library((set) => {
      set.formatVersion = 2;
    });
    const result = ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFile('only-stroked.svg', 'icon-stroked'),
      }),
    );
    expect(result).toMatchObject({ formatVersion: 2, added: ['only-stroked'] });
    expect(readIcons(lib).formatVersion).toBe(2);
  });

  it('accepts the specialization file as `path` and a single file as `svg`, with `name`', async () => {
    const lib = library();
    const result = ok(
      await mcp.call<Imported>('import_icons', {
        path: `${lib}/icons.spec.json`,
        svg: svgFile('only-stroked-2.svg', 'icon-stroked'),
        name: 'tick',
      }),
    );
    expect(result.added).toEqual(['tick']);
    expect(Object.keys(readIcons(lib).icons)).toContain('tick');
  });
});

describe('import_icons: dryRun', () => {
  it('returns the same response, written false, and leaves the file byte for byte', async () => {
    const lib = library();
    const svgs = svgFolder('svgs-dry');
    const bytes = readFileSync(iconsPath(lib));
    const dry = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: svgs, dryRun: true }),
    );
    expect(dry.written).toBe(false);
    expect(dry.added).toEqual(GOOD);
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
    const real = ok(await mcp.call<Imported>('import_icons', { path: lib, svg: svgs }));
    expect(real.written).toBe(true);
    expect({ ...real, written: false }).toEqual(dry);
  });
});

describe('import_icons: existing names and `replace`', () => {
  it('skips a name that exists with icon-exists; with replace, replaces it in place', async () => {
    const lib = library((set) => {
      set.icons['icon-flag'] = { paths: [{ d: 'M0 0h1v1z' }] };
    });
    const svgs = svgFolder('svgs-exists');
    const skipped = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: svgs }),
    );
    expect(skipped.skipped).toEqual([
      { name: 'icon-flag', file: 'icon-flag.svg', reason: 'icon-exists' },
    ]);
    expect(skipped.added).toEqual(GOOD.filter((n) => n !== 'icon-flag'));
    expect(readIcons(lib).icons['icon-flag']!.paths).toEqual([{ d: 'M0 0h1v1z' }]);

    const lib2 = library((set) => {
      set.icons['icon-flag'] = { paths: [{ d: 'M0 0h1v1z' }] };
    });
    const before = Object.keys(readIcons(lib2).icons);
    const replaced = ok(
      await mcp.call<Imported>('import_icons', { path: lib2, svg: svgs, replace: true }),
    );
    expect(replaced.replaced).toEqual(['icon-flag']);
    expect(replaced.skipped).toEqual([]);
    const after = readIcons(lib2);
    // In place: the key keeps its position.
    expect(Object.keys(after.icons).slice(0, before.length)).toEqual(before);
    expect(after.icons['icon-flag']!.paths).toHaveLength(3);
  });

  it('reports a name that two files share as an error of the second one', async () => {
    const lib = library();
    const dir = join(root, 'svgs-twice');
    mkdirSync(dir, { recursive: true });
    cpSync(`${FIXTURES}/icon-flag.svg`, join(dir, 'Icon Flag.svg'));
    cpSync(`${FIXTURES}/icon-flag.svg`, join(dir, 'icon-flag.svg'));
    const result = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: 'svgs-twice' }),
    );
    expect(result.added).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('icon-flag');
  });
});

describe('import_icons: conversion problems', () => {
  it('puts a file with a transform in errors and writes the others', async () => {
    const lib = library();
    const svgs = svgFolder('svgs-error', true);
    const result = ok(await mcp.call<Imported>('import_icons', { path: lib, svg: svgs }));
    expect(result.errors).toEqual([
      {
        file: 'icon-transform.svg',
        message: 'unsupported in SVG: path transform',
      },
    ]);
    expect(result.added).toEqual(GOOD);
    expect(result.written).toBe(true);
    expect(Object.keys(readIcons(lib).icons)).not.toContain('icon-transform');
  });

  it('writes nothing when every file fails', async () => {
    const lib = library();
    const bytes = readFileSync(iconsPath(lib));
    const dir = join(root, 'svgs-all-bad');
    mkdirSync(dir, { recursive: true });
    cpSync(`${FIXTURES}/icon-transform.svg`, join(dir, 'icon-transform.svg'));
    const result = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: 'svgs-all-bad' }),
    );
    expect(result).toMatchObject({ added: [], written: false });
    expect(result.errors).toHaveLength(1);
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
  });

  it('applies `colors: keep` to the literal colors', async () => {
    const lib = library();
    ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFile('shapes-keep.svg', 'icon-shapes'),
        colors: 'keep',
      }),
    );
    // One color follows the `icon` node with `auto` (`fill: true`); `keep` writes it literally.
    const paths = readIcons(lib).icons['shapes-keep']!.paths as { fill?: unknown }[];
    expect(paths.some((p) => typeof p.fill === 'string')).toBe(true);
    expect(paths.some((p) => p.fill === true)).toBe(false);
  });
});

describe('import_icons: transparent is not a color', () => {
  const CLEAR_BOX =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="transparent"/><path d="M4 4h16v16H4z" fill="#000000"/></svg>';

  it('drops the transparent rect: one path with fill true, in a dry run and for real', async () => {
    const lib = library();
    writeFileSync(join(root, 'clear-box.svg'), CLEAR_BOX);
    const dry = ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: 'clear-box.svg',
        dryRun: true,
      }),
    );
    expect(dry).toMatchObject({ added: ['clear-box'], errors: [], written: false });
    const real = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: 'clear-box.svg' }),
    );
    expect(real).toMatchObject({ added: ['clear-box'], errors: [], written: true });
    expect(readIcons(lib).icons['clear-box']!.paths).toEqual([
      { d: 'M4 4h16v16H4z', fill: true },
    ]);
  });
});

describe('import_icons: the icons file', () => {
  it('creates a declared but missing file, with format, version and the first icon viewBox', async () => {
    const lib = library();
    rmSync(join(root, lib, 'icons'), { recursive: true });
    const result = ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFile('only-flag.svg', 'icon-flag'),
      }),
    );
    expect(result).toMatchObject({ file: 'icons/set.json', added: ['only-flag'] });
    const created = readIcons(lib);
    expect(created).toMatchObject({
      format: 'mapping-icons',
      formatVersion: 1,
      viewBox: [24, 16],
    });
    // The first icon's box is the file's, so the icon omits its own.
    expect(created.icons['only-flag']!.viewBox).toBeUndefined();
    const validated = ok(
      await mcp.call<Validated>('validate_library', { path: lib, level: 1 }),
    );
    expect(validated.errors).toEqual([]);
  });

  it('refuses a specialization without icons, with a hint, and writes nothing', async () => {
    const lib = library();
    editSpec(lib, (spec) => {
      delete spec.icons;
    });
    const bytes = readFileSync(iconsPath(lib));
    const error = failed(
      await mcp.call('import_icons', { path: lib, svg: svgFolder('svgs-nodecl') }),
    );
    expect(error.code).toBe('icons-not-declared');
    expect(error.hint).toContain('"icons"');
    expect(error.hint).toContain('15');
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
    // The specialization itself is never edited.
    expect(
      JSON.parse(readFileSync(join(root, lib, 'icons.spec.json'), 'utf8')),
    ).not.toHaveProperty('icons');
  });

  it('refuses an icons path that is not a .json file or that is the specialization', async () => {
    const lib = library();
    editSpec(lib, (spec) => {
      spec.icons = 'icons.spec.json';
    });
    const spec = readFileSync(join(root, lib, 'icons.spec.json'));
    const error = failed(
      await mcp.call('import_icons', { path: lib, svg: svgFolder('svgs-self') }),
    );
    expect(error.code).toBe('invalid-library');
    expect(readFileSync(join(root, lib, 'icons.spec.json')).equals(spec)).toBe(true);
  });

  it('raises a version 1 file to 2 with mirror, and marks the imported icons', async () => {
    const lib = library();
    expect(readIcons(lib).formatVersion).toBe(1);
    const result = ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFile('only-stroked-3.svg', 'icon-stroked'),
        mirror: true,
      }),
    );
    expect(result.formatVersion).toBe(2);
    const set = readIcons(lib);
    expect(set.formatVersion).toBe(2);
    expect(set.icons['only-stroked-3']!.mirror).toBe(true);
    expect(set.icons.check!.mirror).toBeUndefined();
  });

  it('writes a file that passes validate_library (level 1)', async () => {
    const lib = library();
    ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFolder('svgs-valid'),
      }),
    );
    const validated = ok(
      await mcp.call<Validated>('validate_library', { path: lib, level: 1 }),
    );
    expect(validated.errors).toEqual([]);
    expect(validated.valid).toBe(true);
  });
});

describe('import_icons: it never writes an invalid file', () => {
  it('leaves an invalid icons file whole, with no temporary file left behind', async () => {
    const lib = library((set) => {
      set.icons.Check = set.icons.check!;
      delete set.icons.check;
    });
    const bytes = readFileSync(iconsPath(lib));
    const error = failed(
      await mcp.call('import_icons', { path: lib, svg: svgFolder('svgs-broken') }),
    );
    expect(error.code).toBe('invalid-library');
    expect(error.message).toContain('icons/set.json');
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
    expect(readdirSync(join(root, lib, 'icons'))).toEqual(['set.json']);
  });

  it('leaves the file whole after a successful write too (no temporary file)', async () => {
    const lib = library();
    ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: svgFolder('svgs-tmp') }),
    );
    expect(readdirSync(join(root, lib, 'icons'))).toEqual(['set.json']);
  });
});

describe('import_icons: where it refuses to write', () => {
  it("refuses a package inside a project's specs/ with library-in-project", async () => {
    const project = join(root, 'a-project');
    mkdirSync(join(project, 'specs'), { recursive: true });
    writeFileSync(join(project, 'mapping.json'), '{}');
    cpSync(PACKAGE, join(project, 'specs', 'icons'), { recursive: true });
    const file = join(project, 'specs', 'icons', 'icons', 'set.json');
    const bytes = readFileSync(file);
    const error = failed(
      await mcp.call('import_icons', {
        path: 'a-project/specs/icons',
        svg: svgFolder('svgs-project'),
      }),
    );
    expect(error.code).toBe('library-in-project');
    expect(readFileSync(file).equals(bytes)).toBe(true);
  });

  it('refuses an svg outside the roots, and one reached through a symbolic link that leaves them', async () => {
    const lib = library();
    const bytes = readFileSync(iconsPath(lib));
    const absolute = failed(
      await mcp.call('import_icons', { path: lib, svg: join(outside, 'icon-flag.svg') }),
    );
    expect(absolute.code).toBe('outside-roots');
    symlinkSync(outside, join(root, 'link-out'));
    const linked = failed(
      await mcp.call('import_icons', { path: lib, svg: 'link-out/icon-flag.svg' }),
    );
    expect(linked.code).toBe('outside-roots');
    const folder = failed(await mcp.call('import_icons', { path: lib, svg: 'link-out' }));
    expect(folder.code).toBe('outside-roots');
    expect(
      failed(await mcp.call('import_icons', { path: lib, svg: '../x.svg' })).code,
    ).toBe('outside-roots');
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
  });

  it('puts an svg symbolic link that leaves the roots, inside a folder, in errors without reading it', async () => {
    const lib = library();
    const dir = join(root, 'svgs-with-link');
    mkdirSync(dir, { recursive: true });
    cpSync(`${FIXTURES}/icon-stroked.svg`, join(dir, 'icon-stroked.svg'));
    symlinkSync(join(outside, 'icon-flag.svg'), join(dir, 'icon-escape.svg'));
    const result = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: 'svgs-with-link' }),
    );
    expect(result.added).toEqual(['icon-stroked']);
    expect(result.errors).toEqual([expect.objectContaining({ file: 'icon-escape.svg' })]);
    expect(Object.keys(readIcons(lib).icons)).not.toContain('icon-escape');
  });

  it('refuses a file that is not .svg before reading it', async () => {
    const lib = library();
    writeFileSync(join(root, 'notes.txt'), 'not an svg');
    const error = failed(await mcp.call('import_icons', { path: lib, svg: 'notes.txt' }));
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toContain('.svg');
    // A `.svg` link that points at another kind of file is refused by its real path.
    writeFileSync(join(root, 'secret.kt'), 'fun main() {}');
    symlinkSync(join(root, 'secret.kt'), join(root, 'looks-like.svg'));
    const linked = failed(
      await mcp.call('import_icons', { path: lib, svg: 'looks-like.svg' }),
    );
    expect(linked.code).toBe('invalid-arguments');
  });

  it('ignores the files that are not .svg inside a folder', async () => {
    const lib = library();
    const svgs = svgFolder('svgs-mixed');
    writeFileSync(join(root, svgs, 'readme.txt'), 'x');
    writeFileSync(join(root, svgs, 'code.kt'), 'x');
    const result = ok(await mcp.call<Imported>('import_icons', { path: lib, svg: svgs }));
    expect(result.added).toEqual(GOOD);
    expect(result.errors).toEqual([]);
  });

  it('refuses more than 500 files, with nothing written', async () => {
    const lib = library();
    const bytes = readFileSync(iconsPath(lib));
    const dir = join(root, 'svgs-many');
    mkdirSync(dir, { recursive: true });
    const svg = readFileSync(`${FIXTURES}/icon-stroked.svg`, 'utf8');
    for (let i = 0; i < 501; i++) writeFileSync(join(dir, `i${String(i)}.svg`), svg);
    const error = failed(await mcp.call('import_icons', { path: lib, svg: 'svgs-many' }));
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toContain('500');
    expect(readFileSync(iconsPath(lib)).equals(bytes)).toBe(true);
    expect(existsSync(join(root, lib, 'icons', 'set.json'))).toBe(true);
  });

  it('refuses `name` with a folder', async () => {
    const lib = library();
    const error = failed(
      await mcp.call('import_icons', {
        path: lib,
        svg: svgFolder('svgs-name'),
        name: 'x',
      }),
    );
    expect(error.code).toBe('invalid-arguments');
  });
});

describe('import_icons: review fixes', () => {
  it('returns the errors, not invalid-library, when the file is missing and nothing converts', async () => {
    const lib = library();
    rmSync(join(root, lib, 'icons'), { recursive: true });
    const result = ok(
      await mcp.call<Imported>('import_icons', {
        path: lib,
        svg: svgFile('only-bad.svg', 'icon-transform'),
      }),
    );
    expect(result).toMatchObject({ added: [], written: false });
    expect(result.errors).toEqual([
      { file: 'only-bad.svg', message: 'unsupported in SVG: path transform' },
    ]);
    expect(existsSync(join(root, lib, 'icons'))).toBe(false);
  });

  it('puts a single oversized svg in errors, like the same file in a folder', async () => {
    const lib = library();
    const big = join(root, 'huge.svg');
    writeFileSync(big, `<svg viewBox="0 0 24 24">${' '.repeat(300 * 1024)}</svg>`);
    const result = ok(
      await mcp.call<Imported>('import_icons', { path: lib, svg: 'huge.svg' }),
    );
    expect(result).toMatchObject({ added: [], written: false });
    expect(result.errors).toEqual([
      { file: 'huge.svg', message: expect.stringContaining('256 KB') },
    ]);
  });

  it('does not take an unreadable icons file for a missing one', async () => {
    const lib = library();
    const file = iconsPath(lib);
    rmSync(file);
    symlinkSync(file, file); // a symbolic link loop: realpath fails with ELOOP
    const error = failed(
      await mcp.call('import_icons', { path: lib, svg: svgFolder('svgs-loop') }),
    );
    expect(error.code).not.toBe(undefined);
    expect(lstatSync(file).isSymbolicLink()).toBe(true);
  });

  it('keeps the icons of two calls that run at the same time on the same file', async () => {
    const lib = library();
    const a = svgFile('par-a.svg', 'icon-stroked');
    const b = svgFile('par-b.svg', 'icon-flag');
    const [first, second] = await Promise.all([
      mcp.call<Imported>('import_icons', { path: lib, svg: a }),
      mcp.call<Imported>('import_icons', { path: lib, svg: b }),
    ]);
    expect(ok(first).written).toBe(true);
    expect(ok(second).written).toBe(true);
    expect(Object.keys(readIcons(lib).icons)).toEqual(
      expect.arrayContaining(['par-a', 'par-b']),
    );
  });
});
