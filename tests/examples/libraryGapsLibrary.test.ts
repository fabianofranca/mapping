// Example library `library-gaps` (stage #2829): one type per format gap. LG1: the `hsl-swatch`;
// LG2: the `brand-badge`, with an icon that has a gradient fill and a clip (icons file formatVersion 4);
// LG4: the `masked-field`, with two `codeOnly` fields (specialization formatVersion 24).
// LG5: the `brand-badge` `tint` field is removed in version 2 and added again in version 3 (`add-field`).
// LG6: the `expand-row` and the `expand-item`, whose root `weight` comes from a field (Arrange `weight`).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { walk, type GroupNode, type PathNode } from '../../src/model/components/scene';
import { defaultValues } from '../../src/model/libraryDrawing';
import { validateLibrary } from '../../src/model/library';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createRaster } from '../../mcp/image/raster';

const ROOT = join(__dirname, '../../examples/libraries/library-gaps');
const SPEC_FILE = 'library-gaps.spec.json';

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
const catalog = buildCatalog(files);

/** `#RRGGBB` of the pixel (x, y) of the raster. */
function hexAt(raster: ReturnType<typeof createRaster>, x: number, y: number): string {
  const i = (y * raster.width + x) * 4;
  const [r, g, b] = [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!];
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function sceneOf(id: string) {
  const entry = findEntry(catalog, id)!;
  const component = entry.component!;
  return instantiate(
    component,
    defaultValues(entry.type),
    { x: 0, y: 0, ...component.size },
    { measure: approximateMeasurer },
  );
}

function rasterOf(id: string) {
  const entry = findEntry(catalog, id)!;
  const component = entry.component!;
  const { root } = sceneOf(id);
  const raster = createRaster(component.size.width, component.size.height);
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
  });
  return raster;
}

