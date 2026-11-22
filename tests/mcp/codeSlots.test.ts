import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SCREEN,
  slotsWorkspace,
  type SlotsOptions,
  type Workspace,
} from './slotsWorkspace';

// `get_code_hints` with the named slots (stage #1080, SL5, decision 11): the child markings go inside the
// argument of the slot they sit in (`{ name, slot, trailing?, children }`), after the value arguments, out of
// the node's `children`; the default-content fields of a filled slot leave the `args`; with the slots empty the
// answer is the one of before. `trailing` comes from the signature sheet (#1079): the last parameter.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
    { name: 'navLabel', role: 'value', type: 'String', value: { kind: 'text' } },
    { name: 'actionLabel', role: 'value', type: 'String', value: { kind: 'text' } },
    { name: 'navigationIcon', role: 'slot', type: '@Composable () -> Unit' },
    { name: 'trailingContent', role: 'slot', type: '@Composable () -> Unit' },
  ],
});

const OPTIONS: SlotsOptions = {
  tweak: (spec: Doc) => {
    spec.platforms = [
      { id: 'compose', name: 'Compose', language: 'kotlin' },
      { id: 'web', name: 'Web', language: 'typescript' },
    ];
    const types: Doc[] = spec.layers[0].annotationTypes;
    const params = { title: 'title', navLabel: 'navLabel', actionLabel: 'actionLabel' };
    types.find((t) => t.id === 'bar')!.code = {
      compose: {
        symbol: 'demo.Bar',
        path: 'Bar.kt',
        signature: 'signatures/bar.compose.json',
        params,
        slots: { actions: 'trailingContent' },
      },
      web: { symbol: 'demo-bar', params },
    };
    types.find((t) => t.id === 'pin')!.code = {
      compose: { symbol: 'demo.Pin', params: { label: 'label' } },
      web: { symbol: 'demo-pin', params: { label: 'label' } },
    };
  },
  files: { 'signatures/bar.compose.json': SIGNATURE },
};

let ws: Workspace;

async function call(name: string, args: Record<string, unknown>) {
  const result = await ws.client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  return JSON.parse(text) as Doc;
}

async function refByName(name: string): Promise<string> {
  const list = await call('list_markings', { project: 'slots', container: SCREEN });
  const rows = list.markings as { ref: string; name: string | null }[];
  const found = rows.find((r) => r.name === name);
  if (found === undefined) throw new Error(`no marking ${name}`);
  return found.ref;
}

async function hints(name: string, platform = 'compose'): Promise<Doc> {
  return call('get_code_hints', { ref: await refByName(name), platform });
}

const argsOf = (doc: Doc, index = 0): Doc[] => doc.tree.annotations[index].args ?? [];
const slotArgs = (doc: Doc): Doc[] => argsOf(doc).filter((a) => a.slot !== undefined);
const childNames = (arg: Doc): string[] => arg.children.map((c: Doc) => c.name);

