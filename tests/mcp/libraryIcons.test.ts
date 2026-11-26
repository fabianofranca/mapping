// CF7: validate_library with the icon set (`icons`, `mapping-icons` file).
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { parseIconsFile } from '../../src/model/components/icons';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

const ICONS = 'tests/fixtures/icons';

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
interface Validated {
  valid: boolean;
  spec?: Record<string, unknown>;
  errors: Issue[];
  warnings: Issue[];
}

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-icons-'));
  const root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  cpSync(ICONS, join(root, 'ok'), { recursive: true });
  // Wrong icons file: the name "check" vanishes from the set.
  cpSync(ICONS, join(root, 'errado'), { recursive: true });
  const file = join(root, 'errado', 'icons', 'set.json');
  const set = JSON.parse(readFileSync(file, 'utf8')) as {
    icons: Record<string, unknown>;
  };
  set.icons.Check = set.icons.check;
  delete set.icons.check;
  writeFileSync(file, JSON.stringify(set));
  // Literal name outside the set.
  cpSync(ICONS, join(root, 'literal'), { recursive: true });
  const comp = join(root, 'literal', 'components', 'badge.json');
  const badge = JSON.parse(readFileSync(comp, 'utf8')) as {
    template: { children: { name: unknown }[] };
  };
  badge.template.children[0]!.name = 'nuvem';
  writeFileSync(comp, JSON.stringify(badge));
  // Icons file with `fillRule`: valid in formatVersion 3, refused at the key's path in 2.
  for (const version of [3, 2]) {
    const name = `fill-v${version}`;
    cpSync(ICONS, join(root, name), { recursive: true });
    const file = join(root, name, 'icons', 'set.json');
    const set = JSON.parse(readFileSync(file, 'utf8')) as {
      formatVersion: number;
      icons: { dot: { paths: Record<string, unknown>[] } };
    };
    set.formatVersion = version;
    set.icons.dot.paths[0]!.fillRule = 'evenodd';
    writeFileSync(file, JSON.stringify(set));
  }
  // Icons file with a gradient `fill` and a `clip`: valid in formatVersion 4, refused at the key's path in 3.
  for (const version of [4, 3]) {
    const name = `grad-v${version}`;
    cpSync(ICONS, join(root, name), { recursive: true });
    const file = join(root, name, 'icons', 'set.json');
    const set = JSON.parse(readFileSync(file, 'utf8')) as {
      formatVersion: number;
      icons: { dot: { clip?: unknown; paths: Record<string, unknown>[] } };
    };
    set.formatVersion = version;
    set.icons.dot.paths[0]!.fill = {
      type: 'linear',
      from: [0, 0],
      to: [10, 0],
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    };
    set.icons.dot.clip = { d: 'M0 0h10v5H0z' };
    writeFileSync(file, JSON.stringify(set));
  }
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('validate_library with icons', () => {
  it('approves an icons file in formatVersion 4 with a gradient fill and a clip', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'grad-v4' }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('refuses the gradient and the clip in a formatVersion 3 file, at the key paths', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'grad-v3' }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => `${e.file} ${e.path}: ${e.message}`)).toEqual([
      'icons/set.json icons.dot.clip: only allowed with formatVersion 4',
      'icons/set.json icons.dot.paths[0].fill: only allowed with formatVersion 4',
    ]);
  });

  it('approves the test package, with no errors or warnings, and summarizes the icons file', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'ok' }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({
      id: 'icons',
      formatVersion: 15,
      icons: 'icons/set.json',
    });
  });

  it("with the wrong icons file it returns the file's error", async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'errado' }));
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => `${e.file} ${e.path}: ${e.message}`)).toContain(
      'icons/set.json icons.Check: invalid name; use [a-z0-9][a-z0-9-_]*',
    );
  });

  it('refuses a literal name that is not in the set', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'literal' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        file: 'components/badge.json',
        path: 'template.children[0].name',
        message: 'the icon "nuvem" does not exist in the icon set (icons/set.json)',
      }),
    ]);
  });

  it('approves an icons file in formatVersion 3 with fillRule', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'fill-v3' }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('refuses fillRule in a formatVersion 2 file, at the key path', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'fill-v2' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        file: 'icons/set.json',
        path: 'icons.dot.paths[0].fillRule',
        message: 'only allowed with formatVersion 3',
      }),
    ]);
  });
});

// Icons file formatVersion 4 (stage #2829, LG2): the MCP raster already paints a gradient on a `path`
// node, so the gradient icon path reaches the PNG without a change to the renderer. A probe in the
// middle of the ramp proves it. (The clip in the raster is LG3.)
describe('the MCP PNG paints the gradient of an icon path', () => {
  const pixel = (raster: Raster, x: number, y: number): number[] => {
    const i = (y * raster.width + x) * 4;
    return [...raster.data.subarray(i, i + 4)];
  };

  function draw(fill: unknown): Raster {
    const set = parseIconsFile({
      format: 'mapping-icons',
      formatVersion: 4,
      viewBox: [24, 24],
      icons: { badge: { paths: [{ d: 'M0 0h24v24H0z', fill }] } },
    });
    if (!set.ok) throw new Error(set.errors.join('; '));
    const component = {
      format: COMPONENT_FORMAT,
      formatVersion: 4,
      id: 'c',
      name: 'C',
      size: { width: 24, height: 24 },
      template: {
        type: 'frame',
        children: [{ type: 'icon', name: 'badge', color: '#00ff00' }],
      },
    } as unknown as ComponentFile;
    const { root } = instantiate(
      component,
      {},
      { x: 0, y: 0, width: 24, height: 24 },
      { measure: approximateMeasurer, icons: set.set },
    );
    const raster = createRaster(24, 24);
    raster.data.fill(255);
    paintScene(raster, [{ root }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 24, height: 24 },
    });
    return raster;
  }

  it('a linear gradient by from/to is red at the start, purple in the middle and blue at the end', () => {
    const raster = draw({
      type: 'linear',
      from: [0, 0],
      to: [24, 0],
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    });
    const [r0, , b0] = pixel(raster, 0, 12);
    expect(r0).toBeGreaterThan(240);
    expect(b0).toBeLessThan(15);
    const [rm, gm, bm] = pixel(raster, 12, 12);
    expect(rm).toBeGreaterThan(110);
    expect(rm).toBeLessThan(145);
    expect(bm).toBeGreaterThan(110);
    expect(bm).toBeLessThan(145);
    // The node's green color does not tint the gradient.
    expect(gm).toBeLessThan(10);
    const [r1, , b1] = pixel(raster, 23, 12);
    expect(r1).toBeLessThan(15);
    expect(b1).toBeGreaterThan(240);
  });

  it('a radial gradient is white in the center and black at the radius', () => {
    const raster = draw({
      type: 'radial',
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#000000' },
      ],
    });
    expect(pixel(raster, 12, 12)[0]).toBeGreaterThan(235);
    expect(pixel(raster, 12, 0)[0]).toBeLessThan(40);
  });
});
