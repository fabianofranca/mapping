import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasParentSegment, isWithin, Roots, scratchOverlap } from '../../mcp/paths';

// The server tests run only on Linux (CI `ubuntu-latest`); the two path checks
// that matter on Windows are tested here with `path.win32` (phase 8.5, M14).

describe('isWithin', () => {
  it.each([
    ['C:\\proj', 'C:\\proj', true],
    ['C:\\proj', 'C:\\proj\\store\\mapping.json', true],
    ['C:\\proj', 'c:\\PROJ\\store', true],
    ['C:\\proj\\', 'C:\\proj\\store', true],
    ['C:\\proj', 'C:\\project', false],
    ['C:\\proj', 'C:\\proj\\..\\outside', false],
    ['C:\\proj', 'C:\\', false],
    ['C:\\proj', 'D:\\proj\\store', false],
    ['\\\\server\\design', '\\\\server\\design\\store', true],
    ['\\\\server\\design', '\\\\server\\other\\store', false],
    ['\\\\server\\design', 'C:\\design\\store', false],
  ])('win32: %s contains %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child, path.win32)).toBe(expected);
  });

  it.each([
    ['/root', '/root/store', true],
    ['/root', '/root', true],
    ['/root', '/root-2/store', false],
    ['/root', '/', false],
    ['/root', '/ROOT/store', false],
  ])('posix (default): %s contains %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child)).toBe(expected);
    expect(isWithin(parent, child, path.posix)).toBe(expected);
  });
});

describe('hasParentSegment', () => {
  it.each([
    ['..\\outside', true],
    ['store\\..\\..\\outside', true],
    ['store/..\\outside', true],
    ['C:\\proj\\..', true],
    ['store\\a..b\\c', false],
    ['store\\..x', false],
    ['..store', false],
    ['store\\images', false],
  ])('%s → %s', (input, expected) => {
    expect(hasParentSegment(input)).toBe(expected);
  });
});

describe('Roots with scratch folders (input files)', () => {
  let base: string;
  let root: string;
  let scratch: string;
  let roots: Roots;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'mapping-scratch-paths-')));
    root = join(base, 'projects');
    scratch = join(base, 'scratch');
    mkdirSync(root);
    mkdirSync(scratch);
    roots = new Roots([root], base, [scratch]);
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  const code = async (promise: Promise<unknown>): Promise<string | undefined> =>
    promise.then(
      () => undefined,
      (error: { code?: string }) => error.code,
    );

  it('exposes the scratch folders as given', () => {
    expect(roots.scratch).toEqual([scratch]);
    expect(new Roots([root]).scratch).toEqual([]);
  });

  it('a relative path found in a root wins over the scratch folder', async () => {
    writeFileSync(join(root, 'batch.json'), 'root');
    writeFileSync(join(scratch, 'batch.json'), 'scratch');
    expect((await roots.resolveInputFile('batch.json')).real).toBe(
      join(root, 'batch.json'),
    );
  });

  it('a relative path found only in the scratch folder', async () => {
    writeFileSync(join(scratch, 'batch.json'), 'scratch');
    const found = await roots.resolveInputFile('batch.json');
    expect(found.real).toBe(join(scratch, 'batch.json'));
    expect(found.scratch).toBe(true);
  });

  it('an absolute path inside the scratch folder (and inside a root)', async () => {
    writeFileSync(join(scratch, 'a.json'), '1');
    writeFileSync(join(root, 'b.json'), '2');
    expect(await roots.resolveInputFile(join(scratch, 'a.json'))).toMatchObject({
      real: join(scratch, 'a.json'),
      scratch: true,
    });
    expect(await roots.resolveInputFile(join(root, 'b.json'))).toMatchObject({
      real: join(root, 'b.json'),
      scratch: false,
    });
  });

  it('refuses `..`, an absolute path outside both and a link that leaves the scratch folder', async () => {
    const outside = join(base, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'x.json'), 'x');
    symlinkSync(join(outside, 'x.json'), join(scratch, 'link.json'));
    expect(await code(roots.resolveInputFile('../outside/x.json'))).toBe('outside-roots');
    expect(await code(roots.resolveInputFile(join(outside, 'x.json')))).toBe(
      'outside-roots',
    );
    expect(await code(roots.resolveInputFile('link.json'))).toBe('outside-roots');
    expect(await code(roots.resolveInputFile(join(scratch, 'link.json')))).toBe(
      'outside-roots',
    );
    await expect(roots.resolveInputFile(join(outside, 'x.json'))).rejects.toThrow(
      'outside the configured roots and scratch folders',
    );
  });

  it('an absolute path through a root that links into the scratch folder is accepted', async () => {
    mkdirSync(join(scratch, 'shots'));
    writeFileSync(join(scratch, 'shots', 'a.png'), '1');
    symlinkSync(join(scratch, 'shots'), join(root, 'shots'));
    const found = await roots.resolveInputFile(join(root, 'shots', 'a.png'));
    expect(found).toMatchObject({ real: join(scratch, 'shots', 'a.png'), scratch: true });
  });

  it('a relative path through a root link into the scratch folder resolves like its absolute path', async () => {
    // The link and its target have different names: the relative path is not found under the scratch folder.
    mkdirSync(join(scratch, 'pictures'));
    writeFileSync(join(scratch, 'pictures', 'a.png'), '1');
    symlinkSync(join(scratch, 'pictures'), join(root, 'shots'));
    const expected = { real: join(scratch, 'pictures', 'a.png'), scratch: true };
    expect(await roots.resolveInputFile('shots/a.png')).toMatchObject(expected);
    expect(await roots.resolveInputFile(join(root, 'shots', 'a.png'))).toMatchObject(
      expected,
    );
  });

  it('a relative path through a scratch link into a root resolves like its absolute path', async () => {
    writeFileSync(join(root, 'b.json'), '2');
    symlinkSync(join(root, 'b.json'), join(scratch, 'b-link.json'));
    const expected = { real: join(root, 'b.json'), scratch: false };
    expect(await roots.resolveInputFile('b-link.json')).toMatchObject(expected);
    expect(await roots.resolveInputFile(join(scratch, 'b-link.json'))).toMatchObject(
      expected,
    );
  });

  it('a relative link that leaves both areas is still outside-roots', async () => {
    const outside = join(base, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'x.json'), 'x');
    symlinkSync(outside, join(root, 'out'));
    symlinkSync(join(outside, 'x.json'), join(scratch, 'x-link.json'));
    expect(await code(roots.resolveInputFile('out/x.json'))).toBe('outside-roots');
    expect(await code(roots.resolveInputFile('x-link.json'))).toBe('outside-roots');
  });

  it('a missing file is path-not-found, and a missing scratch folder is not an error', async () => {
    expect(await code(roots.resolveInputFile('nothing.json'))).toBe('path-not-found');
    const lonely = new Roots([root], base, [join(base, 'not-created')]);
    expect(await code(lonely.resolveInputFile('nothing.json'))).toBe('path-not-found');
    expect(await lonely.realScratch()).toEqual([null]);
  });

  it('the scratch folder is read-only: no write or root path accepts it', async () => {
    writeFileSync(join(scratch, 'a.json'), '1');
    expect(await code(roots.resolveNew(join(scratch, 'new.json')))).toBe('outside-roots');
    expect(await code(roots.resolveNew('new.json', scratch))).toBe('unknown-root');
    expect(await code(roots.resolveExisting(join(scratch, 'a.json')))).toBe(
      'outside-roots',
    );
    expect(await code(roots.assertInside(join(scratch, 'a.json')))).toBe('outside-roots');
    expect(await roots.locate(join(scratch, 'a.json'))).toBeNull();
  });
});

