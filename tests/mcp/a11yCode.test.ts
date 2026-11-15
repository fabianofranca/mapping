import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  a11yCall,
  a11yWorkspace,
  withAndroid,
  type A11yWorkspace,
} from './a11yWorkspace';

// Stage #1128 (A3, decision 9 of #1081): `get_code_hints` carries `accessibility: { role, label, parts }` in each node
// of the tree, only with what exists. The label is the value of the first label field that has one; `label: null` with
// `missing: true` is a required label that is empty (the mapping lacks it); `label: null` alone is an interactive role
// that declares no label (the name comes from the code). A part whose field is the default content of a full slot is
// not there, and the child answers by its own type.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ws: A11yWorkspace;

const call = (name: string, args: Record<string, unknown>) => a11yCall(ws, name, args);

async function hints(name: string): Promise<Doc> {
  return call('get_code_hints', {
    ref: `mapping://a11y/m/mk${name}`,
    platform: 'android',
  });
}

/** The accessibility of the first annotation of the root node. */
async function accessibilityOf(name: string): Promise<unknown> {
  const doc = await hints(name);
  return doc.tree.annotations[0].accessibility;
}

beforeAll(async () => {
  ws = await a11yWorkspace(
    (add, plain, rows) => {
      add('btn', 'button', {
        name: 'btn',
        rect: { x: 100, y: 100, width: 360, height: 132 },
      });
      add('bare', 'bar', {
        name: 'bare',
        rect: { x: 100, y: 400, width: 800, height: 168 },
      });
      add('named', 'bar', {
        name: 'named',
        rect: { x: 100, y: 700, width: 800, height: 168 },
        values: { actionIcon1Description: 'Search', actionIcon2Description: 'More' },
      });
      add('full', 'bar', {
        name: 'full',
        rect: { x: 100, y: 1000, width: 800, height: 168 },
      });
      add('close', 'icon-button', {
        name: 'close',
        parentId: 'mk-full',
        slot: 'actions',
        values: { contentDescription: 'Close' },
      });
      add('unnamed', 'icon-button', {
        name: 'unnamed',
        rect: { x: 100, y: 1300, width: 132, height: 132 },
      });
      plain('slide', 'slider', { x: 100, y: 1600, width: 600, height: 132 });
      add('tabs', 'tabs', {
        name: 'tabs',
        rect: { x: 100, y: 1800, width: 800, height: 168 },
      });
      rows('tabs', [{ label: 'Home' }, { iconDescription: 'Search' }, {}]);
    },
    { tweak: withAndroid },
  );
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('get_code_hints: accessibility', () => {
  it('a type with a role and a label gives the role and the value of the label field', async () => {
    expect(await accessibilityOf('btn')).toEqual({ role: 'button', label: 'Button' });
  });

  it('an interactive type whose required label is empty gives label null and missing', async () => {
    expect(await accessibilityOf('unnamed')).toEqual({
      role: 'button',
      label: null,
      missing: true,
    });
  });

  it('an interactive role with no label declared gives label null and no missing (the name comes from the code)', async () => {
    expect(await accessibilityOf('slide')).toEqual({ role: 'slider', label: null });
  });

  it('the parts of a bar with no role come by field, each with the companion field value or missing', async () => {
    expect(await accessibilityOf('named')).toEqual({
      parts: [
        { id: 'action1', role: 'button', label: 'Search' },
        { id: 'action2', role: 'button', label: 'More' },
      ],
    });
    expect(await accessibilityOf('bare')).toEqual({
      parts: [
        { id: 'action1', role: 'button', label: null, missing: true },
        { id: 'action2', role: 'button', label: null, missing: true },
      ],
    });
  });

  it('a child in the slot: the bar has no parts (the fields are not drawn) and the child carries its own accessibility', async () => {
    const doc = await hints('full');
    const bar = doc.tree.annotations[0];
    expect(bar.accessibility).toBeUndefined();
    const arg = (bar.args as Doc[]).find((a) => a.slot === 'actions')!;
    expect(arg.children[0].annotations[0].accessibility).toEqual({
      role: 'button',
      label: 'Close',
    });
  });

  it('the parts of a table come one per row (row from 0), the first label field with a value wins', async () => {
    expect(await accessibilityOf('tabs')).toEqual({
      parts: [
        { id: 'tab', role: 'tab', label: 'Home', row: 0 },
        { id: 'tab', role: 'tab', label: 'Search', row: 1 },
        { id: 'tab', role: 'tab', label: null, missing: true, row: 2 },
      ],
    });
  });
});
