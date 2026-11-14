// CF7: the icon set in the library validator (levels 1 to 3), in the catalog and in the package.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { componentPaths, loadSpecComponents } from '../../src/model/componentCatalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { usesPackageFiles } from '../../src/model/libraryPackage';
import { parseSpecText } from '../../src/model/spec';

const DIR = 'tests/fixtures/icons';
const SPEC = 'icons.spec.json';
const PATHS = [SPEC, 'components/badge.json', 'icons/set.json'];

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(overrides: Record<string, string | null> = {}): LibraryFile[] {
  const out: LibraryFile[] = [];
  for (const path of PATHS) {
    const text = path in overrides ? overrides[path] : read(path);
    if (text !== null && text !== undefined) out.push({ path, text });
  }
  return out;
}

type JsonPath = readonly (string | number)[];

/** The file text with the value replaced (or, with `undefined`, deleted) at the path. */
const edit = (path: string, at: JsonPath, value: unknown): string => {
  const json: unknown = JSON.parse(read(path));
  let node: unknown = json;
  for (const key of at.slice(0, -1)) node = Reflect.get(Object(node), key);
  const last = at[at.length - 1] as string | number;
  if (value === undefined) Reflect.deleteProperty(Object(node), last);
  else Reflect.set(Object(node), last, value);
  return JSON.stringify(json);
};

const NAME = ['template', 'children', 0, 'name'] as const;
const OPTIONS = ['layers', 0, 'annotationTypes', 0, 'fields', 0, 'options'] as const;

const brief = (
  issues: readonly { severity: string; file: string; path: string; message: string }[],
) => issues.map((i) => `${i.severity} ${i.file} ${i.path}: ${i.message}`);

describe('validateLibrary: icon set', () => {
  it('the test package passes with no errors or warnings', () => {
    const report = validateLibrary({ files: pack() });
    expect(brief(report.issues)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a missing icons file is a file error in the specialization', () => {
    const report = validateLibrary({ files: pack({ 'icons/set.json': null }) });
    expect(brief(report.errors)).toEqual([
      `error ${SPEC} icons: file not found: icons/set.json`,
    ]);
  });

  it('an invalid icons file gives the file errors, with the path', () => {
    const bad = read('icons/set.json').replace('"check"', '"Check"');
    const report = validateLibrary({ files: pack({ 'icons/set.json': bad }) });
    expect(brief(report.errors)).toContain(
      'error icons/set.json icons.Check: invalid name; use [a-z0-9][a-z0-9-_]*',
    );
  });

  it('the icons file is not an "unreferenced file"', () => {
    const report = validateLibrary({ files: pack() });
    expect(report.warnings.some((w) => w.file === 'icons/set.json')).toBe(false);
  });

  it('a literal name outside the set is an error at level 2, at the node path', () => {
    const badComponent = edit('components/badge.json', NAME, 'cloud');
    const report = validateLibrary({
      files: pack({ 'components/badge.json': badComponent }),
    });
    expect(brief(report.errors)).toEqual([
      'error components/badge.json template.children[0].name: the icon "cloud" does not exist in the icon set (icons/set.json)',
    ]);
  });

  it('level 1 does not check the literal name (only level 2 onwards)', () => {
    const badComponent = edit('components/badge.json', NAME, 'cloud');
    const report = validateLibrary({
      files: pack({ 'components/badge.json': badComponent }),
      level: 1,
    });
    expect(report.errors).toEqual([]);
  });

  it('an icon node with a literal name and no icons in the specialization is an error', () => {
    const noIcons = edit(SPEC, ['icons'], undefined);
    const literal = edit('components/badge.json', NAME, 'check');
    const report = validateLibrary({
      files: pack({ [SPEC]: noIcons, 'components/badge.json': literal }),
    });
    expect(brief(report.errors)).toContain(
      'error components/badge.json template.children[0].name: the icon "check" cannot be checked: the specialization does not declare icons',
    );
  });

  it('level 3: an enum read in name with an option outside the set warns', () => {
    const spec = edit(SPEC, OPTIONS, ['check', 'cloud']);
    const report = validateLibrary({ files: pack({ [SPEC]: spec }) });
    expect(report.ok).toBe(true);
    expect(brief(report.warnings)).toContain(
      `warning ${SPEC} layers[0].annotationTypes[0].fields[0].options[1]: the option "cloud" of the field "icon" is not in the icon set; the drawing falls back to the placeholder`,
    );
  });

  it('level 2 does not give the enum warning (it belongs to level 3)', () => {
    const spec = edit(SPEC, OPTIONS, ['check', 'cloud']);
    const report = validateLibrary({ files: pack({ [SPEC]: spec }), level: 2 });
    expect(report.warnings).toEqual([]);
  });

  it('the drawing proof warns the preview unknown icon', () => {
    const comp = edit('components/badge.json', ['preview', 'icon'], 'cloud');
    const report = validateLibrary({ files: pack({ 'components/badge.json': comp }) });
    expect(brief(report.warnings).join('\n')).toContain('unknown icon: cloud');
  });
});

describe('catalog and library load the icon set', () => {
  const spec = (() => {
    const parsed = parseSpecText(read(SPEC));
    if (!parsed.ok) throw new Error('invalid spec');
    return parsed.spec;
  })();
  const readText = (path: string): string | undefined =>
    PATHS.includes(path) ? read(path) : undefined;

  it('componentPaths includes the icons file', () => {
    expect(componentPaths(spec, SPEC)).toEqual([
      'components/badge.json',
      'icons/set.json',
    ]);
  });

  it('loadSpecComponents puts the set in the component and draws the package icon', () => {
    const loaded = loadSpecComponents(spec, SPEC, 1, readText);
    expect(loaded.problems).toEqual([]);
    const component = loaded.byType.get('badge');
    expect(component?.resolvedIcons?.icons.check).toBeDefined();
    if (component === undefined) throw new Error('no component');
    const { root } = instantiate(
      component,
      { icon: 'check', tint: '#0a7' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(JSON.stringify(root)).toContain('M5 12l5 5L20 7');
  });

  it('a missing icons file becomes a catalog problem', () => {
    const loaded = loadSpecComponents(spec, SPEC, 1, (p) =>
      p === 'icons/set.json' ? undefined : readText(p),
    );
    expect(loaded.problems).toEqual(['icons: missing file (icons/set.json)']);
  });

  it('loadLibrary (lab) reads icons and carries the set to the components', () => {
    const files = PATHS.map((path) => ({ path, text: read(path) }));
    const library = withHostTokens(loadLibrary(files), {});
    expect(library.problems).toEqual([]);
    expect(library.icons?.viewBox).toEqual([24, 24]);
    expect(library.types[0]?.component?.resolvedIcons?.icons.close).toBeDefined();
  });

  it('the package that declares icons is a file package', () => {
    expect(usesPackageFiles(spec)).toBe(true);
    expect(usesPackageFiles({ ...spec, icons: undefined, layers: [] })).toBe(false);
  });
});
