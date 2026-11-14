// Components Lab: instance hierarchy (containers) in the screen model and slots with layout in the format.
import { describe, expect, it } from 'vitest';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  addInstance,
  ancestorsOf,
  childrenOf,
  descendantsOf,
  moveSibling,
  newScreen,
  parseScreen,
  removeInstance,
  removeSubtree,
  renderOrder,
  serializeScreen,
  setParent,
  updateBox,
} from '../../../src/model/components/screen';

function tree() {
  let s = newScreen('T', 400, 400);
  s = addInstance(s, {
    typeId: 'column',
    box: { x: 10, y: 10, width: 300, height: 300 },
    values: {},
  });
  const col = s.instances[0]!.id;
  s = addInstance(s, {
    typeId: 'row',
    box: { x: 20, y: 20, width: 200, height: 50 },
    values: {},
    parentId: col,
  });
  const row = s.instances[1]!.id;
  s = addInstance(s, {
    typeId: 'leaf',
    box: { x: 20, y: 20, width: 40, height: 20 },
    values: {},
    parentId: row,
  });
  s = addInstance(s, {
    typeId: 'leaf',
    box: { x: 70, y: 20, width: 40, height: 20 },
    values: {},
    parentId: row,
  });
  s = addInstance(s, {
    typeId: 'leaf',
    box: { x: 350, y: 350, width: 40, height: 20 },
    values: {},
  });
  const [a, b, loose] = [s.instances[2]!.id, s.instances[3]!.id, s.instances[4]!.id];
  return { s, col, row, a, b, loose };
}

describe('instance hierarchy', () => {
  it('children, descendants, ancestors and drawing order', () => {
    const { s, col, row, a, b, loose } = tree();
    expect(childrenOf(s, undefined).map((i) => i.id)).toEqual([col, loose]);
    expect(childrenOf(s, row).map((i) => i.id)).toEqual([a, b]);
    expect(descendantsOf(s, col)).toEqual([row, a, b]);
    expect(ancestorsOf(s, a)).toEqual([row, col]);
    expect(renderOrder(s).map((i) => i.id)).toEqual([col, row, a, b, loose]);
  });

  it('moving a container carries the descendants; resizing does not', () => {
    const { s, col, a } = tree();
    const moved = updateBox(s, col, { x: 110, y: 60, width: 300, height: 300 });
    expect(moved.instances.find((i) => i.id === a)?.box).toEqual({
      x: 120,
      y: 70,
      width: 40,
      height: 20,
    });
    const resized = updateBox(s, col, { x: 10, y: 10, width: 200, height: 200 });
    expect(resized.instances.find((i) => i.id === a)?.box).toEqual({
      x: 20,
      y: 20,
      width: 40,
      height: 20,
    });
  });

  it('setParent changes the parent, positions among siblings and rejects cycles', () => {
    const { s, col, row, a, b, loose } = tree();
    const inRow = setParent(s, loose, row, 1);
    expect(childrenOf(inRow, row).map((i) => i.id)).toEqual([a, loose, b]);
    expect(renderOrder(inRow).map((i) => i.id)).toEqual([col, row, a, loose, b]);
    const toTop = setParent(inRow, a, undefined);
    expect(toTop.instances.find((i) => i.id === a)?.parentId).toBeUndefined();
    expect(childrenOf(toTop, undefined).map((i) => i.id)).toEqual([col, a]);
    expect(setParent(s, col, a)).toBe(s);
    expect(setParent(s, col, col)).toBe(s);
  });

  it('moveSibling reorders among siblings and stops at the ends', () => {
    const { s, row, a, b } = tree();
    const swapped = moveSibling(s, a, 1);
    expect(childrenOf(swapped, row).map((i) => i.id)).toEqual([b, a]);
    expect(moveSibling(swapped, a, 1)).toBe(swapped);
    expect(childrenOf(moveSibling(swapped, a, -1), row).map((i) => i.id)).toEqual([a, b]);
  });

  it('removeInstance lifts the children; removeSubtree deletes everything', () => {
    const { s, col, row, a, b } = tree();
    const lifted = removeInstance(s, row);
    expect(lifted.instances.find((i) => i.id === a)?.parentId).toBe(col);
    expect(lifted.instances.find((i) => i.id === b)?.parentId).toBe(col);
    const gone = removeSubtree(s, col);
    expect(gone.instances.map((i) => i.typeId)).toEqual(['leaf']);
  });

  it('parentId survives serialization', () => {
    const { s } = tree();
    expect(parseScreen(JSON.parse(serializeScreen(s)))).toEqual(s);
  });
});

describe('slot with layout in the format', () => {
  const component = (slot: object) => ({
    format: 'mapping-component',
    formatVersion: 1,
    id: 'row',
    name: 'Row',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [{ type: 'slot', ...slot }],
    },
  });

  it('accepts row/column layout with gap and padding by expression', () => {
    expect(
      validateComponent(
        component({
          layout: {
            type: 'row',
            gap: { $field: 'spacing' },
            padding: { $field: 'padding', default: 4 },
            align: 'center',
          },
        }),
      ),
    ).toEqual([]);
    expect(parseComponent(component({ layout: { type: 'none' } })).ok).toBe(true);
  });

  it('rejects an invalid layout in the slot and a layout on nodes that are neither frame nor slot', () => {
    expect(validateComponent(component({ layout: { type: 'diagonal' } }))[0]).toMatch(
      /children\[0\]\.layout\.type: expected/,
    );
    const rect = component({});
    (rect.template.children as object[]).push({ type: 'rect', layout: { type: 'row' } });
    expect(
      validateComponent(rect).some((p) =>
        p.includes('only nodes of type frame accept layout'),
      ),
    ).toBe(true);
  });
});
