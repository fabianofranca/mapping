import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCREEN, slotsWorkspace, type Workspace } from './slotsWorkspace';

// The slot views (stage #1080, SL5, decision 12): `get_marking` of the mother carries `slots`, the child's
// carries `slot`; `get_component` and the annotation's `type` carry the type's `slots` with `accepts` resolved,
// `max` and the parameter of each platform.

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ws: Workspace;
const refs = new Map<string, string>();

async function call(name: string, args: Record<string, unknown>) {
  const result = await ws.client.callTool({ name, arguments: args });
  return JSON.parse((result.content as { text: string }[])[0]!.text) as Doc;
}

beforeAll(async () => {
  ws = await slotsWorkspace(
    (add) => {
      add('bar', 'bar', {
        name: 'bar',
        rect: { x: 100, y: 100, width: 360, height: 56 },
      });
      add('p1', 'pin', { name: 'p1', parentId: 'mk-bar', slot: 'navigationIcon' });
      add('p2', 'pin', { name: 'p2', rect: { x: 100, y: 400, width: 24, height: 24 } });
    },
    {
      tweak: (spec) => {
        spec.platforms = [{ id: 'compose', name: 'Compose', language: 'kotlin' }];
        const bar = spec.layers[0].annotationTypes.find((t: Doc) => t.id === 'bar');
        bar.code = {
          compose: { symbol: 'demo.Bar', slots: { actions: 'trailingContent' } },
        };
      },
    },
  );
  const rows = (await call('list_markings', { project: 'slots', container: SCREEN }))
    .markings as { ref: string; name: string }[];
  for (const r of rows) refs.set(r.name, r.ref);
});

afterAll(async () => {
  await ws.client.close();
  rmSync(ws.base, { recursive: true, force: true });
});

describe('get_marking with slots', () => {
  it('the mother lists its slots, with the children as refs and whether the default content shows', async () => {
    const view = await call('get_marking', { ref: refs.get('bar') });
    expect(view.slots).toEqual([
      {
        id: 'navigationIcon',
        name: 'Navigation icon',
        children: [refs.get('p1')],
        fallback: false,
      },
      { id: 'actions', name: 'Actions', children: [], fallback: true },
    ]);
  });

  it('the child says which slot it is in', async () => {
    const view = await call('get_marking', { ref: refs.get('p1') });
    expect(view.slot).toEqual({ id: 'navigationIcon', name: 'Navigation icon' });
  });

  it('a marking outside any component with slots carries neither', async () => {
    const view = await call('get_marking', { ref: refs.get('p2') });
    expect(view.slot).toBeUndefined();
    expect(view.slots).toBeUndefined();
  });
});

describe('get_component and the annotation type with slots', () => {
  const expected = [
    {
      id: 'navigationIcon',
      name: 'Navigation icon',
      description: 'The icon on the left of the title.',
      accepts: ['pin'],
      max: 1,
      parameters: { compose: 'navigationIcon' },
    },
    {
      id: 'actions',
      name: 'Actions',
      description: 'The actions on the right of the title.',
      accepts: ['pin'],
      max: 3,
      parameters: { compose: 'trailingContent' },
    },
  ];

  it('get_component returns the slots with accepts resolved, max and the parameter per platform', async () => {
    const view = await call('get_component', {
      project: 'slots',
      specId: 'slots',
      type: 'bar',
    });
    expect(view.slots).toEqual(expected);
  });

  it('a type whose component has no slot with an id has no slots key', async () => {
    const view = await call('get_component', {
      project: 'slots',
      specId: 'slots',
      type: 'pin',
    });
    expect(view.slots).toBeUndefined();
  });

  it('get_component by path reads the slots without a project', async () => {
    const view = await call('get_component', {
      path: `${ws.dir}/specs/slots/slots.spec.json`,
      type: 'bar',
    });
    expect(view.slots.map((s: Doc) => [s.id, s.accepts, s.max])).toEqual([
      ['navigationIcon', ['pin'], 1],
      ['actions', ['pin'], 3],
    ]);
  });

  it('get_annotation shows the same slots in the type', async () => {
    const marking = await call('get_marking', { ref: refs.get('bar') });
    const annotation = await call('get_annotation', {
      ref: marking.layers[0].annotations[0].ref,
    });
    expect(annotation.type.slots).toEqual(expected);
  });
});
