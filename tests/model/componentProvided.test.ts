// MF3: inherited color in the component drawings (decisions 8 to 10).
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  setFieldValue,
  type Project,
} from '../../src/model';
import type { SceneNode } from '../../src/model/components/scene';
import { add, baseProject, cat } from './providedFixtures';

function colorOf(root: SceneNode, name = 'lbl'): string | undefined {
  const search = (node: SceneNode): SceneNode | undefined => {
    if (node.name === name) return node;
    if ('children' in node)
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
    return undefined;
  };
  const text = search(root);
  return text && 'fills' in text
    ? (text.fills?.[0] as { color?: string } | undefined)?.color
    : undefined;
}

const draw = (p: Project) => createDrawingCache()(p, cat, approximateMeasurer, 0);

describe('inherited color: which one applies (decision 8)', () => {
  it('the child receives the parent value, resolved with the parent fields', () => {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    expect(colorOf(draw(p).get('L')!.root)).toBe('#0000ff');
    p = setFieldValue(p, 'A_P', 'ink', '#ff0000');
    expect(colorOf(draw(p).get('L')!.root)).toBe('#ff0000');
  });

  it('a grandparent offers and the parent does not: the grandparent value applies', () => {
    let p = add(baseProject(), 'G', 'grand', {
      rect: { x: 100, y: 100, width: 400, height: 200 },
    });
    p = add(p, 'S', 'shell', {
      parentId: 'G',
      rect: { x: 110, y: 110, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'S' });
    expect(colorOf(draw(p).get('L')!.root)).toBe('#00ff00');
  });

  it('parent and grandparent offer: the parent value applies', () => {
    let p = add(baseProject(), 'G', 'grand', {
      rect: { x: 100, y: 100, width: 400, height: 200 },
    });
    p = add(p, 'P', 'panel', {
      parentId: 'G',
      rect: { x: 110, y: 110, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    expect(colorOf(draw(p).get('L')!.root)).toBe('#0000ff');
  });

  it('without an ancestor that offers, at the root or outside the tree, the default applies', () => {
    const p = add(baseProject(), 'L', 'label');
    expect(colorOf(draw(p).get('L')!.root)).toBe('#999999');
  });

  it('the floating marking uses the default', () => {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    const root = createMarking(p, {
      id: 'F',
      containerId: null,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    });
    expect(root.markings.some((m) => m.id === 'F')).toBe(true);
    expect(colorOf(draw(p).get('L')!.root)).toBe('#0000ff');
  });

  it('without a default the place default applies (the usual text color)', () => {
    const p = add(baseProject(), 'B', 'bare');
    const color = colorOf(draw(p).get('B')!.root);
    expect(color).toBeDefined();
    expect(color).not.toBe('#0000ff');
  });
});

describe('inherited color: redraw only the child that reads it (decision 10)', () => {
  function scene(): Project {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    p = add(p, 'D', 'dot', { parentId: 'P' });
    p = add(p, 'Q', 'label', { rect: { x: 600, y: 600, width: 100, height: 40 } });
    return p;
  }

  it('changing the parent field that changes the offered value redraws only the child that reads it', () => {
    const cache = createDrawingCache();
    const p1 = scene();
    const before = cache(p1, cat, approximateMeasurer, 0);
    const p2 = setFieldValue(p1, 'A_P', 'ink', '#ff0000');
    const after = cache(p2, cat, approximateMeasurer, 0);
    expect(colorOf(after.get('L')!.root)).toBe('#ff0000');
    expect(after.get('L')).not.toBe(before.get('L'));
    // The others come back as the same object: the one that does not read it, the one without a parent and the one of the unchanged parent.
    expect(after.get('D')).toBe(before.get('D'));
    expect(after.get('Q')).toBe(before.get('Q'));
  });

  it('changing a parent field that does not change the offered value redraws nobody', () => {
    const cache = createDrawingCache();
    const p1 = scene();
    const before = cache(p1, cat, approximateMeasurer, 0);
    // Parent with a value equal to the `provide` default: the offered value does not change.
    const p2 = setFieldValue(p1, 'A_P', 'ink', '#0000ff');
    const after = cache(p2, cat, approximateMeasurer, 0);
    expect(after.get('L')).toBe(before.get('L'));
    expect(after.get('D')).toBe(before.get('D'));
  });
});
