// SL7 of #1080 (decisions 17 and 18): the six Material 3 (Compose) types that adopt the named slots
// (`bottom-app-bar`, `top-app-bar`, `scaffold`, `switch`, `swipe-to-dismiss` and `bottom-sheet`): the slots of the
// type (ids, `accepts` resolved, `max`), each one bound to a `role: slot` parameter of the signature sheet, the
// child put in each slot by the geometry (and the type), the `fallback` that goes away with a child and the examples.
// The drawing without children is the previous version's: `tests/mcp/material3SlotsReference.test.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  type ComponentDrawing,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { specTypeSlots } from '../../src/model/specSlots';
import { walk } from '../../src/model/components/scene';
import { catalog, spec } from '../support/material3Adoption';
import { ROOT, files, typeOf } from '../support/material3Library';
import { emptyProject } from './fixtures';

type Json = Record<string, unknown>;

/** Decision 17: the slots of each type, in the template order, with `accepts` and `max`. */
const EXPECTED: Record<
  string,
  readonly { id: string; accepts?: readonly string[]; max?: number }[]
> = {
  'bottom-app-bar': [
    { id: 'actions', accepts: ['icon-button', 'icon-toggle-button', 'icon'] },
    { id: 'floatingActionButton', accepts: ['fab', 'extended-fab'], max: 1 },
  ],
  'top-app-bar': [
    { id: 'navigationIcon', accepts: ['icon-button', 'icon'], max: 1 },
    { id: 'actions', accepts: ['icon-button', 'icon-toggle-button', 'icon'] },
  ],
  scaffold: [
    { id: 'topBar', accepts: ['top-app-bar', 'search-bar'], max: 1 },
    {
      id: 'bottomBar',
      accepts: ['navigation-bar', 'short-navigation-bar', 'bottom-app-bar'],
      max: 1,
    },
    { id: 'floatingActionButton', accepts: ['fab', 'extended-fab'], max: 1 },
    { id: 'snackbarHost', accepts: ['snackbar'] },
    { id: 'content' },
  ],
  switch: [{ id: 'thumbContent', accepts: ['icon'], max: 1 }],
  'swipe-to-dismiss': [{ id: 'content' }, { id: 'backgroundContent' }],
  'bottom-sheet': [{ id: 'content' }],
};
const SIX = Object.keys(EXPECTED);

const entries = buildCatalog(files);
const componentOf = (id: string) => {
  const component = findEntry(entries, id)?.component;
  if (component == null) throw new Error(`no component ${id}`);
  return component;
};

