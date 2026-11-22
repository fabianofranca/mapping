// @vitest-environment node
// Generator of the R17.55 batch and of the R17.57 and R17.58 calls (scripts/testing/slots.mjs).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Op {
  op: string;
  as?: string;
  name?: string;
  container?: string;
  rect?: Rect;
  width?: number;
  height?: number;
  background?: string;
  marking?: string;
  type?: string;
  values?: Record<string, unknown>;
}
interface Call {
  name: string;
  args: Record<string, unknown> & { operations?: Op[] };
}

const dir = mkdtempSync(join(tmpdir(), 'slots-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(...args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('node', ['scripts/testing/slots.mjs', ...args], {
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const TYPES = [
  'bottom-app-bar',
  'top-app-bar',
  'scaffold',
  'switch',
  'swipe-to-dismiss',
  'bottom-sheet',
];
const TYPE_NAMES: Record<string, string> = {
  'bottom-app-bar': 'Bottom app bar',
  'top-app-bar': 'Top app bar',
  scaffold: 'Scaffold',
  switch: 'Switch',
  'swipe-to-dismiss': 'Swipe to dismiss',
  'bottom-sheet': 'Bottom sheet',
};

/** The client's output for `list_markings` of Slots: the 12 markings (the children do not matter). */
function listFixture(skip?: string): string {
  const rows = TYPES.flatMap((t) =>
    ['bare', 'full'].map((v, i) => ({
      ref: `mapping://screen-m3/m/${t.slice(0, 2)}${v.slice(0, 1)}${TYPES.indexOf(t)}`,
      name: `${TYPE_NAMES[t]} ${v}`,
      container: 'Slots',
      space: 'container',
      rect: { x: 20, y: 400 * TYPES.indexOf(t) + (i ? 200 : 20), width: 1, height: 1 },
    })),
  ).filter((r) => r.name !== skip);
  const text = JSON.stringify({
    project: 'Screen M3',
    total: rows.length,
    returned: rows.length,
    markings: rows,
  });
  return `=== instructions\nMapping server\n=== list_markings\n${JSON.stringify([text], null, 1)}\n`;
}
const refOf = (t: string, v: string) =>
  `mapping://screen-m3/m/${t.slice(0, 2)}${v.slice(0, 1)}${TYPES.indexOf(t)}`;

describe('scripts/testing/slots.mjs propose', () => {
  const r = run('propose');
  const calls = JSON.parse(r.stdout) as Call[];
  const ops = calls[0]?.args.operations ?? [];
  const markings = ops.filter((o) => o.op === 'create_marking');

  it('is one propose_changes call in screen-m3, titled "Slots M3"', () => {
    expect(r.status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('propose_changes');
    expect(calls[0]?.args.project).toBe('screen-m3');
    expect(calls[0]?.args.title).toBe('Slots M3');
  });

  it('creates the Slots container of 400 x 2400 and 23 markings with an annotation each', () => {
    const containers = ops.filter((o) => o.op === 'add_container');
    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      name: 'Slots',
      width: 400,
      height: 2400,
      background: '#FFFFFF',
    });
    expect(markings).toHaveLength(23);
    expect(ops.filter((o) => o.op === 'create_annotation')).toHaveLength(23);
  });

  it('puts the bare and full markings in the bands of decision 6', () => {
    TYPES.forEach((t, k) => {
      const bare = markings.find((m) => m.name === `${TYPE_NAMES[t]} bare`);
      const full = markings.find((m) => m.name === `${TYPE_NAMES[t]} full`);
      expect(bare?.rect).toMatchObject({ x: 20, y: 400 * k + 20 });
      expect(full?.rect).toMatchObject({ x: 20, y: 400 * k + 200 });
    });
  });

  it('gives the children the offsets from the parent top-left corner, inside the full marking', () => {
    const rect = (name: string) => markings.find((m) => m.name === name)?.rect as Rect;
    const offset = (child: string, parent: string) => {
      const c = rect(child);
      const p = rect(parent);
      return { x: c.x - p.x, y: c.y - p.y, width: c.width, height: c.height };
    };
    const bab = 'Bottom app bar full';
    expect(offset('Bottom app bar icon 1', bab)).toEqual({
      x: 4,
      y: 16,
      width: 48,
      height: 48,
    });
    expect(offset('Bottom app bar icon 2', bab)).toEqual({
      x: 56,
      y: 16,
      width: 48,
      height: 48,
    });
    const tab = 'Top app bar full';
    expect(offset('Top app bar icon 1', tab)).toEqual({
      x: 4,
      y: 8,
      width: 48,
      height: 48,
    });
    expect(offset('Top app bar icon 2', tab)).toEqual({
      x: 260,
      y: 8,
      width: 48,
      height: 48,
    });
    expect(offset('Top app bar icon 3', tab)).toEqual({
      x: 308,
      y: 8,
      width: 48,
      height: 48,
    });
    const sc = 'Scaffold full';
    expect(offset('Scaffold top app bar', sc)).toEqual({
      x: 4,
      y: 4,
      width: 352,
      height: 56,
    });
    expect(offset('Scaffold button', sc)).toEqual({
      x: 110,
      y: 120,
      width: 140,
      height: 48,
    });
    expect(offset('Scaffold fab', sc)).toEqual({ x: 288, y: 176, width: 56, height: 56 });
    expect(offset('Switch icon', 'Switch full')).toEqual({
      x: 14,
      y: 4,
      width: 24,
      height: 24,
    });
    expect(offset('Swipe to dismiss item', 'Swipe to dismiss full')).toEqual({
      x: 8,
      y: 8,
      width: 344,
      height: 56,
    });
    expect(offset('Bottom sheet text', 'Bottom sheet full')).toEqual({
      x: 16,
      y: 80,
      width: 200,
      height: 24,
    });
  });

  it('keeps every child inside its full marking', () => {
    const fulls = markings.filter((m) => m.name?.endsWith(' full'));
    const children = markings.filter((m) => !/ (bare|full)$/.test(m.name ?? ''));
    expect(children).toHaveLength(11);
    for (const c of children) {
      const cr = c.rect as Rect;
      const parent = fulls.find((f) => {
        const fr = f.rect as Rect;
        return (
          cr.x >= fr.x &&
          cr.y >= fr.y &&
          cr.x + cr.width <= fr.x + fr.width &&
          cr.y + cr.height <= fr.y + fr.height
        );
      });
      expect(parent, c.name).toBeDefined();
    }
  });

  it('leaves the values empty', () => {
    for (const o of ops.filter((x) => x.op === 'create_annotation')) {
      expect(o.values).toEqual({});
      expect(o.type).toMatch(/^material3-compose\//);
    }
  });
});

describe('scripts/testing/slots.mjs render and a11y', () => {
  const list = join(dir, 'list.out');
  writeFileSync(list, listFixture());

  it('render gives 24 render_marking calls, light then dark, with the refs of the list', () => {
    const r = run('render', list);
    expect(r.status).toBe(0);
    const calls = JSON.parse(r.stdout) as Call[];
    expect(calls).toHaveLength(24);
    for (const c of calls) {
      expect(c.name).toBe('render_marking');
      expect(c.args).toMatchObject({
        project: 'screen-m3',
        zoom: 1,
        padding: 16,
        background: 'none',
      });
    }
    expect(calls.map((c) => c.args.drawingMode)).toEqual(
      Array.from({ length: 12 }, () => ['light', 'dark']).flat(),
    );
    expect(calls[0]?.args.ref).toBe(refOf('bottom-app-bar', 'bare'));
    expect(calls[2]?.args.ref).toBe(refOf('bottom-app-bar', 'full'));
    expect(calls[23]?.args.ref).toBe(refOf('bottom-sheet', 'full'));
  });

  it('a11y gives the 4 calls of R17.58 for the bare Top and Bottom app bars', () => {
    const r = run('a11y', list);
    expect(r.status).toBe(0);
    const calls = JSON.parse(r.stdout) as Call[];
    expect(calls.map((c) => [c.args.ref, c.args.drawingMode])).toEqual([
      [refOf('top-app-bar', 'bare'), 'light'],
      [refOf('top-app-bar', 'bare'), 'dark'],
      [refOf('bottom-app-bar', 'bare'), 'light'],
      [refOf('bottom-app-bar', 'bare'), 'dark'],
    ]);
    for (const c of calls)
      expect(c.args).toMatchObject({ zoom: 1, padding: 16, background: 'none' });
  });

  it('fails naming a marking that the list does not have', () => {
    const bad = join(dir, 'missing.out');
    writeFileSync(bad, listFixture('Scaffold full'));
    const r = run('render', bad);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Scaffold full');
  });
});

describe('scripts/testing/slots.mjs names', () => {
  it('names 57 lists the 24 file names in the order of the calls', () => {
    const lines = run('names', '57').stdout.trim().split('\n');
    expect(lines).toHaveLength(24);
    expect(lines.slice(0, 4)).toEqual([
      'bottom-app-bar-bare-light.png',
      'bottom-app-bar-bare-dark.png',
      'bottom-app-bar-full-light.png',
      'bottom-app-bar-full-dark.png',
    ]);
    expect(lines[23]).toBe('bottom-sheet-full-dark.png');
  });

  it('names 58a and 58b list the 4 file names with the a- and b- prefix', () => {
    expect(run('names', '58a').stdout.trim().split('\n')).toEqual([
      'a-top-app-bar-light.png',
      'a-top-app-bar-dark.png',
      'a-bottom-app-bar-light.png',
      'a-bottom-app-bar-dark.png',
    ]);
    expect(run('names', '58b').stdout.trim().split('\n')).toEqual([
      'b-top-app-bar-light.png',
      'b-top-app-bar-dark.png',
      'b-bottom-app-bar-light.png',
      'b-bottom-app-bar-dark.png',
    ]);
  });
});