describe('scratchOverlap', () => {
  let base: string;
  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'mapping-scratch-overlap-')));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('a scratch folder inside a root', () => {
    const root = join(base, 'projects');
    const scratch = join(root, 'tmp');
    mkdirSync(scratch, { recursive: true });
    expect(scratchOverlap([root], [scratch])).toEqual({ root, scratch });
  });

  it('a root inside a scratch folder', () => {
    const scratch = join(base, 'scratch');
    const root = join(scratch, 'inner');
    mkdirSync(root, { recursive: true });
    expect(scratchOverlap([root], [scratch])).toEqual({ root, scratch });
  });

  it('the same folder, also when written differently', () => {
    const root = join(base, 'projects');
    mkdirSync(root);
    expect(scratchOverlap([root], [root])).toEqual({ root, scratch: root });
    expect(scratchOverlap([root], [`${root}/`])).not.toBeNull();
  });

  it('an overlap only through a real path (a symbolic link)', () => {
    const root = join(base, 'projects');
    const elsewhere = join(base, 'elsewhere');
    mkdirSync(join(root, 'tmp'), { recursive: true });
    mkdirSync(elsewhere);
    symlinkSync(join(root, 'tmp'), join(elsewhere, 'link'));
    const scratch = join(elsewhere, 'link');
    expect(scratchOverlap([root], [scratch])).toEqual({ root, scratch });
    // The other way: the root is the link.
    const linkedRoot = join(base, 'linked-root');
    symlinkSync(root, linkedRoot);
    const inside = join(root, 'tmp');
    expect(scratchOverlap([linkedRoot], [inside])).toEqual({
      root: linkedRoot,
      scratch: inside,
    });
  });

  it('a scratch folder that does not exist yet is compared by its path', () => {
    const root = join(base, 'projects');
    mkdirSync(root);
    const inside = join(root, 'not-created');
    expect(scratchOverlap([root], [inside])).toEqual({ root, scratch: inside });
    expect(scratchOverlap([root], [join(base, 'not-created')])).toBeNull();
  });

  it('a root that does not exist yet, under a link into the scratch area, overlaps', () => {
    const scratch = join(base, 'b', 'projects', 'tmp');
    mkdirSync(join(base, 'b'));
    symlinkSync(join(base, 'b'), join(base, 'link'));
    const root = join(base, 'link', 'projects');
    expect(scratchOverlap([root], [scratch])).toEqual({ root, scratch });
    expect(scratchOverlap([join(base, 'link', 'other')], [scratch])).toBeNull();
  });

  it('sibling folders do not overlap', () => {
    const projects = join(base, 'projects');
    const specializations = join(base, 'specializations');
    const scratch = join(base, 'scratch');
    const alike = join(base, 'projects-tmp');
    for (const dir of [projects, specializations, scratch, alike]) mkdirSync(dir);
    expect(scratchOverlap([projects, specializations], [scratch, alike])).toBeNull();
    expect(scratchOverlap([projects], [])).toBeNull();
  });
});