describe('example library library-gaps', () => {
  it('has the specialization, the swatch component and its document', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/hsl-swatch.json',
        'docs/hsl-swatch.md',
        'components/brand-badge.json',
        'docs/brand-badge.md',
        'components/masked-field.json',
        'docs/masked-field.md',
        'components/expand-row.json',
        'docs/expand-row.md',
        'components/expand-item.json',
        'docs/expand-item.md',
        'icons/icons.json',
      ].sort(),
    );
  });

  it('validates with no error and no warning', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('the specialization is at formatVersion 24 and the masked field has two codeOnly fields', () => {
    const spec = JSON.parse(files.find((f) => f.path === SPEC_FILE)!.text) as {
      formatVersion: number;
      layers: { annotationTypes: { id: string; fields: Record<string, unknown>[] }[] }[];
    };
    expect(spec.formatVersion).toBe(24);
    const masked = spec.layers[0]!.annotationTypes.find((t) => t.id === 'masked-field')!;
    expect(masked.fields.map((f) => [f.key, f.codeOnly])).toEqual([
      ['label', undefined],
      ['mask', true],
      ['keyboard', true],
    ]);
    expect(masked).not.toHaveProperty('code');
  });

  it('without codeOnly the two fieldUnused warnings of the masked field come back', () => {
    const withoutCodeOnly = (text: string): string =>
      JSON.stringify(JSON.parse(text), (key, value: unknown) =>
        key === 'codeOnly' ? undefined : value,
      );
    const plain = files.map((f) =>
      f.path === SPEC_FILE ? { ...f, text: withoutCodeOnly(f.text) } : f,
    );
    expect(plain.find((f) => f.path === SPEC_FILE)!.text).not.toContain('"codeOnly"');
    const report = validateLibrary({ files: plain, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => [w.code, w.params?.key, w.params?.typeId])).toEqual(
      [
        ['library.fieldUnused', 'mask', 'masked-field'],
        ['library.fieldUnused', 'keyboard', 'masked-field'],
      ],
    );
  });

  it('the package is version 3: remove-field tint (1 → 2), then add-field tint (2 → 3)', () => {
    const spec = JSON.parse(files.find((f) => f.path === SPEC_FILE)!.text) as {
      version: number;
      migrations: { from: number; to: number; steps: Record<string, unknown>[] }[];
    };
    expect(spec.version).toBe(3);
    expect(spec.migrations).toEqual([
      {
        from: 1,
        to: 2,
        steps: [{ op: 'remove-field', type: 'brand-badge', field: 'tint' }],
      },
      {
        from: 2,
        to: 3,
        steps: [{ op: 'add-field', type: 'brand-badge', field: 'tint' }],
      },
    ]);
  });

  it('without the add-field step the remove-field of tint is the error spec.fieldStillExists', () => {
    const without = files.map((f) => {
      if (f.path !== SPEC_FILE) return f;
      const spec = JSON.parse(f.text) as { version: number; migrations: unknown[] };
      spec.migrations.splice(1, 1);
      spec.version = 2;
      return { ...f, text: JSON.stringify(spec) };
    });
    const report = validateLibrary({ files: without, specPath: SPEC_FILE });
    expect(report.errors.map((e) => e.code)).toContain('spec.fieldStillExists');
  });

  it('the masked field draws its label and the scene has no warning', () => {
    const { warnings } = sceneOf('masked-field');
    expect(warnings).toEqual([]);
  });

  it('the MCP raster of the swatch paints its three hsl() colors', () => {
    const raster = rasterOf('hsl-swatch');
    expect(hexAt(raster, 48, 24)).toBe('#0080FF');
    const over = hexAt(raster, 72, 24);
    const channel = (offset: number): number =>
      parseInt(over.slice(offset, offset + 2), 16);
    expect(Math.abs(channel(1) - 0x80)).toBeLessThanOrEqual(2);
    expect(Math.abs(channel(3) - 0x40)).toBeLessThanOrEqual(2);
    expect(Math.abs(channel(5) - 0x80)).toBeLessThanOrEqual(2);
    expect(hexAt(raster, 10, 24)).toBe('#008000');
    expect(hexAt(raster, 24, 24)).toBe('#FFFFFF');
  });

  it('the scene of the brand badge carries the linear points (0, 0) → (24, 0) and the clipPath', () => {
    const { root, warnings } = sceneOf('brand-badge');
    expect(warnings).toEqual([]);
    const nodes = [...walk(root)];
    const [linear, radial] = nodes.filter((n): n is PathNode => n.type === 'path');
    expect(linear?.fills[0]).toMatchObject({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 24, y: 0 },
    });
    expect(radial?.fills[0]).toMatchObject({
      type: 'radial',
      center: { x: 12, y: 12 },
      radius: 4,
    });
    const group = nodes.find(
      (n): n is GroupNode => n.type === 'group' && n.clipPath !== undefined,
    );
    expect(group?.clipPath).toEqual({
      d: 'M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24z',
      fillRule: 'nonzero',
      transform: [2, 0, 0, 2, 0, 0],
    });
  });

  it('the MCP raster of the brand badge paints the gradients in the middle of the ramp', () => {
    const raster = rasterOf('brand-badge');
    const near = (hex: string, expected: [number, number, number], slack = 6): void => {
      [1, 3, 5].forEach((at, i) =>
        expect(
          Math.abs(parseInt(hex.slice(at, at + 2), 16) - expected[i]!),
        ).toBeLessThanOrEqual(slack),
      );
    };
    near(hexAt(raster, 12, 24), [0xbf, 0x00, 0x40]);
    near(hexAt(raster, 36, 24), [0x40, 0x00, 0xbf]);
    // The center of the radial: white, a few levels off because the pixel center is half a pixel away.
    near(hexAt(raster, 24, 24), [0xff, 0xff, 0xff], 32);
  });

  it('the expand item has a root weight from its weight field, with no default', () => {
    const spec = JSON.parse(files.find((f) => f.path === SPEC_FILE)!.text) as {
      layers: { annotationTypes: { id: string; fields: Record<string, unknown>[] }[] }[];
    };
    const type = spec.layers[0]!.annotationTypes.find((t) => t.id === 'expand-item')!;
    expect(type.fields).toEqual([{ key: 'weight', type: 'number' }]);
    const component = JSON.parse(
      files.find((f) => f.path === 'components/expand-item.json')!.text,
    ) as { weight: unknown };
    expect(component.weight).toEqual({ $field: 'weight' });
  });

  it('the expand row and the expand item draw with no scene warning', () => {
    expect(sceneOf('expand-row').warnings).toEqual([]);
    expect(sceneOf('expand-item').warnings).toEqual([]);
  });

  it('with the weight root key removed, the item is still valid but the file is no longer a v3 gap', () => {
    const without = files.map((f) => {
      if (f.path !== 'components/expand-item.json') return f;
      const c = JSON.parse(f.text) as Record<string, unknown>;
      delete c.weight;
      return { ...f, text: JSON.stringify(c) };
    });
    const report = validateLibrary({ files: without, specPath: SPEC_FILE });
    expect(report.errors.map((e) => e.code)).toEqual([]);
    expect(report.warnings.map((w) => w.code)).toContain('library.fieldUnused');
  });
});
