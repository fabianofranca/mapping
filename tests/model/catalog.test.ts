// Library catalog: the Material 3 package read from tests/fixtures/material3/.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  clampPlaygroundSize,
  drawEntry,
  exampleDrawing,
  findEntry,
  fittedSize,
  hugAxes,
  playgroundSizeRange,
} from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { isFontPath } from '../../src/model/components/library';
import type { LibraryFile } from '../../src/model/library';
import { BUTTON_PATH, TEXT_BUTTON_PATH, variantsSpecJson } from './variantsFixtures';

const ROOT = join(__dirname, '../../tests/fixtures/material3');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files: LibraryFile[] = listDisk(ROOT).map((path) =>
  isFontPath(path)
    ? { path, binary: true }
    : { path, text: readFileSync(join(ROOT, path), 'utf8') },
);

const catalog = buildCatalog(files);
const entries = catalog.layers.flatMap((l) => l.entries);

describe('Material 3 catalog', () => {
  it('reads the specialization, the report and the fifteen types', () => {
    expect(catalog.spec?.id).toBe('material3');
    expect(catalog.report.errors).toEqual([]);
    expect(catalog.layers.length).toBeGreaterThan(0);
    expect(entries).toHaveLength(15);
    expect(catalog.layers[0]?.entries[0]?.layerId).toBe(catalog.layers[0]?.id);
  });

  it('every type has a component, a document and examples', () => {
    for (const entry of entries) {
      expect(entry.component, entry.type.id).not.toBeNull();
      expect(entry.docText, entry.type.id).toMatch(/\S/);
      expect(entry.examples.length, entry.type.id).toBeGreaterThan(0);
      expect(entry.previewValues).not.toBeNull();
    }
  });

  it('marks the types with a slot as containers', () => {
    const containers = entries.filter((e) => e.container).map((e) => e.type.id);
    const plain = entries.filter((e) => !e.container).map((e) => e.type.id);
    expect(containers.length).toBeGreaterThan(0);
    for (const id of ['m3-box', 'm3-row', 'm3-column']) expect(containers).toContain(id);
    expect(plain).toContain('m3-button');
  });

  it('builds the properties table of a known type', () => {
    const button = findEntry(catalog, 'm3-button');
    expect(button?.fields.map((f) => f.key)).toContain('variant');
    const variant = button?.fields.find((f) => f.key === 'variant');
    expect(variant?.type).toBe('enum');
    expect(variant?.options?.length).toBeGreaterThan(1);
    expect(variant?.label).toMatch(/\S/);
    expect(findEntry(catalog, 'does-not-exist')).toBeUndefined();
  });

  it('draws the preview and each example without error', () => {
    for (const entry of entries) {
      expect(
        exampleDrawing(catalog, entry, undefined, approximateMeasurer),
        entry.type.id,
      ).not.toBeNull();
      for (const example of entry.examples) {
        const drawing = exampleDrawing(catalog, entry, example, approximateMeasurer);
        expect(drawing, `${entry.type.id}/${example.name}`).not.toBeNull();
        expect(drawing?.root.type).toBe('frame');
      }
    }
  });

  it('the size passed to the drawing applies at the root', () => {
    const button = findEntry(catalog, 'm3-button');
    if (button === undefined) throw new Error('no button');
    const drawing = drawEntry(button, {}, approximateMeasurer, {
      width: 200,
      height: 60,
    });
    expect(drawing?.root.width).toBe(200);
    expect(drawing?.root.height).toBe(60);
  });

  it('playground range: from the minSize to double the size', () => {
    const button = findEntry(catalog, 'm3-button')?.component;
    if (!button) throw new Error('no component');
    const { min, max } = playgroundSizeRange(button);
    expect(min).toEqual({
      width: button.minSize?.width ?? 1,
      height: button.minSize?.height ?? 1,
    });
    expect(max).toEqual({ width: button.size.width * 2, height: button.size.height * 2 });
    expect(clampPlaygroundSize(button, { width: 1e6, height: -5 })).toEqual({
      width: max.width,
      height: min.height,
    });
    expect(clampPlaygroundSize(button, button.size)).toEqual(button.size);
  });

  describe('size that respects the sizing', () => {
    const button = () => {
      const entry = findEntry(catalog, 'm3-button');
      if (entry === undefined) throw new Error('no button');
      return entry;
    };
    const overflow = /content larger than the box/;

    it('hugAxes reads the sizing of the component', () => {
      expect(hugAxes(button().component!)).toEqual({ width: true, height: false });
    });

    it('long label: the width grows and the drawing does not clip', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'Confirm purchase' };
      const size = fittedSize(entry, values, approximateMeasurer);
      expect(size.width).toBeGreaterThan(120);
      expect(size.height).toBe(40);
      const drawing = drawEntry(entry, values, approximateMeasurer, size);
      expect(drawing?.warnings.join('|')).not.toMatch(overflow);
    });

    it('short label: respects the minimum; a non-hug axis stays at the size', () => {
      const entry = button();
      const size = fittedSize(
        entry,
        { ...entry.previewValues, label: 'A' },
        approximateMeasurer,
      );
      expect(size.width).toBeGreaterThanOrEqual(48);
      expect(size.height).toBe(40);
    });

    it('huge label: caps at double the size', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'x'.repeat(200) };
      const size = fittedSize(entry, values, approximateMeasurer);
      expect(size.width).toBe(240);
      const drawing = drawEntry(entry, values, approximateMeasurer, size);
      expect(drawing).not.toBeNull();
    });

    it('axis switched off in auto uses the base', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'Confirm purchase' };
      expect(
        fittedSize(entry, values, approximateMeasurer, {
          base: { width: 150, height: 40 },
          auto: { width: false },
        }),
      ).toEqual({ width: 150, height: 40 });
    });

    describe('sizing by expression (MC2, decision 9 of #898)', () => {
      /** The height by `style` (64, 112, 152); `size` 100 is what applies if the expression fails. */
      function bar() {
        const entry = button();
        const component = {
          ...entry.component!,
          formatVersion: 4 as const,
          size: { width: 200, height: 100 },
          sizing: {
            width: 'fill' as const,
            height: {
              $switch: 'style',
              cases: { small: 64, medium: 112, large: 152, tall: 'hug' as const },
            },
          },
        };
        return { ...entry, component };
      }

      it('64, 112 and 152 in the playground (fittedSize)', () => {
        const entry = bar();
        const heightOf = (style: string) =>
          fittedSize(entry, { ...entry.previewValues, style }, approximateMeasurer)
            .height;
        expect(heightOf('small')).toBe(64);
        expect(heightOf('medium')).toBe(112);
        expect(heightOf('large')).toBe(152);
      });

      it('invalid or missing value stays at the size of that axis', () => {
        const entry = bar();
        for (const style of ['nope', 'other', undefined])
          expect(
            fittedSize(entry, { ...entry.previewValues, style }, approximateMeasurer)
              .height,
          ).toBe(100);
      });

      it('hugAxes reads the sizing evaluated with the values (hug or px of the expression)', () => {
        const { component } = bar();
        expect(hugAxes(component, { style: 'tall' })).toEqual({
          width: false,
          height: true,
        });
        // The px that the expression gives also follows the sizing (the playground applies it).
        expect(hugAxes(component, { style: 'small' }).height).toBe(true);
        // Invalid value falls back to the size: nothing to follow.
        expect(hugAxes(component, { style: 'nope' }).height).toBe(false);
        expect(hugAxes(component).height).toBe(false);
      });
    });

    it('without a component returns 1x1', () => {
      const entry = { ...button(), component: null };
      expect(fittedSize(entry, {}, approximateMeasurer)).toEqual({ width: 1, height: 1 });
    });
  });

  it('exposes the code per platform and the grouped sources', () => {
    const withCode = entries.filter((e) => e.code.length > 0);
    for (const entry of withCode) {
      for (const code of entry.code) {
        expect(code.symbol).toMatch(/\S/);
        expect(code.platform.name).toMatch(/\S/);
      }
    }
    for (const entry of entries) {
      expect(new Set(entry.sources.map((g) => g.system)).size).toBe(entry.sources.length);
    }
  });
});

