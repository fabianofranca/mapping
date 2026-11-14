// Frozen library package of the tests (`tests/fixtures/material3/`): the 15-type Material 3
// that proves the library engine (it is not a distributed example; see `examples/README.md`).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { isFontPath, loadLibrary } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';
import { parseComponent } from '../../src/model/components/parseComponent';
import { screenFromSource } from '../../src/model/components/origin';
import { parseSpec } from '../../src/model/spec';

const ROOT = join(__dirname, '../../tests/fixtures/material3');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const byPath = new Map(files.map((f) => [f.path, f.text]));
const json = (path: string): unknown => JSON.parse(byPath.get(path) ?? 'null');

describe('material3 package is valid', () => {
  const specText = byPath.get('material3.spec.json') ?? '';
  const parsed = parseSpec(JSON.parse(specText));

  it('the specialization validates at formatVersion 6', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(6);
  });

  it('the fifteen components validate', () => {
    const paths = files.filter((f) => f.path.startsWith('components/'));
    expect(paths).toHaveLength(15);
    for (const f of paths) {
      const result = parseComponent(JSON.parse(f.text));
      expect(result.ok, `${f.path}: ${result.ok ? '' : result.errors.join('; ')}`).toBe(
        true,
      );
    }
  });

  it('every cited component, doc and file exists; the .md files are not empty', () => {
    if (!parsed.ok) throw new Error('invalid specialization');
    const cited: string[] = [];
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        if (type.component) cited.push(type.component);
        if (typeof type.doc === 'string') cited.push(type.doc);
        for (const e of type.examples ?? []) if (e.file) cited.push(e.file);
      }
    }
    for (const origin of parsed.spec.origins ?? []) {
      for (const e of origin.examples ?? []) cited.push(e.file);
    }
    for (const font of parsed.spec.fonts ?? []) cited.push(font.file);
    for (const path of cited.filter((p) => !p.startsWith('fonts/'))) {
      expect(byPath.has(path), `${path} cited but missing`).toBe(true);
    }
    for (const f of files.filter((x) => x.path.endsWith('.md'))) {
      expect(f.text.trim().length, f.path).toBeGreaterThan(0);
    }
    expect(files.filter((x) => x.path.endsWith('.md'))).toHaveLength(15);
  });

  it('each type with a component has one to three examples', () => {
    if (!parsed.ok) throw new Error('invalid specialization');
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        if (!type.component) continue;
        const n = type.examples?.length ?? 0;
        expect(n, type.id).toBeGreaterThanOrEqual(1);
        expect(n, type.id).toBeLessThanOrEqual(3);
      }
    }
  });
});

// The repository package is the fixture of the three doors (B2), of the canvas (B3) and of the Catalog (B5):
// it must pass the validator's three levels with no error. The warnings that remain are
// pinned here, so the number does not move on its own: two missing fonts (Roboto's `.ttf` is not
// versioned) and the rest of the drawing proof, which warns content larger than the box at the
// initial size (the minimum size is not drawn). The Node measure is **approximate** (in the
// browser it is Konva's, the real one), and the stage's decision is to warn, without clipping or refusing.
describe('the repository package passes the library validator', () => {
  const report = validateLibrary({
    files: listDisk(ROOT).map((path) => {
      const full = join(ROOT, path);
      return isFontPath(path)
        ? { path, binary: true }
        : { path, text: readFileSync(full, 'utf8') };
    }),
    specPath: 'material3.spec.json',
  });

  it('no error, at the three levels', () => {
    expect(report.errors.map((i) => `${i.file}:${i.path}: ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 15,
      components: 15,
      docs: 15,
    });
  });

  it('the warnings are only the missing fonts and the approximate drawing proof', () => {
    const fonts = report.warnings.filter((w) => w.path.startsWith('fonts['));
    expect(fonts).toHaveLength(2);
    const approximate = report.warnings.filter((w) =>
      w.message.endsWith('(approximate)'),
    );
    expect(
      approximate.every((w) => w.message.includes('content larger than the box')),
    ).toBe(true);
    // The "Selecionado" chip overflowed the box by less than 1 px of text: with the tolerance of
    // 1 px per text node (decision 10 of stage #747) it no longer warns.
    expect(approximate.map((w) => w.path)).toEqual([]);
    expect(approximate.every((w) => w.message.includes('initial size'))).toBe(true);
    const others = report.warnings.filter(
      (w) => !w.path.startsWith('fonts[') && !w.message.endsWith('(approximate)'),
    );
    expect(others.map((w) => `${w.file}:${w.path}: ${w.message}`)).toEqual([]);
  });
});

describe('contract of the package origin', () => {
  it('the declaration translates examples/settings.sdui.json without a warning', () => {
    const library = loadLibrary(
      files
        .filter((f) => f.path.endsWith('.json'))
        .map((f) => ({ path: f.path, text: f.text })),
    );
    expect(library.problems).toEqual([]);
    expect(library.types.filter((t) => t.component)).toHaveLength(15);
    const result = screenFromSource(library, json('examples/settings.sdui.json'), {
      measure: approximateMeasurer,
    });
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.screen).toBeDefined();
  });
});
