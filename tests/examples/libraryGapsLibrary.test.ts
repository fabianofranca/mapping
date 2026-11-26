// Example library `library-gaps` (stage #2829): one type per format gap. LG1: the `hsl-swatch`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
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

function rasterOf(id: string) {
  const entry = findEntry(catalog, id)!;
  const component = entry.component!;
  const { root } = instantiate(
    component,
    defaultValues(entry.type),
    { x: 0, y: 0, ...component.size },
    { measure: approximateMeasurer },
  );
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
      [SPEC_FILE, 'components/hsl-swatch.json', 'docs/hsl-swatch.md'].sort(),
    );
  });

  it('validates with no error and no warning', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
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
});
