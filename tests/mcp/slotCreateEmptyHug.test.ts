import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCREEN, slotsWorkspace, type Workspace } from './slotsWorkspace';

// F1 of #2511 (R16.12, R28.16): `create_marking` with `inside` + `slot` in a bar whose `actions` slot is empty
// (no `actionLabel`, so its fallback is not drawn and the `hug` slot has no width). The child still goes to the
// right side of the bar, as it does with the label; `navigationIcon` stays at the start.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ws: Workspace;

async function call(name: string, args: Record<string, unknown>): Promise<Doc> {
  const result = await ws.client.callTool({ name, arguments: args });
  return JSON.parse((result.content as { text: string }[])[0]!.text);
}

const SIGNATURE = JSON.stringify({
  format: 'mapping-signature',
  formatVersion: 1,
  source: {
    kind: 'code',
    platform: 'compose',
    language: 'kotlin',
    symbol: 'demo.Bar',
    path: 'Bar.kt',
    extractor: 'agent',
  },
  params: [
    { name: 'title', role: 'value', type: 'String', value: { kind: 'text' } },
    { name: 'navigationIcon', role: 'slot', type: '@Composable () -> Unit' },
    { name: 'trailingContent', role: 'slot', type: '@Composable () -> Unit' },
  ],
});

beforeAll(async () => {
  ws = await slotsWorkspace(
    (add) => {
      add('bar', 'bar', { name: 'bar', rect: { x: 0, y: 0, width: 400, height: 56 } });
      add('nav', 'pin', { name: 'nav', parentId: 'mk-bar', slot: 'navigationIcon' });
      add('act', 'pin', { name: 'act', parentId: 'mk-bar', slot: 'actions' });
    },
    {
      tweak: (spec: Doc) => {
        spec.platforms = [{ id: 'compose', name: 'Compose', language: 'kotlin' }];
        const types: Doc[] = spec.layers[0].annotationTypes;
        types.find((t) => t.id === 'bar')!.code = {
          compose: {
            symbol: 'demo.Bar',
            path: 'Bar.kt',
            signature: 'signatures/bar.compose.json',
            params: { title: 'title' },
            slots: { actions: 'trailingContent' },
          },
        };
        types.find((t) => t.id === 'pin')!.code = {
          compose: { symbol: 'demo.Pin', params: { label: 'label' } },
        };
      },
      files: { 'signatures/bar.compose.json': SIGNATURE },
    },
  );
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('inside + slot in a bar with an empty actions slot', () => {
  it('the batch puts the actions child past the middle of the bar, fitting, and the nav child at its start', async () => {
    const reply = await call('plan_changes', {
      project: 'slots',
      operations: [
        {
          op: 'add_container',
          name: 'Batch screen',
          width: 400,
          height: 300,
          background: '#DDEEFF',
          as: '$c',
        },
        {
          op: 'create_marking',
          container: '$c',
          rect: { x: 0, y: 0, width: 400, height: 56 },
          annotation: { type: 'slots/bar' },
          as: '$bar',
        },
        {
          op: 'create_marking',
          inside: '$bar',
          slot: 'navigationIcon',
          annotation: { type: 'slots/pin' },
        },
        {
          op: 'create_marking',
          inside: '$bar',
          slot: 'actions',
          annotation: { type: 'slots/pin' },
        },
      ],
    });
    expect(reply.errors).toBeUndefined();
    const at = (line: string): number => Number(/\(x (-?\d+),/.exec(line)![1]);
    expect(at(reply.summary[2])).toBeLessThan(60);
    expect(at(reply.summary[3])).toBeGreaterThan(200);
    expect(JSON.stringify(reply.warnings ?? [])).not.toMatch(/did not fit/);
  });

  it('the stored pins sit in the slots they were placed in and get_code_hints names them', async () => {
    const rows = (await call('list_markings', { project: 'slots', container: SCREEN }))
      .markings as { ref: string; name: string; rect: { x: number } }[];
    const nav = rows.find((r) => r.name === 'nav')!;
    const act = rows.find((r) => r.name === 'act')!;
    expect(nav.rect.x).toBeLessThan(60);
    expect(act.rect.x).toBeGreaterThan(200);
    const hints = await call('get_code_hints', {
      ref: rows.find((r) => r.name === 'bar')!.ref,
      platform: 'compose',
    });
    const text = JSON.stringify(hints);
    expect(text).toMatch(/"slot":"navigationIcon"/);
    expect(text).toMatch(/"slot":"actions"/);
    expect(text).toMatch(/trailingContent/);
  });

  it('a second child in a hug slot that already holds one warns that it did not fit instead of covering the title', async () => {
    const reply = await call('plan_changes', {
      project: 'slots',
      operations: [
        {
          op: 'add_container',
          name: 'Full slot screen',
          width: 400,
          height: 300,
          background: '#DDEEFF',
          as: '$c',
        },
        {
          op: 'create_marking',
          container: '$c',
          rect: { x: 0, y: 0, width: 400, height: 56 },
          annotation: { type: 'slots/bar' },
          as: '$bar',
        },
        {
          op: 'create_marking',
          inside: '$bar',
          slot: 'actions',
          annotation: { type: 'slots/pin' },
        },
        {
          op: 'create_marking',
          inside: '$bar',
          slot: 'actions',
          annotation: { type: 'slots/pin' },
        },
      ],
    });
    expect(reply.errors).toBeUndefined();
    const at = (line: string): number => Number(/\(x (-?\d+),/.exec(line)![1]);
    const second = at(reply.summary[3]);
    const firstOk = at(reply.summary[2]) > 200;
    expect(firstOk).toBe(true);
    // Either it sits in the slot past the middle, or the batch says it did not fit: never silently over the title.
    expect(second > 200 || /did not fit/.test(JSON.stringify(reply.warnings ?? []))).toBe(
      true,
    );
  });
});