describe('example from an external system', () => {
  it('passes the node through the declared source and draws the tree', () => {
    const withExample = files.map((f) => {
      if (f.path === 'material3.spec.json' && f.text !== undefined) {
        const spec = JSON.parse(f.text);
        const type = spec.layers[0].annotationTypes.find(
          (t: { id: string }) => t.id === 'm3-top-app-bar',
        );
        type.examples.push({
          name: 'SDUI node',
          system: 'sdui',
          file: 'examples/bar.sdui.json',
        });
        return { ...f, text: JSON.stringify(spec) };
      }
      return f;
    });
    withExample.push({
      path: 'examples/bar.sdui.json',
      text: JSON.stringify({ type: 'TopAppBar', props: { title: 'Hello' } }),
    });
    const withSystem = buildCatalog(withExample);
    const entry = findEntry(withSystem, 'm3-top-app-bar');
    const example = entry?.examples.find((e) => e.name === 'SDUI node');
    expect(example?.mode).toBe('system');
    expect(example?.json).toEqual({ type: 'TopAppBar', props: { title: 'Hello' } });
    const drawing = exampleDrawing(withSystem, entry!, example, approximateMeasurer);
    expect(drawing).not.toBeNull();
    expect(drawing?.root.children.length).toBeGreaterThan(0);
  });
});

