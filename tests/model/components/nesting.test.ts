// CC1: walking the `component` nodes of a template and finding the cycles between types.
import { describe, expect, it } from 'vitest';
import type { TemplateNode } from '../../../src/model/components/componentFormat';
import {
  componentNodes,
  findComponentCycles,
} from '../../../src/model/components/nesting';

const comp = (id: string): TemplateNode => ({ type: 'component', id });
const frame = (...children: TemplateNode[]): TemplateNode => ({
  type: 'frame',
  children,
});

describe('componentNodes', () => {
  it('finds nodes through frame children, with their paths', () => {
    const template = frame(comp('a'), frame(comp('b')), { type: 'rect' });
    expect(componentNodes(template).map((n) => [n.path, n.node.id])).toEqual([
      ['template.children[0]', 'a'],
      ['template.children[1].children[0]', 'b'],
    ]);
  });

  it('descends into a repeat template and a slot fallback', () => {
    const template = frame(
      {
        type: 'repeat',
        field: 'rows',
        template: frame(comp('row')) as never,
      },
      {
        type: 'slot',
        fallback: frame(comp('fb')) as never,
      },
    );
    expect(componentNodes(template).map((n) => [n.path, n.node.id])).toEqual([
      ['template.children[0].template.children[0]', 'row'],
      ['template.children[1].fallback.children[0]', 'fb'],
    ]);
  });

  it('accepts a root that is itself a component node and a custom base path', () => {
    expect(componentNodes(comp('x'), 'root').map((n) => n.path)).toEqual(['root']);
    expect(componentNodes(frame(), 'template')).toEqual([]);
  });
});

describe('findComponentCycles', () => {
  const graph = (edges: Record<string, string[]>) => new Map(Object.entries(edges));

  it('is empty for an acyclic graph (and for ids with no entry)', () => {
    expect(findComponentCycles(graph({ a: ['b', 'c'], b: ['c'], c: [] }))).toEqual([]);
    expect(findComponentCycles(graph({ a: ['missing'] }))).toEqual([]);
  });

  it('finds a self-loop, a two-step and a three-step cycle, closing on the first id', () => {
    expect(findComponentCycles(graph({ a: ['a'] }))).toEqual([['a', 'a']]);
    expect(findComponentCycles(graph({ a: ['b'], b: ['a'] }))).toEqual([['a', 'b', 'a']]);
    expect(findComponentCycles(graph({ a: ['b'], b: ['c'], c: ['a'] }))).toEqual([
      ['a', 'b', 'c', 'a'],
    ]);
  });

  it('reports each cycle once, starting at its smallest id, in a deterministic order', () => {
    const cycles = findComponentCycles(graph({ c: ['b'], b: ['c', 'a'], a: ['b'] }));
    expect(cycles).toEqual([
      ['a', 'b', 'a'],
      ['b', 'c', 'b'],
    ]);
  });

  it('handles shared sub-cycles and repeated edges without looping', () => {
    const cycles = findComponentCycles(
      graph({ a: ['b', 'b', 'c'], b: ['a', 'c'], c: ['a'] }),
    );
    expect(cycles).toEqual([
      ['a', 'b', 'a'],
      ['a', 'b', 'c', 'a'],
      ['a', 'c', 'a'],
    ]);
  });
});

describe('findComponentCycles: bounds', () => {
  const nodes = (n: number) =>
    Array.from({ length: n }, (_, i) => `t${String(i).padStart(2, '0')}`);

  it('a dense acyclic graph returns no cycle, fast', () => {
    const ids = nodes(30);
    const graph = new Map(ids.map((id, i) => [id, ids.slice(i + 1)]));
    const started = Date.now();
    expect(findComponentCycles(graph)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('a dense strongly connected graph still covers every node when the budget runs out', () => {
    const ids = nodes(8);
    const graph = new Map(ids.map((id) => [id, ids.filter((o) => o !== id)]));
    const cycles = findComponentCycles(graph, 5);
    const covered = new Set(cycles.flatMap((c) => c));
    for (const id of ids) expect(covered.has(id), id).toBe(true);
    for (const c of cycles) expect(c[0]).toBe(c[c.length - 1]);
    // Each cycle is canonical (starts at its smallest id) and appears once.
    expect(new Set(cycles.map((c) => c.join('>'))).size).toBe(cycles.length);
    for (const c of cycles)
      expect(c.slice(0, -1).every((x) => x >= (c[0] as string))).toBe(true);
  });

  it('a self-loop in a bigger graph is found', () => {
    expect(
      findComponentCycles(
        new Map([
          ['a', ['b']],
          ['b', ['b']],
        ]),
      ),
    ).toEqual([['b', 'b']]);
  });
});