beforeAll(async () => {
  ws = await slotsWorkspace((add) => {
    // Both slots filled: one pin in navigationIcon, two in actions.
    add('both', 'bar', {
      name: 'both',
      rect: { x: 100, y: 100, width: 360, height: 56 },
      values: { navLabel: 'Back', actionLabel: 'More' },
    });
    add('b1', 'pin', { name: 'b1', parentId: 'mk-both', slot: 'navigationIcon' });
    add('b2', 'pin', { name: 'b2', parentId: 'mk-both', slot: 'actions' });
    add('b3', 'pin', { name: 'b3', parentId: 'mk-both', slot: 'actions' });
    // Only actions filled.
    add('act', 'bar', {
      name: 'act',
      rect: { x: 100, y: 300, width: 360, height: 56 },
      values: { navLabel: 'Back', actionLabel: 'More' },
    });
    add('a1', 'pin', { name: 'a1', parentId: 'mk-act', slot: 'actions' });
    // No children: the default content stays.
    add('lone', 'bar', {
      name: 'lone',
      rect: { x: 100, y: 500, width: 360, height: 56 },
      values: { navLabel: 'Back', actionLabel: 'More' },
    });
  }, OPTIONS);
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('get_code_hints with named slots', () => {
  it('puts each child in the argument of its slot, in the template order, out of the node children', async () => {
    const doc = await hints('both');
    const slots = slotArgs(doc);
    expect(slots.map((a) => [a.name, a.slot])).toEqual([
      ['navigationIcon', 'navigationIcon'],
      ['trailingContent', 'actions'],
    ]);
    expect(childNames(slots[0]!)).toEqual(['b1']);
    expect(childNames(slots[1]!)).toEqual(['b2', 'b3']);
    expect(doc.tree.children).toBeUndefined();
  });

  it('the slot arguments come after the value ones, and the child node is the usual node', async () => {
    const doc = await hints('both');
    const args = argsOf(doc);
    const firstSlot = args.findIndex((a) => a.slot !== undefined);
    expect(args.slice(0, firstSlot).every((a) => a.slot === undefined)).toBe(true);
    expect(args.slice(firstSlot).every((a) => a.slot !== undefined)).toBe(true);
    const pin = slotArgs(doc)[0]!.children[0];
    expect(pin.rect).toBeDefined();
    expect(pin.annotations[0].type).toBe('slots/pin');
    expect(pin.annotations[0].args).toMatchObject([{ field: 'label', name: 'label' }]);
  });

  it('the default-content fields of a filled slot leave the args; the others stay', async () => {
    const both = argsOf(await hints('both')).map((a) => a.field);
    expect(both).toContain('title');
    expect(both).not.toContain('navLabel');
    expect(both).not.toContain('actionLabel');
    const act = argsOf(await hints('act')).map((a) => a.field);
    expect(act).toContain('navLabel');
    expect(act).not.toContain('actionLabel');
  });

  it('only the filled slot gets an argument', async () => {
    const doc = await hints('act');
    expect(slotArgs(doc).map((a) => a.slot)).toEqual(['actions']);
    expect(childNames(slotArgs(doc)[0]!)).toEqual(['a1']);
  });

  it('trailing comes from the signature sheet: only the last parameter', async () => {
    const doc = await hints('both');
    const [nav, trailing] = slotArgs(doc);
    expect(nav!.trailing).toBeUndefined();
    expect(trailing!.trailing).toBe(true);
  });

  it('without the sheet there is no trailing, and the parameter is the slot id', async () => {
    const doc = await hints('both', 'web');
    expect(slotArgs(doc).map((a) => [a.name, a.slot, a.trailing])).toEqual([
      ['navigationIcon', 'navigationIcon', undefined],
      ['actions', 'actions', undefined],
    ]);
  });

  it('with the slots empty the answer is the one of today: the field args, no slot argument', async () => {
    const doc = await hints('lone');
    expect(slotArgs(doc)).toEqual([]);
    expect(argsOf(doc).map((a) => [a.field, a.value])).toEqual([
      ['title', 'Title'],
      ['navLabel', 'Back'],
      ['actionLabel', 'More'],
    ]);
    expect(doc.tree.children).toBeUndefined();
  });
});

// A `variants` case with its own sheet (stage #2361, SL1): the case's `slots` are added to the base's, and the base
// slot its sheet lacks is not inherited.
const sheetOf = (symbol: string, path: string, slots: string[]): string =>
  JSON.stringify({
    format: 'mapping-signature',
    formatVersion: 1,
    source: {
      kind: 'code',
      platform: 'compose',
      language: 'kotlin',
      symbol,
      path,
      extractor: 'agent',
    },
    params: [
      { name: 'title', role: 'value', type: 'String', value: { kind: 'text' } },
      ...slots.map((name) => ({ name, role: 'slot', type: '@Composable () -> Unit' })),
    ],
  });

const VARIANTS: SlotsOptions = {
  tweak: (spec: Doc) => {
    spec.platforms = [{ id: 'compose', name: 'Compose', language: 'kotlin' }];
    const types: Doc[] = spec.layers[0].annotationTypes;
    const bar = types.find((t) => t.id === 'bar')!;
    bar.fields.push({
      key: 'style',
      type: 'enum',
      options: ['small', 'center'],
      default: 'small',
    });
    bar.code = {
      compose: {
        symbol: 'demo.Bar',
        path: 'demo/Bar.kt',
        signature: 'signatures/bar.compose.json',
        params: { title: 'title' },
        slots: { actions: 'trailingContent' },
        variants: {
          field: 'style',
          cases: {
            center: {
              symbol: 'demo.CenterBar',
              path: 'demo/CenterBar.kt',
              signature: 'signatures/bar.center.compose.json',
              slots: { navigationIcon: 'leading' },
            },
          },
        },
      },
    };
    types.find((t) => t.id === 'pin')!.code = {
      compose: { symbol: 'demo.Pin', params: { label: 'label' } },
    };
  },
  files: {
    'signatures/bar.compose.json': sheetOf('demo.Bar', 'demo/Bar.kt', [
      'navigationIcon',
      'trailingContent',
    ]),
    'signatures/bar.center.compose.json': sheetOf('demo.CenterBar', 'demo/CenterBar.kt', [
      'leading',
      'actions',
    ]),
  },
};

describe('get_code_hints with the slots of a variants case', () => {
  beforeAll(async () => {
    await ws.client.close();
    rmSync(ws.base, { recursive: true, force: true });
    ws = await slotsWorkspace((add) => {
      for (const [id, style, y] of [
        ['center', 'center', 100],
        ['small', 'small', 300],
      ] as const) {
        add(id, 'bar', {
          name: id,
          rect: { x: 100, y, width: 360, height: 56 },
          values: { style, title: 'T' },
        });
        add(`${id}1`, 'pin', {
          name: `${id}1`,
          parentId: `mk-${id}`,
          slot: 'navigationIcon',
        });
        add(`${id}2`, 'pin', { name: `${id}2`, parentId: `mk-${id}`, slot: 'actions' });
      }
    }, VARIANTS);
  });

  it('a center bar names its slot arguments by the case sheet; the base slot it lacks is not inherited', async () => {
    const doc = await hints('center');
    expect(doc.tree.annotations[0].symbol ?? doc.tree.annotations[0].code?.symbol).toBe(
      'demo.CenterBar',
    );
    expect(slotArgs(doc).map((a) => [a.name, a.slot])).toEqual([
      ['leading', 'navigationIcon'],
      ['actions', 'actions'],
    ]);
  });

  it('a small bar keeps the base slots', async () => {
    expect(slotArgs(await hints('small')).map((a) => [a.name, a.slot])).toEqual([
      ['navigationIcon', 'navigationIcon'],
      ['trailingContent', 'actions'],
    ]);
  });
});