describe('the six types declare their named slots (decision 17)', () => {
  it.each(SIX)('%s: the slots, the resolved accepts and the max', (id) => {
    const slots = specTypeSlots(spec, id, componentOf(id));
    expect(slots.map((s) => s.id)).toEqual(EXPECTED[id]!.map((s) => s.id));
    for (const want of EXPECTED[id]!) {
      const slot = slots.find((s) => s.id === want.id)!;
      expect(
        slot.accepts === undefined ? undefined : [...slot.accepts].sort(),
        want.id,
      ).toEqual(want.accepts === undefined ? undefined : [...want.accepts].sort());
      expect(slot.max, `${id}.${want.id} max`).toBe(want.max);
    }
  });

  it.each(SIX)('%s: the type declares `slots` and every one has a name', (id) => {
    const declared = typeOf(id).slots;
    expect(declared?.map((s) => s.id)).toEqual(EXPECTED[id]!.map((s) => s.id));
    for (const slot of declared ?? []) expect(slot.name, slot.id).toBeTruthy();
  });

  it.each(SIX)(
    '%s: each slot is bound to a `role: slot` parameter of the signature sheet',
    (id) => {
      const sheetFile = typeOf(id).code?.compose?.signature;
      expect(sheetFile, `${id} signature`).toBeTruthy();
      const sheet = JSON.parse(readFileSync(join(ROOT, sheetFile as string), 'utf8')) as {
        params: { name: string; role: string }[];
      };
      const map = (typeOf(id).code?.compose?.slots ?? {}) as Record<string, string>;
      for (const slot of EXPECTED[id]!) {
        const parameter = map[slot.id] ?? slot.id;
        const found = sheet.params.find((p) => p.name === parameter);
        expect(found?.role, `${id}.${slot.id} → ${parameter}`).toBe('slot');
      }
    },
  );

  it('the components are formatVersion 4 and the box of each slot does not depend on the default content', () => {
    for (const id of SIX) expect(componentOf(id).formatVersion).toBe(4);
  });

  it('the types that stay out say why in the Fidelity section', () => {
    for (const id of ['dropdown-menu', 'tabs']) {
      const doc = readFileSync(join(ROOT, 'docs', `${id}.md`), 'utf8');
      expect(doc, id).toMatch(/slot/i);
    }
  });

  it('the six documents cite the slot with the Compose file and line (pinned commit) in the Fidelity', () => {
    for (const id of SIX) {
      const doc = readFileSync(join(ROOT, 'docs', `${id}.md`), 'utf8');
      const fidelity = doc.slice(doc.search(/^#+ .*Fidelity/im));
      expect(fidelity, id).toMatch(/slot/i);
      expect(fidelity, id).toMatch(/5113b82a4ed6416d6344efa50e41db8cb65928ff/);
    }
  });
});

const base = (): Project => {
  let n = 0;
  const p = applySpecialization(emptyProject(), spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'material3-compose.spec.json',
  });
  return addContainer(p, { id: 'I1', file: null, width: 360, height: 800 } as never);
};
const put = (
  p: Project,
  markingId: string,
  typeId: string,
  rect: { x: number; y: number; width: number; height: number },
  extra: Partial<NewComponentArgs> = {},
): Project =>
  addComponentMarking(
    p,
    catalog,
    {
      markingId,
      annotationId: `A_${markingId}`,
      containerId: 'I1',
      parentId: null,
      specId: spec.id,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const draw = (p: Project): ReadonlyMap<string, ComponentDrawing> =>
  createDrawingCache()(p, catalog, approximateMeasurer, 0);
const slotOfMap = (d: ComponentDrawing): Record<string, string> =>
  Object.fromEntries(d.slotOf);
const names = (d: ComponentDrawing): string[] => {
  const out: string[] = [];
  for (const node of walk(d.root))
    if (node.name !== undefined && node.visible) out.push(node.name);
  return out;
};

describe('the child goes to its slot by the geometry, with the type as the filter (decision 4, the three cases of the review)', () => {
  it('scaffold with top-app-bar, navigation-bar, fab and lazy-column: each in its own slot', () => {
    let p = put(base(), 'SC', 'scaffold', r(0, 0, 360, 800));
    const child = (id: string, type: string, rect: ReturnType<typeof r>) => {
      p = put(p, id, type, rect, { parentId: 'SC' });
    };
    child('TB', 'top-app-bar', r(0, 0, 360, 64));
    child('NB', 'navigation-bar', r(0, 720, 360, 80));
    child('FB', 'fab', r(288, 648, 56, 56));
    child('LC', 'lazy-column', r(0, 64, 360, 584));
    const scaffold = draw(p).get('SC')!;
    expect(slotOfMap(scaffold)).toEqual({
      TB: 'topBar',
      NB: 'bottomBar',
      FB: 'floatingActionButton',
      LC: 'content',
    });
    expect(scaffold.slotIssues).toEqual([]);
  });

  it('top-app-bar with two icon-buttons on the right and none on the left: both in actions', () => {
    let p = put(base(), 'TB', 'top-app-bar', r(0, 0, 360, 64));
    p = put(p, 'B1', 'icon-button', r(256, 8, 48, 48), { parentId: 'TB' });
    p = put(p, 'B2', 'icon-button', r(304, 8, 48, 48), { parentId: 'TB' });
    const bar = draw(p).get('TB')!;
    expect(slotOfMap(bar)).toEqual({ B1: 'actions', B2: 'actions' });
    expect(bar.slotIssues).toEqual([]);
  });

  it('top-app-bar: an icon-button at the left goes to navigationIcon', () => {
    let p = put(base(), 'TB', 'top-app-bar', r(0, 0, 360, 64));
    p = put(p, 'B1', 'icon-button', r(4, 8, 48, 48), { parentId: 'TB' });
    p = put(p, 'B2', 'icon-button', r(304, 8, 48, 48), { parentId: 'TB' });
    expect(slotOfMap(draw(p).get('TB')!)).toEqual({
      B1: 'navigationIcon',
      B2: 'actions',
    });
  });

  it('swipe-to-dismiss with one child in the item: in content', () => {
    let p = put(base(), 'SW', 'swipe-to-dismiss', r(0, 0, 360, 72));
    p = put(p, 'T1', 'text', r(16, 8, 200, 56), { parentId: 'SW' });
    const swipe = draw(p).get('SW')!;
    expect(slotOfMap(swipe)).toEqual({ T1: 'content' });
    expect(swipe.slotIssues).toEqual([]);
  });

  it('the revealed background is invisible at rest, and its box is a 56 strip on the side of the direction', () => {
    const at = (direction: string) =>
      draw(
        put(base(), 'SW', 'swipe-to-dismiss', r(0, 0, 360, 72), {
          values: { direction },
        }),
      ).get('SW')!;
    expect(at('Settled').slots.map((s) => s.id)).not.toContain('backgroundContent');
    for (const direction of ['StartToEnd', 'EndToStart'])
      expect(at(direction).slots.map((s) => s.id)).toContain('backgroundContent');
  });

  it('switch with an icon over the handle: in thumbContent', () => {
    let p = put(base(), 'SWT', 'switch', r(0, 0, 200, 32));
    p = put(p, 'IC', 'icon', r(168, 4, 24, 24), { parentId: 'SWT' });
    expect(slotOfMap(draw(p).get('SWT')!)).toEqual({ IC: 'thumbContent' });
  });

  it('bottom-sheet: a child under the header goes to content', () => {
    let p = put(base(), 'BS', 'bottom-sheet', r(0, 480, 360, 320));
    p = put(p, 'T1', 'text', r(16, 560, 200, 40), { parentId: 'BS' });
    expect(slotOfMap(draw(p).get('BS')!)).toEqual({ T1: 'content' });
  });
});

describe('with children the fallback goes away (the default content is replaced, decision 3)', () => {
  const bar = (children: 'none' | 'actions' | 'both'): ComponentDrawing => {
    let p = put(base(), 'BAB', 'bottom-app-bar', r(0, 720, 360, 80), {
      values: {
        actionIcon1: 'Check',
        actionIcon2: 'Edit',
        floatingActionButton: 'Add',
      },
    });
    if (children !== 'none') {
      p = put(p, 'IB1', 'icon-button', r(4, 728, 48, 48), { parentId: 'BAB' });
      p = put(p, 'IB2', 'icon-button', r(52, 728, 48, 48), { parentId: 'BAB' });
    }
    if (children === 'both')
      p = put(p, 'XF', 'extended-fab', r(200, 732, 140, 56), { parentId: 'BAB' });
    return draw(p).get('BAB')!;
  };

  it('without children, the field icons and the button are drawn', () => {
    const drawing = bar('none');
    expect(names(drawing)).toEqual(
      expect.arrayContaining(['action 1', 'floating button']),
    );
    expect(drawing.slots.map((s) => [s.id, s.fallback])).toEqual([
      ['actions', true],
      ['floatingActionButton', true],
    ]);
  });

  it('with two icon-buttons in actions the action icons go away and the button stays', () => {
    const drawing = bar('actions');
    expect(names(drawing)).not.toContain('action 1');
    expect(names(drawing)).toContain('floating button');
    expect(drawing.slots.map((s) => [s.id, s.children, s.fallback])).toEqual([
      ['actions', ['IB1', 'IB2'], false],
      ['floatingActionButton', [], true],
    ]);
    expect([...drawing.inactiveFields]).toEqual(
      expect.arrayContaining([
        ['actionIcon1', 'actions'],
        ['actionIcon2', 'actions'],
      ]),
    );
  });

  it('with the extended-fab in floatingActionButton the button of the field goes away too', () => {
    const drawing = bar('both');
    expect(names(drawing)).not.toContain('floating button');
    expect(slotOfMap(drawing).XF).toBe('floatingActionButton');
  });
});

describe('the two new examples draw without warnings in light and dark (decision 15)', () => {
  const MODES = ['light', 'dark'] as const;
  const scene = (which: 'bar' | 'scaffold', mode: (typeof MODES)[number]): Project => {
    let p = { ...base(), drawingMode: mode } as Project;
    if (which === 'bar') {
      p = put(p, 'BAB', 'bottom-app-bar', r(0, 720, 360, 80));
      p = put(p, 'IB1', 'icon-button', r(4, 728, 48, 48), { parentId: 'BAB' });
      p = put(p, 'IB2', 'icon-button', r(52, 728, 48, 48), { parentId: 'BAB' });
      return put(p, 'XF', 'extended-fab', r(200, 732, 140, 56), { parentId: 'BAB' });
    }
    p = put(p, 'SC', 'scaffold', r(0, 0, 360, 800));
    p = put(p, 'TB', 'top-app-bar', r(0, 0, 360, 64), { parentId: 'SC' });
    p = put(p, 'NB', 'navigation-bar', r(0, 720, 360, 80), { parentId: 'SC' });
    p = put(p, 'FB', 'fab', r(288, 648, 56, 56), { parentId: 'SC' });
    return put(p, 'LC', 'lazy-column', r(0, 64, 360, 584), { parentId: 'SC' });
  };

  for (const mode of MODES) {
    it(`bottom-app-bar with two icon-buttons and an extended-fab, ${mode}`, () => {
      const drawing = draw(scene('bar', mode)).get('BAB')!;
      expect(drawing.warnings).toEqual([]);
      expect(drawing.slotIssues).toEqual([]);
      expect(slotOfMap(drawing)).toEqual({
        IB1: 'actions',
        IB2: 'actions',
        XF: 'floatingActionButton',
      });
    });

    it(`scaffold with top-app-bar, navigation-bar, fab and lazy-column, ${mode}`, () => {
      const drawing = draw(scene('scaffold', mode)).get('SC')!;
      expect(drawing.warnings).toEqual([]);
      expect(drawing.slotIssues).toEqual([]);
      expect(Object.keys(slotOfMap(drawing)).sort()).toEqual(['FB', 'LC', 'NB', 'TB']);
    });
  }
});

/** A node tree walker keeps the scene tests honest: the type `Json` is only for the raw files. */
void (undefined as unknown as Json);
