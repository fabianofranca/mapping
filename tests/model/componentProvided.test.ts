// MF3: cor herdada nos desenhos dos componentes (decisões 8 a 10).
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

describe('cor herdada: quem vale (decisão 8)', () => {
  it('a filha recebe o valor do pai, resolvido com os campos dele', () => {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    expect(colorOf(draw(p).get('L')!.root)).toBe('#0000ff');
    p = setFieldValue(p, 'A_P', 'ink', '#ff0000');
    expect(colorOf(draw(p).get('L')!.root)).toBe('#ff0000');
  });

  it('um avô oferece e o pai não: vale o do avô', () => {
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

  it('pai e avô oferecem: vale o do pai', () => {
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

  it('sem ancestral que ofereça, na raiz ou fora da árvore, vale o default', () => {
    const p = add(baseProject(), 'L', 'label');
    expect(colorOf(draw(p).get('L')!.root)).toBe('#999999');
  });

  it('a marcação flutuante vale o default', () => {
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

  it('sem default vale o padrão do lugar (a cor do texto de sempre)', () => {
    const p = add(baseProject(), 'B', 'bare');
    const color = colorOf(draw(p).get('B')!.root);
    expect(color).toBeDefined();
    expect(color).not.toBe('#0000ff');
  });
});

describe('cor herdada: redesenho só da filha que lê (decisão 10)', () => {
  function scene(): Project {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    p = add(p, 'D', 'dot', { parentId: 'P' });
    p = add(p, 'Q', 'label', { rect: { x: 600, y: 600, width: 100, height: 40 } });
    return p;
  }

  it('trocar o campo do pai que muda o valor oferecido redesenha só a filha que lê', () => {
    const cache = createDrawingCache();
    const p1 = scene();
    const before = cache(p1, cat, approximateMeasurer, 0);
    const p2 = setFieldValue(p1, 'A_P', 'ink', '#ff0000');
    const after = cache(p2, cat, approximateMeasurer, 0);
    expect(colorOf(after.get('L')!.root)).toBe('#ff0000');
    expect(after.get('L')).not.toBe(before.get('L'));
    // As outras voltam com o mesmo objeto: a que não lê, a sem pai e a do pai que não mudou.
    expect(after.get('D')).toBe(before.get('D'));
    expect(after.get('Q')).toBe(before.get('Q'));
  });

  it('trocar um campo do pai que não muda o valor oferecido não redesenha ninguém', () => {
    const cache = createDrawingCache();
    const p1 = scene();
    const before = cache(p1, cat, approximateMeasurer, 0);
    // Pai com valor igual ao padrão do `provide`: o valor oferecido não muda.
    const p2 = setFieldValue(p1, 'A_P', 'ink', '#0000ff');
    const after = cache(p2, cat, approximateMeasurer, 0);
    expect(after.get('L')).toBe(before.get('L'));
    expect(after.get('D')).toBe(before.get('D'));
  });
});
