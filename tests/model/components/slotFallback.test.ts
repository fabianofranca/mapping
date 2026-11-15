// Named slots (stage #1080, SL2): the engine draws the slot's default content (`fallback`) only while
// the slot is empty, measures it in the slot's `hug`, takes the content of each slot by its id, and
// the slot node of the scene carries the `id`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FieldValues } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type InstantiateOptions,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';

const box = { x: 0, y: 0, width: 360, height: 56 };

function bar() {
  const result = parseComponent(
    JSON.parse(readFileSync('tests/fixtures/slots/components/bar.json', 'utf8')),
  );
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

const run = (values: FieldValues, options: Partial<InstantiateOptions> = {}) =>
  instantiate(bar(), values, box, {
    measure: approximateMeasurer,
    idPrefix: 'b',
    ...options,
  });

const texts = (root: SceneNode): string[] =>
  [...walk(root)].flatMap((n) => (n.type === 'text' ? [n.text] : []));

const slotNodes = (root: SceneNode) =>
  [...walk(root)].filter((n) => n.type === 'unknown' && n.sourceType === 'slot');

describe('the slot node carries its id', () => {
  it('each slot node of the scene has its slotId, in template order', () => {
    const slots = slotNodes(run({}).root);
    expect(slots.map((n) => (n.type === 'unknown' ? n.slotId : undefined))).toEqual([
      'navigationIcon',
      'actions',
    ]);
  });

  it('a slot without id has no slotId', () => {
    const result = parseComponent({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'solo',
      name: 'Solo',
      size: { width: 100, height: 40 },
      template: { type: 'frame', children: [{ type: 'slot' }] },
    });
    if (!result.ok) throw new Error(result.errors.join('; '));
    const [only] = slotNodes(
      instantiate(result.component, {}, box, { measure: approximateMeasurer }).root,
    );
    expect(only !== undefined && 'slotId' in only).toBe(false);
  });
});

describe('the default content (fallback)', () => {
  it('is drawn in an empty slot, from the fields only it cites', () => {
    expect(texts(run({ navLabel: 'Back', actionLabel: 'More' }).root)).toEqual([
      'Back',
      'Title',
      'More',
    ]);
  });

  it('is not drawn when its visibility says no (no field)', () => {
    expect(texts(run({}).root)).toEqual(['Title']);
  });

  it('a slot that holds children (slotContent entry) does not draw its fallback; the other one does', () => {
    const slotContent = new Map([['navigationIcon', { width: 40, height: 40 }]]);
    expect(
      texts(run({ navLabel: 'Back', actionLabel: 'More' }, { slotContent }).root),
    ).toEqual(['Title', 'More']);
  });

  it('filledSlots hides the fallback without giving the slot a measure', () => {
    const filledSlots = new Set(['actions']);
    expect(
      texts(run({ navLabel: 'Back', actionLabel: 'More' }, { filledSlots }).root),
    ).toEqual(['Back', 'Title']);
  });

  it('the fallback fills the slot box of a fixed slot, at the slot position', () => {
    const { root } = run({ navLabel: 'Back' });
    const boxes = absoluteBoxes(root);
    const nav = slotNodes(root)[0];
    const frame = [...walk(root)].find((n) => n.id === 'b/root.0/fallback/root');
    expect(nav).toBeDefined();
    expect(frame).toBeDefined();
    const navBox = boxes.get(nav?.id ?? '');
    expect(navBox).toMatchObject({ width: 40, height: 40 });
    // The wrapper is a sibling of the slot node and takes the slot's box.
    expect(frame).toMatchObject({ width: 40, height: 40 });
    expect(boxes.get('b/root.0/fallback/root')).toMatchObject({
      x: navBox?.x,
      y: navBox?.y,
    });
  });
});

describe('the hug slot measures its default content', () => {
  it('an empty hug slot takes the size of its fallback, which grows with the field', () => {
    const short = absoluteBoxes(run({ actionLabel: 'Go' }).root);
    const long = absoluteBoxes(run({ actionLabel: 'A much longer action' }).root);
    const width = (boxes: ReturnType<typeof absoluteBoxes>, root: SceneNode) =>
      boxes.get(slotNodes(root)[1]?.id ?? '')?.width ?? 0;
    const shortScene = run({ actionLabel: 'Go' }).root;
    const longScene = run({ actionLabel: 'A much longer action' }).root;
    expect(width(short, shortScene)).toBeGreaterThan(0);
    expect(width(long, longScene)).toBeGreaterThan(width(short, shortScene));
  });

  it('an empty hug slot with no fallback content (invisible) is 0, as before', () => {
    const root = run({}).root;
    expect(absoluteBoxes(root).get(slotNodes(root)[1]?.id ?? '')?.width).toBe(0);
  });

  it('a hug slot that holds children measures the children, never the fallback', () => {
    const slotContent = new Map([['actions', { width: 96, height: 40 }]]);
    const root = run({ actionLabel: 'A much longer action' }, { slotContent }).root;
    expect(absoluteBoxes(root).get(slotNodes(root)[1]?.id ?? '')?.width).toBe(96);
  });

  it('the box of a slot does not change with the fields of the default content of the other', () => {
    const slotContent = new Map([['actions', { width: 96, height: 40 }]]);
    const boxOf = (values: FieldValues) => {
      const root = run(values, { slotContent }).root;
      return absoluteBoxes(root).get(slotNodes(root)[1]?.id ?? '');
    };
    expect(boxOf({ navLabel: 'Back' })).toEqual(boxOf({}));
  });

  it('does not warn "fill inside hug" for the fallback of a hug slot', () => {
    const { warnings } = run({ actionLabel: 'More' });
    expect(warnings.filter((w) => w.includes('fill inside hug'))).toEqual([]);
  });
});

describe('slotContent: the single size keeps working', () => {
  it('a component with one slot and no ids takes the single size as before', () => {
    const result = parseComponent({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'solo',
      name: 'Solo',
      size: { width: 100, height: 40 },
      template: {
        type: 'frame',
        layout: { type: 'row' },
        children: [{ type: 'slot', width: 'hug', height: 'hug' }],
      },
    });
    if (!result.ok) throw new Error(result.errors.join('; '));
    const root = instantiate(result.component, {}, box, {
      measure: approximateMeasurer,
      slotContent: { width: 30, height: 12 },
    }).root;
    expect(absoluteBoxes(root).get(slotNodes(root)[0]?.id ?? '')).toMatchObject({
      width: 30,
      height: 12,
    });
  });
});
