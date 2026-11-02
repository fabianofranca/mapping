// Visualizador embutível: a árvore das instâncias (puro, sem DOM).
import { describe, expect, it } from 'vitest';
import { loadLibrary } from '../../../src/model/components/library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../lab/components/samples';
import { M3_FILES, M3_SCREEN } from '../../../lab/components/samplesMaterial3';
import { renderOrder, type Screen } from '../../../src/model/components/screen';
import { flattenTree, screenTree } from '../../../lab/viewer/tree';

const sampleLibrary = loadLibrary(SAMPLE_FILES);
const m3Library = loadLibrary(M3_FILES);

describe('screenTree', () => {
  it('tela sem hierarquia: uma raiz por instância, na ordem de desenho, sem filhos', () => {
    const tree = screenTree(SAMPLE_SCREEN, sampleLibrary);
    expect(tree.map((n) => n.id)).toEqual(renderOrder(SAMPLE_SCREEN).map((i) => i.id));
    expect(tree.every((n) => n.depth === 0 && n.children.length === 0)).toBe(true);
    expect(tree.every((n) => n.parentId === undefined)).toBe(true);
    const bar = tree.find((n) => n.id === 'i-bar');
    expect(bar).toMatchObject({
      typeId: 'app-bar',
      typeName: sampleLibrary.types.find((t) => t.id === 'app-bar')?.name,
    });
    expect(bar?.instance).toBe(SAMPLE_SCREEN.instances.find((i) => i.id === 'i-bar'));
  });

  it('o rótulo é o instanceLabel do tipo (labelField preenchido, senão o nome)', () => {
    const tree = flattenTree(screenTree(M3_SCREEN, m3Library));
    expect(tree.find((n) => n.id === 'm-chip1')?.label).toBe('All');
    expect(tree.find((n) => n.id === 'm-row-chips')?.label).toBe(
      m3Library.types.find((t) => t.id === 'm3-row')?.name,
    );
  });

  it('tela do Material 3: o Row é raiz e leva os chips como filhos, com a profundidade', () => {
    const tree = screenTree(M3_SCREEN, m3Library);
    const row = tree.find((n) => n.id === 'm-row-chips');
    expect(row?.depth).toBe(0);
    expect(row?.parentId).toBeUndefined();
    expect(row?.children.map((c) => c.id)).toEqual(['m-chip1', 'm-chip2', 'm-chip3']);
    for (const child of row?.children ?? []) {
      expect(child.depth).toBe(1);
      expect(child.parentId).toBe('m-row-chips');
      expect(child.children).toEqual([]);
    }
    // Os chips não aparecem como raízes.
    expect(tree.some((n) => n.id === 'm-chip1')).toBe(false);
  });

  it('flattenTree segue a ordem de renderOrder e traz todas as instâncias', () => {
    for (const [screen, library] of [
      [SAMPLE_SCREEN, sampleLibrary],
      [M3_SCREEN, m3Library],
    ] as const) {
      const flat = flattenTree(screenTree(screen, library));
      expect(flat.map((n) => n.id)).toEqual(renderOrder(screen).map((i) => i.id));
      expect(flat).toHaveLength(screen.instances.length);
    }
  });

  it('aninha vários níveis e trata parentId inexistente como raiz', () => {
    const screen: Screen = {
      ...SAMPLE_SCREEN,
      instances: [
        { ...SAMPLE_SCREEN.instances[0]!, id: 'a' },
        { ...SAMPLE_SCREEN.instances[0]!, id: 'b', parentId: 'a' },
        { ...SAMPLE_SCREEN.instances[0]!, id: 'c', parentId: 'b' },
        { ...SAMPLE_SCREEN.instances[0]!, id: 'orfa', parentId: 'nao-existe' },
      ],
    };
    const tree = screenTree(screen, sampleLibrary);
    expect(tree.map((n) => n.id)).toEqual(['a', 'orfa']);
    expect(tree[0]?.children[0]?.children[0]).toMatchObject({
      id: 'c',
      depth: 2,
      parentId: 'b',
    });
    expect(tree[1]?.depth).toBe(0);
    expect(tree[1]?.parentId).toBeUndefined();
    expect(flattenTree(tree).map((n) => [n.id, n.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['orfa', 0],
    ]);
    expect(flattenTree(tree).map((n) => n.id)).toEqual(
      renderOrder(screen).map((i) => i.id),
    );
  });

  it('tipo desconhecido: o rótulo é o typeId e não há typeName', () => {
    const screen: Screen = {
      ...SAMPLE_SCREEN,
      instances: [
        {
          id: 'x',
          typeId: 'fantasma',
          box: { x: 0, y: 0, width: 10, height: 10 },
          values: {},
        },
      ],
    };
    const [node] = screenTree(screen, sampleLibrary);
    expect(node).toMatchObject({ label: 'fantasma', typeId: 'fantasma' });
    expect(node && 'typeName' in node).toBe(false);
  });

  it('biblioteca undefined: todos os tipos são desconhecidos, mas a hierarquia vale', () => {
    const flat = flattenTree(screenTree(M3_SCREEN, undefined));
    expect(flat).toHaveLength(M3_SCREEN.instances.length);
    expect(flat.every((n) => n.label === n.typeId && n.typeName === undefined)).toBe(
      true,
    );
    expect(flat.find((n) => n.id === 'm-chip2')).toMatchObject({
      depth: 1,
      parentId: 'm-row-chips',
    });
  });

  it('tela vazia: árvore vazia', () => {
    expect(screenTree({ ...SAMPLE_SCREEN, instances: [] }, sampleLibrary)).toEqual([]);
    expect(flattenTree([])).toEqual([]);
  });
});