describe('deliberately broken package', () => {
  it('missing component: does not throw, keeps the report and the entry without a component', () => {
    const broken = buildCatalog(
      files.filter((f) => f.path !== 'components/m3-button.json'),
    );
    expect(broken.report.ok).toBe(false);
    const button = findEntry(broken, 'm3-button');
    expect(button?.component).toBeNull();
    expect(button?.componentProblem?.text).toMatch(/missing file/);
    expect(button?.componentProblem?.code).toBe('catalog.fileMissing');
    expect(button?.componentProblem?.params).toEqual({
      path: 'components/m3-button.json',
    });
    expect(button?.container).toBe(false);
    expect(exampleDrawing(broken, button!, undefined, approximateMeasurer)).toBeNull();
    expect(findEntry(broken, 'm3-card')?.component).not.toBeNull();
  });

  it('missing document: null docText', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'docs/m3-button.md'));
    expect(broken.report.ok).toBe(false);
    expect(findEntry(broken, 'm3-button')?.docText).toBeNull();
    expect(findEntry(broken, 'm3-card')?.docText).not.toBeNull();
  });

  it('without a readable specialization: empty catalog with the report', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'material3.spec.json'));
    expect(broken.spec).toBeNull();
    expect(broken.layers).toEqual([]);
    expect(broken.report.ok).toBe(false);
    expect(buildCatalog([]).report.ok).toBe(false);
    expect(buildCatalog([{ path: 'a.spec.json', text: '{' }]).spec).toBeNull();
  });
});

describe('catalog with variants in code (formatVersion 9)', () => {
  const build = (formatVersion = 9) =>
    buildCatalog([
      {
        path: 'm3.json',
        text: JSON.stringify(variantsSpecJson(formatVersion)),
      },
    ]);
  const codeOf = (typeId: string, formatVersion = 9) => {
    const entry = build(formatVersion)
      .layers.flatMap((l) => l.entries)
      .find((e) => e.type.id === typeId);
    return entry?.code[0];
  };

  it('the base stays as is and variants brings the field and the cases in the options order', () => {
    const code = codeOf('button');
    expect(code).toMatchObject({
      platform: { id: 'compose', name: 'Compose', language: 'kotlin' },
      symbol: 'androidx.compose.material3.Button',
      path: BUTTON_PATH,
    });
    expect(code?.variants).toEqual({
      field: 'style',
      fieldLabel: 'style',
      cases: [
        {
          value: 'outlined',
          symbol: 'androidx.compose.material3.OutlinedButton',
          path: BUTTON_PATH,
        },
        {
          value: 'text',
          symbol: 'androidx.compose.material3.TextButton',
          path: TEXT_BUTTON_PATH,
        },
        {
          value: 'tonal',
          symbol: 'androidx.compose.material3.FilledTonalButton',
          path: BUTTON_PATH,
        },
      ],
    });
  });

  it('a type without variants has no key', () => {
    expect(codeOf('card')).toBeDefined();
    expect('variants' in codeOf('card')!).toBe(false);
  });

  it('in a specialization 8 without variants, the catalog is the usual one', () => {
    const json = variantsSpecJson(8) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete json.layers[0].annotationTypes[0].code.compose.variants;
    const code = buildCatalog([{ path: 'm3.json', text: JSON.stringify(json) }])
      .layers.flatMap((l) => l.entries)
      .find((e) => e.type.id === 'button')?.code[0];
    expect(code?.symbol).toBe('androidx.compose.material3.Button');
    expect(code && 'variants' in code).toBe(false);
  });
});

describe('catalog: external document (formatVersion 11)', () => {
  const GITLAB = 'https://gitlab.example.com/group/design-docs';
  const build = (
    doc: unknown,
    repo: Record<string, unknown> = {
      id: 'design-docs',
      url: GITLAB,
      urlTemplate: `${GITLAB}/-/blob/main/{path}`,
    },
  ) => {
    const json = variantsSpecJson(11) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    json.docRepos = [repo];
    json.layers[0].annotationTypes[0].doc = doc;
    return buildCatalog([{ path: 'm3.json', text: JSON.stringify(json) }])
      .layers.flatMap((l) => l.entries)
      .find((e) => e.type.id === 'button');
  };

  it('object doc: docExternal with repo, path, repo url and file link', () => {
    const entry = build({ repo: 'design-docs', path: 'components/button.md' });
    expect(entry?.docText).toBeNull();
    expect(entry?.docExternal).toEqual({
      repo: 'design-docs',
      path: 'components/button.md',
      repoUrl: GITLAB,
      url: `${GITLAB}/-/blob/main/components/button.md`,
    });
  });

  it('without urlTemplate: null url, but the repository is still reported', () => {
    const entry = build(
      { repo: 'design-docs', path: 'components/button.md' },
      { id: 'design-docs', url: GITLAB },
    );
    expect(entry?.docExternal).toEqual({
      repo: 'design-docs',
      path: 'components/button.md',
      repoUrl: GITLAB,
      url: null,
    });
  });

  it('text doc still gives docText and a null docExternal', () => {
    const entry = build('docs/button.md');
    expect(entry?.docText).toBeNull(); // file outside the test package
    expect(entry?.docExternal).toBeNull();
    expect(
      findEntry(catalog, 'm3-button')?.docExternal,
      'type with a text doc in Material 3',
    ).toBeNull();
    expect(findEntry(catalog, 'm3-button')?.docText).toMatch(/\S/);
  });

  it('without doc: null docExternal', () => {
    expect(build(undefined)?.docExternal).toBeNull();
  });
});
