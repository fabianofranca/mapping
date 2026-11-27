// SG4 (stage #2847): the Figma `brand` icon end to end. `import_icons` of the `paint/` fixtures into a
// copy of `library-gaps`, then the imported icon drawn by the MCP raster like the hand-written one.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { defaultValues } from '../../src/model/libraryDrawing';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

const PACKAGE = 'examples/libraries/library-gaps';
const PAINT = 'tests/fixtures/svg-icons/paint';

interface Imported {
  formatVersion: number;
  added: string[];
  replaced: string[];
  skipped: { name: string; reason: string }[];
  errors: { file: string; message: string }[];
  written: boolean;
}
interface Validated {
  valid: boolean;
  errors: unknown[];
  warnings: unknown[];
}
interface Fill {
  type: string;
  from?: number[];
  to?: number[];
  center?: number[];
  radius?: number;
}
interface IconsFile {
  formatVersion: number;
  icons: Record<string, { clip?: { d?: string }; paths: { fill: Fill | boolean }[] }>;
}

let base: string;
let root: string;
let mcp: Connection;

const iconsFile = (): IconsFile =>
  JSON.parse(readFileSync(join(root, 'lg-imp/icons/icons.json'), 'utf8')) as IconsFile;

function listDisk(dir: string, top = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name), top)
      : [relative(top, join(dir, e.name))],
  );
}

function hexAt(raster: ReturnType<typeof createRaster>, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!];
}

const near = (got: number[], hex: string, slack = 4): void => {
  [1, 3, 5].forEach((at, i) =>
    expect(Math.abs(got[i]! - parseInt(hex.slice(at, at + 2), 16))).toBeLessThanOrEqual(
      slack,
    ),
  );
};

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-import-paint-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  cpSync(PACKAGE, join(root, 'lg-imp'), { recursive: true });
  cpSync(PAINT, join(root, 'svg-paint'), { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('import_icons: the paint folder, dryRun', () => {
  it('adds the four good icons, skips brand and names the two refused files', async () => {
    const before = readFileSync(join(root, 'lg-imp/icons/icons.json'), 'utf8');
    const r = ok(
      await mcp.call<Imported>('import_icons', {
        path: 'lg-imp',
        svg: 'svg-paint',
        dryRun: true,
      }),
    );
    expect(r.written).toBe(false);
    expect(r.formatVersion).toBe(4);
    expect(r.added).toEqual([
      'clip-circle',
      'gradient-bbox',
      'gradient-linear',
      'gradient-radial',
    ]);
    expect(r.skipped.map((s) => [s.name, s.reason])).toEqual([['brand', 'icon-exists']]);
    expect(r.errors.map((e) => e.file).sort()).toEqual([
      'clip-nested.svg',
      'radial-ellipse.svg',
    ]);
    r.errors.forEach((e) => expect(e.message.length).toBeGreaterThan(0));
    expect(readFileSync(join(root, 'lg-imp/icons/icons.json'), 'utf8')).toBe(before);
  });
});

describe('import_icons: the Figma brand icon replaces the hand-written one', () => {
  beforeAll(async () => {
    const r = ok(
      await mcp.call<Imported>('import_icons', {
        path: 'lg-imp',
        svg: 'svg-paint/brand.svg',
        name: 'brand',
        replace: true,
      }),
    );
    expect(r.written).toBe(true);
    expect(r.replaced).toEqual(['brand']);
  });

  it('validate_library is valid with no error and no warning', async () => {
    const v = ok(await mcp.call<Validated>('validate_library', { path: 'lg-imp' }));
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('writes the two gradients and the clip', () => {
    const file = iconsFile();
    expect(file.formatVersion).toBe(4);
    const brand = file.icons.brand!;
    expect(brand.paths[0]!.fill).toMatchObject({
      type: 'linear',
      from: [0, 0],
      to: [24, 0],
    });
    expect(brand.paths[1]!.fill).toMatchObject({
      type: 'radial',
      center: [0.5, 0.5],
      radius: 4,
    });
    expect(brand.clip).toHaveProperty('d');
  });

  it('the MCP raster of the brand badge has the probes of the hand-written icon', () => {
    const files = listDisk(join(root, 'lg-imp')).map((path) => ({
      path: path.split('\\').join('/'),
      text: readFileSync(join(root, 'lg-imp', path), 'utf8'),
    }));
    const entry = findEntry(buildCatalog(files), 'brand-badge')!;
    const component = entry.component!;
    const { root: scene } = instantiate(
      component,
      defaultValues(entry.type),
      { x: 0, y: 0, ...component.size },
      { measure: approximateMeasurer },
    );
    const raster = createRaster(component.size.width, component.size.height);
    paintScene(raster, [{ root: scene }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    });
    near(hexAt(raster, 12, 24), '#BF0040');
    near(hexAt(raster, 36, 24), '#4000BF');
    near(hexAt(raster, 24, 24), '#FFFFFF', 32);
    near(hexAt(raster, 2, 2), '#FFFFFF');
  });
});
