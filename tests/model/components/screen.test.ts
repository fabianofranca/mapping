// Components lab: the screen model is immutable and serializes/re-reads without loss.
import { describe, expect, it } from 'vitest';
import {
  addInstance,
  bringToFront,
  childrenOf,
  descendantsOf,
  moveSibling,
  newScreen,
  parseScreen,
  removeInstance,
  resize,
  type Instance,
  type Screen,
  serializeScreen,
  setValue,
  updateBox,
} from '../../../src/model/components/screen';
import { SAMPLE_SCREEN } from '../../../viewer/samples/samples';

describe('screen', () => {
  it('adds, moves, edits, brings to front and removes without mutating the previous object', () => {
    const empty = newScreen('T', 100, 200);
    const one = addInstance(empty, {
      typeId: 'button',
      box: { x: 1.4, y: 2.6, width: 10.2, height: 0 },
      values: { label: 'a' },
    });
    expect(empty.instances).toHaveLength(0);
    const id = one.instances[0]?.id ?? '';
    const moved = updateBox(one, id, { x: 5, y: 6, width: 7.6, height: 8 });
    expect(moved.instances[0]?.box).toEqual({ x: 5, y: 6, width: 8, height: 8 });
    expect(one.instances[0]?.box.x).toBe(1.4);
    const edited = setValue(moved, id, 'label', 'b');
    expect(edited.instances[0]?.values).toEqual({ label: 'b' });
    expect(setValue(edited, 'nope', 'label', 'c')).toBe(edited);
    const two = addInstance(edited, {
      typeId: 'card',
      box: { x: 0, y: 0, width: 1, height: 1 },
      values: {},
    });
    const front = bringToFront(two, id);
    expect(front.instances.map((i) => i.typeId)).toEqual(['card', 'button']);
    expect(removeInstance(front, id).instances).toHaveLength(1);
    expect(resize(front, 390.4, 0).width).toBe(390);
    expect(resize(front, 390.4, 0).height).toBe(1);
  });

  it('serializes and re-reads the sample screen', () => {
    const text = serializeScreen(SAMPLE_SCREEN);
    const back = parseScreen(JSON.parse(text));
    expect(back).toEqual(SAMPLE_SCREEN);
  });

  it('the rtl direction survives serializing and re-reading; in ltr the key stays absent', () => {
    const rtl = { ...SAMPLE_SCREEN, direction: 'rtl' as const };
    const back = parseScreen(JSON.parse(serializeScreen(rtl)));
    expect(back.direction).toBe('rtl');
    expect(back).toEqual(rtl);
    expect('direction' in parseScreen(JSON.parse(serializeScreen(SAMPLE_SCREEN)))).toBe(
      false,
    );
    const ltr = parseScreen({
      ...JSON.parse(serializeScreen(SAMPLE_SCREEN)),
      direction: 'ltr',
    });
    expect('direction' in ltr).toBe(false);
    // invalid value: ignored, like `background` and `name` (the re-read screen stays ltr)
    const bad = parseScreen({
      ...JSON.parse(serializeScreen(SAMPLE_SCREEN)),
      direction: 'up',
    });
    expect('direction' in bad).toBe(false);
  });

  it('refuses malformed screens with an error message', () => {
    expect(() => parseScreen(null)).toThrow(/Invalid screen/);
    expect(() => parseScreen({ format: 'x' })).toThrow(/format/);
    expect(() =>
      parseScreen({
        format: 'mapping-lab-screen',
        width: 1,
        height: 1,
        instances: [{ typeId: 1 }],
      }),
    ).toThrow(/typeId/);
  });
});

const BOX = { x: 0, y: 0, width: 10, height: 10 };

function screenWith(...instances: Instance[]): Screen {
  return { id: 's', name: 'T', width: 100, height: 100, background: '#FFF', instances };
}

function roundTrip(screen: Screen): Screen {
  return parseScreen(JSON.parse(serializeScreen(screen)));
}

describe('parseScreen: tables (#952)', () => {
  it('the round-trip keeps the table, with text, number and null cells', () => {
    const screen = screenWith({
      id: 'a',
      typeId: 't',
      box: BOX,
      values: { rows: [{ a: 'x', n: 1, z: null }], title: 'hi' },
    });
    expect(roundTrip(screen).instances[0]?.values).toEqual({
      rows: [{ a: 'x', n: 1, z: null }],
      title: 'hi',
    });
  });

  it('discards only the row that is not an object and the cell of another type', () => {
    const raw = JSON.parse(
      serializeScreen(screenWith({ id: 'a', typeId: 't', box: BOX, values: {} })),
    );
    raw.instances[0].values = {
      rows: [{ a: 'x', bad: { deep: 1 }, flag: true }, 'text', 7, null, ['x'], { n: 2 }],
    };
    expect(parseScreen(raw).instances[0]?.values).toEqual({
      rows: [{ a: 'x' }, { n: 2 }],
    });
  });
});

describe('parseScreen: parentId (#952)', () => {
  const inst = (id: string, parentId?: string): Instance => ({
    id,
    typeId: 't',
    box: BOX,
    values: {},
    ...(parentId === undefined ? {} : { parentId }),
  });

  it('refuses self-reference, cycle, a missing parent and a repeated id', () => {
    expect(() => roundTrip(screenWith(inst('a', 'a')))).toThrow(
      /Invalid screen: instances\[0\]\.parentId/,
    );
    expect(() => roundTrip(screenWith(inst('a', 'b'), inst('b', 'a')))).toThrow(
      /Invalid screen: instances\[\d\]\.parentId/,
    );
    expect(() => roundTrip(screenWith(inst('a'), inst('b', 'nada')))).toThrow(
      /Invalid screen: instances\[1\]\.parentId/,
    );
    expect(() => roundTrip(screenWith(inst('a'), inst('a')))).toThrow(
      /Invalid screen: instances\[1\]\.id/,
    );
  });

  it('accepts a valid hierarchy, in any list order', () => {
    const screen = screenWith(inst('b', 'a'), inst('a'), inst('c', 'b'));
    expect(roundTrip(screen)).toEqual(screen);
  });

  it('descendantsOf ends even with a cycle built by hand', () => {
    const cyclic = screenWith(inst('a', 'b'), inst('b', 'a'));
    expect(() => descendantsOf(cyclic, 'a')).not.toThrow();
    expect(descendantsOf(cyclic, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('moveSibling', () => {
  it('moves just one: [A,B,C] with A +1 becomes [B,A,C]', () => {
    const inst = (id: string): Instance => ({ id, typeId: 't', box: BOX, values: {} });
    const s = screenWith(inst('A'), inst('B'), inst('C'));
    const ids = (x: Screen) => childrenOf(x, undefined).map((i) => i.id);
    expect(ids(moveSibling(s, 'A', 1))).toEqual(['B', 'A', 'C']);
    expect(ids(moveSibling(s, 'C', -1))).toEqual(['A', 'C', 'B']);
    expect(ids(moveSibling(s, 'B', 1))).toEqual(['A', 'C', 'B']);
  });
});
