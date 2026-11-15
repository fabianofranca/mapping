// Named slots (stage #1080, SL1): the pure functions of `slots.ts`: `componentSlots`,
// `fallbackFields`, `assignSlots` (decision 4) and `slotForPlacement` (decision 5).
import { describe, expect, it } from 'vitest';
import { findSlot, hasSlot } from '../../../src/model/components/arrange';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import type { TypeDef } from '../../../src/model/components/library';
import { parseComponent } from '../../../src/model/components/parseComponent';
import {
  assignSlots,
  componentSlots,
  fallbackFields,
  slotForPlacement,
  slotKey,
  type SlotChild,
  type SlotInput,
} from '../../../src/model/components/slots';

type Node = Record<string, unknown>;

function parsed(children: readonly unknown[]): ComponentFile {
  const result = parseComponent({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'bar',
    name: 'Bar',
    size: { width: 360, height: 64 },
    template: { type: 'frame', children },
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

const slot = (id: string | undefined, extra: Node = {}): Node => ({
  type: 'slot',
  ...(id === undefined ? {} : { id }),
  ...extra,
});
const text = (field: string): Node => ({ type: 'text', text: { $field: field } });
const fallbackOf = (...fields: string[]): Node => ({
  type: 'frame',
  children: fields.map(text),
});

describe('componentSlots', () => {
  it('lists the slots in template order, in depth', () => {
    const component = parsed([
      slot('a'),
      { type: 'frame', children: [slot('b'), { type: 'frame', children: [slot('c')] }] },
      slot('d'),
    ]);
    expect(componentSlots(component).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is empty without a slot', () => {
    expect(componentSlots(parsed([text('x')]))).toEqual([]);
  });

  it('does not enter a fallback (it cannot have a slot) nor lose a slot with fallback', () => {
    const component = parsed([slot('a', { fallback: fallbackOf('x') }), slot('b')]);
    expect(componentSlots(component).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('returns the same list for the same component (memoized, nothing to recompute)', () => {
    const component = parsed([slot('a')]);
    expect(componentSlots(component)).toBe(componentSlots(component));
  });

  it('findSlot is the first slot and hasSlot keeps the answer of today', () => {
    const component = parsed([{ type: 'frame', children: [slot('x')] }, slot('y')]);
    expect(findSlot(component)).toBe(componentSlots(component)[0]);
    expect(findSlot(component)?.id).toBe('x');
    expect(findSlot(parsed([text('x')]))).toBeUndefined();
    const type = (c: ComponentFile | undefined) =>
      ({ component: c }) as unknown as TypeDef;
    expect(hasSlot(type(component))).toBe(true);
    expect(hasSlot(type(parsed([text('x')])))).toBe(false);
    expect(hasSlot(type(undefined))).toBe(false);
    expect(hasSlot(undefined)).toBe(false);
  });

  it('slotKey is the id, and the empty key for the only slot without one', () => {
    expect(slotKey({ id: 'a' })).toBe('a');
    expect(slotKey({})).toBe('');
  });
});

describe('fallbackFields', () => {
  it('lists, per slot, the fields only its fallback cites', () => {
    const component = parsed([
      text('title'),
      slot('a', { fallback: fallbackOf('iconA', 'title') }),
      slot('b', { fallback: fallbackOf('iconB') }),
      slot('c'),
    ]);
    const fields = fallbackFields(component);
    expect([...fields.keys()]).toEqual(['a', 'b']);
    expect([...(fields.get('a') ?? [])]).toEqual(['iconA']);
    expect([...(fields.get('b') ?? [])]).toEqual(['iconB']);
  });

  it('a field cited by the rest of the template, in any node, is not of the fallback', () => {
    const component = parsed([
      { type: 'rect', visible: { $has: 'shared' } },
      slot('a', { fallback: fallbackOf('shared') }),
    ]);
    expect(fallbackFields(component).get('a')?.size).toBe(0);
  });

  it('a field cited by the fallback of two slots belongs to both', () => {
    const component = parsed([
      slot('a', { fallback: fallbackOf('x') }),
      slot('b', { fallback: fallbackOf('x') }),
    ]);
    const fields = fallbackFields(component);
    expect([...(fields.get('a') ?? [])]).toEqual(['x']);
    expect([...(fields.get('b') ?? [])]).toEqual(['x']);
  });

  it('counts the table of a repeat in the fallback, not its row columns', () => {
    const component = parsed([
      slot('a', {
        fallback: {
          type: 'frame',
          children: [
            { type: 'repeat', field: 'rows', template: fallbackOf('column') },
            { type: 'text', text: { $field: 'label' } },
          ],
        },
      }),
    ]);
    expect([...(fallbackFields(component).get('a') ?? [])].sort()).toEqual([
      'label',
      'rows',
    ]);
  });

  it('an unnamed single slot answers to the empty key', () => {
    const component = parsed([slot(undefined, { fallback: fallbackOf('x') })]);
    expect([...(fallbackFields(component).get('') ?? [])]).toEqual(['x']);
  });

  it('is empty for a component without fallback', () => {
    expect(fallbackFields(parsed([slot('a')])).size).toBe(0);
  });
});

// A top app bar: the navigation icon on the left, the actions on the right (empty slots hug to 0).
const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const types = (...ids: string[]): ReadonlySet<string> => new Set(ids);
const child = (id: string, box: ReturnType<typeof rect>, typeId?: string): SlotChild => ({
  id,
  rect: box,
  ...(typeId === undefined ? {} : { typeId }),
});

describe('assignSlots', () => {
  const bar: SlotInput[] = [
    { id: 'navigationIcon', box: rect(4, 8, 0, 48), accepts: types('icon-button') },
    { id: 'title', box: rect(60, 8, 160, 48), accepts: types('text') },
    { id: 'actions', box: rect(300, 8, 0, 48), accepts: types('icon-button') },
  ];

  it('a single slot gives the result of today: every child goes to it', () => {
    const result = assignSlots(
      [{ id: 'content', box: rect(0, 0, 100, 100) }],
      [child('a', rect(500, 500, 10, 10)), child('b', rect(0, 0, 5, 5), 'card')],
    );
    expect([...result.slotOf]).toEqual([
      ['a', 'content'],
      ['b', 'content'],
    ]);
    expect(result.children.get('content')).toEqual(['a', 'b']);
    expect(result.issues).toEqual([]);
    expect(result.unassigned).toEqual([]);
  });

  it('the child goes to the slot of greatest intersection with its rectangle', () => {
    const slots: SlotInput[] = [
      { id: 'left', box: rect(0, 0, 100, 100) },
      { id: 'right', box: rect(100, 0, 100, 100) },
    ];
    const result = assignSlots(slots, [
      child('a', rect(70, 10, 40, 40)),
      child('b', rect(90, 10, 40, 40)),
    ]);
    expect(result.slotOf.get('a')).toBe('left');
    expect(result.slotOf.get('b')).toBe('right');
  });

  it('equal intersections tie by template order', () => {
    const slots: SlotInput[] = [
      { id: 'first', box: rect(0, 0, 100, 100) },
      { id: 'second', box: rect(0, 0, 100, 100) },
    ];
    expect(assignSlots(slots, [child('a', rect(10, 10, 20, 20))]).slotOf.get('a')).toBe(
      'first',
    );
  });

  it('with no intersection, the nearest by the distance between centers', () => {
    const slots: SlotInput[] = [
      { id: 'far', box: rect(0, 0, 10, 10) },
      { id: 'near', box: rect(200, 0, 10, 10) },
    ];
    expect(assignSlots(slots, [child('a', rect(150, 0, 10, 10))]).slotOf.get('a')).toBe(
      'near',
    );
  });

  it('two icons to the right of a bar with no icon on the left both go to actions', () => {
    const result = assignSlots(bar, [
      child('i1', rect(240, 8, 48, 48), 'icon-button'),
      child('i2', rect(292, 8, 48, 48), 'icon-button'),
    ]);
    expect(result.children.get('actions')).toEqual(['i1', 'i2']);
    expect(result.children.get('navigationIcon')).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('an icon at the left goes to the navigation icon', () => {
    const result = assignSlots(bar, [child('i', rect(0, 4, 48, 48), 'icon-button')]);
    expect(result.slotOf.get('i')).toBe('navigationIcon');
  });

  describe('scaffold: the explicit accepts wins over the slot without accepts', () => {
    const scaffold: SlotInput[] = [
      { id: 'topBar', box: rect(0, 0, 360, 64), accepts: types('top-app-bar') },
      { id: 'content', box: rect(0, 0, 360, 640) },
      { id: 'bottomBar', box: rect(0, 560, 360, 80), accepts: types('bottom-app-bar') },
      {
        id: 'floatingActionButton',
        box: rect(280, 560, 56, 56),
        accepts: types('fab'),
      },
    ];

    it('the bars go to their slots even when they overlap the content more', () => {
      const result = assignSlots(scaffold, [
        child('bar', rect(0, 0, 360, 140), 'top-app-bar'),
        child('nav', rect(0, 500, 360, 140), 'bottom-app-bar'),
        child('fab', rect(280, 560, 56, 56), 'fab'),
      ]);
      expect(result.slotOf.get('bar')).toBe('topBar');
      expect(result.slotOf.get('nav')).toBe('bottomBar');
      expect(result.slotOf.get('fab')).toBe('floatingActionButton');
      expect(result.issues).toEqual([]);
    });

    it('a card with another type goes to the slot without accepts (content)', () => {
      const result = assignSlots(scaffold, [
        child('card', rect(10, 80, 340, 200), 'card'),
      ]);
      expect(result.slotOf.get('card')).toBe('content');
      expect(result.issues).toEqual([]);
    });

    it('a child without a type enters only the slots without accepts', () => {
      const result = assignSlots(scaffold, [child('free', rect(0, 0, 360, 60))]);
      expect(result.slotOf.get('free')).toBe('content');
      expect(result.issues).toEqual([]);
    });

    it('an empty bar slot (hug 0) does not pull the content child by geometry', () => {
      const empty: SlotInput[] = [
        { id: 'topBar', box: rect(0, 0, 0, 0), accepts: types('top-app-bar') },
        { id: 'content', box: rect(0, 0, 360, 640) },
      ];
      const result = assignSlots(empty, [child('card', rect(0, 0, 360, 200), 'card')]);
      expect(result.slotOf.get('card')).toBe('content');
    });
  });

  describe('swipe-to-dismiss: two slots with different accepts', () => {
    it('the explicit one takes its type and the other one takes the rest', () => {
      const slots: SlotInput[] = [
        { id: 'background', box: rect(0, 0, 360, 72), accepts: types('icon') },
        { id: 'content', box: rect(0, 0, 360, 72) },
      ];
      const result = assignSlots(slots, [
        child('i', rect(300, 20, 24, 24), 'icon'),
        child('c', rect(0, 0, 360, 72), 'list-item'),
      ]);
      expect(result.slotOf.get('i')).toBe('background');
      expect(result.slotOf.get('c')).toBe('content');
    });
  });

  it('with no slot that accepts the type, slot-not-accepted at the one of greatest intersection', () => {
    const slots: SlotInput[] = [
      { id: 'a', box: rect(0, 0, 50, 50), accepts: types('icon') },
      { id: 'b', box: rect(50, 0, 100, 50), accepts: types('text') },
    ];
    const result = assignSlots(slots, [child('x', rect(40, 0, 100, 50), 'card')]);
    expect(result.slotOf.get('x')).toBe('b');
    expect(result.issues).toEqual([
      { code: 'slot-not-accepted', childId: 'x', slotId: 'b' },
    ]);
  });

  it('a child without a type with only slots with accepts is also slot-not-accepted', () => {
    const slots: SlotInput[] = [
      { id: 'a', box: rect(0, 0, 50, 50), accepts: types('icon') },
    ];
    const result = assignSlots(slots, [child('x', rect(0, 0, 10, 10))]);
    expect(result.slotOf.get('x')).toBe('a');
    expect(result.issues).toEqual([
      { code: 'slot-not-accepted', childId: 'x', slotId: 'a' },
    ]);
  });

  it('max does not change the assignment: the children beyond it get slot-full, in sibling order', () => {
    const slots: SlotInput[] = [
      { id: 'actions', box: rect(0, 0, 200, 50), accepts: types('icon-button'), max: 2 },
      { id: 'other', box: rect(300, 0, 50, 50), accepts: types('icon-button') },
    ];
    const result = assignSlots(slots, [
      child('i1', rect(0, 0, 40, 40), 'icon-button'),
      child('i2', rect(50, 0, 40, 40), 'icon-button'),
      child('i3', rect(100, 0, 40, 40), 'icon-button'),
      child('i4', rect(150, 0, 40, 40), 'icon-button'),
    ]);
    expect(result.children.get('actions')).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(result.issues).toEqual([
      { code: 'slot-full', childId: 'i3', slotId: 'actions', max: 2 },
      { code: 'slot-full', childId: 'i4', slotId: 'actions', max: 2 },
    ]);
  });

  it('a child both not accepted and beyond max carries the two issues, in child order', () => {
    const slots: SlotInput[] = [
      { id: 'a', box: rect(0, 0, 100, 100), accepts: types('icon'), max: 1 },
    ];
    const result = assignSlots(slots, [
      child('x', rect(0, 0, 10, 10), 'icon'),
      child('y', rect(0, 0, 10, 10), 'card'),
    ]);
    expect(result.issues).toEqual([
      { code: 'slot-not-accepted', childId: 'y', slotId: 'a' },
      { code: 'slot-full', childId: 'y', slotId: 'a', max: 1 },
    ]);
  });

  it('an invisible slot is not a candidate', () => {
    const slots: SlotInput[] = [
      { id: 'hidden', box: rect(0, 0, 100, 100), visible: false },
      { id: 'shown', box: rect(200, 0, 10, 10) },
    ];
    const result = assignSlots(slots, [child('a', rect(0, 0, 50, 50))]);
    expect(result.slotOf.get('a')).toBe('shown');
    expect(result.children.has('hidden')).toBe(false);
  });

  it('with no visible slot the child is unassigned', () => {
    const result = assignSlots(
      [{ id: 'hidden', box: rect(0, 0, 100, 100), visible: false }],
      [child('a', rect(0, 0, 50, 50))],
    );
    expect(result.slotOf.size).toBe(0);
    expect(result.unassigned).toEqual(['a']);
    expect(result.issues).toEqual([]);
  });

  it('without children, every visible slot has an empty list', () => {
    const result = assignSlots(bar, []);
    expect([...result.children]).toEqual([
      ['navigationIcon', []],
      ['title', []],
      ['actions', []],
    ]);
  });

  it('a child is placed once: the lists only repeat what slotOf says', () => {
    const result = assignSlots(bar, [
      child('t', rect(70, 8, 80, 30), 'text'),
      child('i', rect(292, 8, 48, 48), 'icon-button'),
    ]);
    const listed = [...result.children.values()].flat();
    expect(listed.sort()).toEqual(['i', 't']);
    expect(result.slotOf.get('t')).toBe('title');
    expect(result.slotOf.get('i')).toBe('actions');
  });
});

describe('slotForPlacement', () => {
  const slots = [
    { id: 'navigationIcon', accepts: types('icon-button'), max: 1 },
    { id: 'title' },
    { id: 'actions', accepts: types('icon-button'), max: 2 },
  ];

  it('the requested slot wins', () => {
    expect(slotForPlacement(slots, { slot: 'title', typeId: 'icon-button' })).toEqual({
      ok: true,
      id: 'title',
      basis: 'requested',
    });
  });

  it('a requested id the component does not have is an error of the caller', () => {
    expect(slotForPlacement(slots, { slot: 'nope' })).toEqual({
      ok: false,
      reason: 'unknown-slot',
      slot: 'nope',
    });
  });

  it('the first slot that accepts the type explicitly and is not full', () => {
    expect(slotForPlacement(slots, { typeId: 'icon-button' })).toEqual({
      ok: true,
      id: 'navigationIcon',
      basis: 'accepts',
    });
  });

  it('skips a full slot: the second icon does not go back to the navigation icon', () => {
    const counts = new Map([['navigationIcon', 1]]);
    expect(slotForPlacement(slots, { typeId: 'icon-button', counts })).toMatchObject({
      ok: true,
      id: 'actions',
      basis: 'accepts',
    });
  });

  it('the explicit ones come before the slots without accepts', () => {
    const counts = new Map([
      ['navigationIcon', 1],
      ['actions', 2],
    ]);
    // The explicit ones are full: the one without accepts (title) is the next accepting one.
    expect(slotForPlacement(slots, { typeId: 'icon-button', counts })).toMatchObject({
      ok: true,
      id: 'title',
      basis: 'accepts',
    });
  });

  it('every accepting slot full: the first that accepts, even full', () => {
    const only = slots.filter((s) => s.accepts !== undefined);
    const counts = new Map([
      ['navigationIcon', 1],
      ['actions', 2],
    ]);
    expect(slotForPlacement(only, { typeId: 'icon-button', counts })).toEqual({
      ok: true,
      id: 'navigationIcon',
      basis: 'accepts-full',
    });
  });

  it('a type no slot accepts gets the slots without accepts, then the first slot', () => {
    expect(slotForPlacement(slots, { typeId: 'card' })).toMatchObject({
      ok: true,
      id: 'title',
      basis: 'accepts',
    });
    const only = slots.filter((s) => s.accepts !== undefined);
    expect(slotForPlacement(only, { typeId: 'card' })).toEqual({
      ok: true,
      id: 'navigationIcon',
      basis: 'first',
    });
  });

  it('without a type, only the slots without accepts accept', () => {
    expect(slotForPlacement(slots, {})).toMatchObject({ ok: true, id: 'title' });
  });

  it('an invisible slot is not chosen by the order, but can be requested', () => {
    const hidden = [{ id: 'a', visible: false }, { id: 'b' }];
    expect(slotForPlacement(hidden, {})).toMatchObject({ ok: true, id: 'b' });
    expect(slotForPlacement(hidden, { slot: 'a' })).toMatchObject({ ok: true, id: 'a' });
  });

  it('with every slot invisible, the first slot', () => {
    expect(slotForPlacement([{ id: 'a', visible: false }], {})).toEqual({
      ok: true,
      id: 'a',
      basis: 'first',
    });
  });

  it('a single slot gives the slot of today', () => {
    expect(slotForPlacement([{ id: 'content' }], { typeId: 'anything' })).toMatchObject({
      ok: true,
      id: 'content',
    });
  });

  it('no slots at all is a result, not a throw', () => {
    expect(slotForPlacement([], {})).toEqual({ ok: false, reason: 'no-slots' });
  });
});
