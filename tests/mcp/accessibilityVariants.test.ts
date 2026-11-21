import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  a11yCall,
  a11yWorkspace,
  withAndroid,
  type A11yWorkspace,
} from './a11yWorkspace';

// `accessibility.variants` (formatVersion 21) through the MCP: the case chosen by the `kind` field of a `chip`
// replaces the role in `get_code_hints` and `get_marking`, a filter chip with no label is a pending item, and the
// resolved type (`get_component`, the annotation's type) carries `variants` with the defaults filled in.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ws: A11yWorkspace;

const call = (name: string, args: Record<string, unknown>) => a11yCall(ws, name, args);

const REF = (name: string) => `mapping://a11y/m/mk-${name}`;

async function hintsAccessibility(name: string): Promise<unknown> {
  const doc = await call('get_code_hints', { ref: REF(name), platform: 'android' });
  return doc.tree.annotations[0].accessibility;
}

async function annotationOf(name: string): Promise<Doc> {
  const marking = await call('get_marking', { ref: REF(name) });
  return (marking.layers as { annotations: Doc[] }[]).flatMap((l) => l.annotations)[0]!;
}

beforeAll(async () => {
  ws = await a11yWorkspace(
    (add) => {
      add('assist', 'chip', {
        name: 'assist',
        rect: { x: 100, y: 100, width: 360, height: 132 },
        values: { label: 'Nearby' },
      });
      add('filter', 'chip', {
        name: 'filter',
        rect: { x: 100, y: 400, width: 360, height: 132 },
        values: { kind: 'filter', label: 'Open now' },
      });
      add('bare', 'chip', {
        name: 'bare',
        rect: { x: 100, y: 700, width: 360, height: 132 },
        values: { kind: 'filter' },
      });
    },
    { tweak: withAndroid },
  );
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('get_code_hints: accessibility.variants', () => {
  it('an assist chip (no case) keeps the base role', async () => {
    expect(await hintsAccessibility('assist')).toEqual({
      role: 'button',
      label: 'Nearby',
    });
  });

  it('a filter chip gives the role of its case', async () => {
    expect(await hintsAccessibility('filter')).toEqual({
      role: 'checkbox',
      label: 'Open now',
    });
  });

  it('a filter chip with no label is a checkbox with a required, missing label', async () => {
    expect(await hintsAccessibility('bare')).toEqual({
      role: 'checkbox',
      label: null,
      missing: true,
    });
  });
});

describe('get_marking: accessibility.variants', () => {
  it('the annotation carries no pending label for the assist and filter chips', async () => {
    expect((await annotationOf('assist')).issues).toBeUndefined();
    expect((await annotationOf('filter')).issues).toBeUndefined();
  });

  it('a filter chip with no label has accessible-label-missing in issues', async () => {
    const annotation = await annotationOf('bare');
    const codes = (annotation.issues as { code: string }[]).map((i) => i.code);
    expect(codes).toContain('accessible-label-missing');
  });

  it('the type of the annotation carries the variants', async () => {
    const annotation = await annotationOf('filter');
    expect(annotation.type.accessibility.variants.field).toBe('kind');
    expect(annotation.type.accessibility.variants.cases.filter.role).toBe('checkbox');
  });
});

describe('get_component: accessibility.variants', () => {
  it('carries the variants with the effective role and the label defaults filled in', async () => {
    const chip = await call('get_component', {
      project: 'a11y',
      specId: 'accessibility',
      type: 'chip',
    });
    expect(chip.accessibility.role).toBe('button');
    expect(chip.accessibility.variants.field).toBe('kind');
    expect(chip.accessibility.variants.cases.filter).toMatchObject({
      role: 'checkbox',
    });
    expect(Object.keys(chip.accessibility.variants.cases).sort()).toEqual([
      'filter',
      'input',
    ]);
  });
});
