import { describe, expect, it } from 'vitest';
import { membershipChanges, type Project } from '../../src/model';

// Quem mudou de pai ou de espaço entre dois projetos (o `membership` do lote do MCP): compara
// `parentId` e `containerId` por id, nunca a ordem do array.

const marking = (id: string, parentId: string | null, containerId: string | null) => ({
  id,
  parentId,
  containerId,
  name: id,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  needsReview: false,
  locked: false,
  floating: false,
  source: null,
});
const container = (id: string, parentId: string | null) => ({
  id,
  parentId,
  name: id,
  file: null,
  width: 10,
  height: 10,
  placement: { x: 0, y: 0, scale: 1 },
  markingColor: null,
  locked: false,
  source: null,
  background: '#FFFFFF',
});
const project = (
  markings: ReturnType<typeof marking>[],
  containers: ReturnType<typeof container>[] = [],
) => ({ markings, containers }) as unknown as Project;

describe('membershipChanges', () => {
  it('sem mudança de pai nem de espaço, devolve vazio (a ordem do array não conta)', () => {
    const a = project([marking('a', null, 'c'), marking('b', 'a', 'c')]);
    const b = project([marking('b', 'a', 'c'), marking('a', null, 'c')]);
    expect(membershipChanges(a, b)).toEqual([]);
  });

  it('marcação que perde o pai', () => {
    const before = project([marking('t', null, 'c'), marking('b', 't', 'c')]);
    const after = project([marking('t', null, 'c'), marking('b', null, 'c')]);
    expect(membershipChanges(before, after)).toEqual([
      {
        kind: 'marking',
        id: 'b',
        from: { parentId: 't', containerId: 'c' },
        to: { parentId: null, containerId: 'c' },
      },
    ]);
  });

  it('marcação que muda de espaço (container para o canvas)', () => {
    const before = project([marking('a', null, 'c')]);
    const after = project([marking('a', null, null)]);
    expect(membershipChanges(before, after)).toEqual([
      {
        kind: 'marking',
        id: 'a',
        from: { parentId: null, containerId: 'c' },
        to: { parentId: null, containerId: null },
      },
    ]);
  });

  it('container que passa a ter uma marcação do canvas como pai', () => {
    const before = project([marking('w', null, null)], [container('c', null)]);
    const after = project([marking('w', null, null)], [container('c', 'w')]);
    expect(membershipChanges(before, after)).toEqual([
      { kind: 'container', id: 'c', from: { parentId: null }, to: { parentId: 'w' } },
    ]);
  });

  it('só os itens que já existiam entram: a criada e a excluída ficam de fora', () => {
    const before = project([marking('a', null, 'c'), marking('gone', null, 'c')]);
    const after = project([marking('a', 'n', 'c'), marking('n', null, 'c')]);
    const changes = membershipChanges(before, after);
    expect(changes.map((c) => c.id)).toEqual(['a']);
    expect(changes[0]!.to.parentId).toBe('n');
  });
});
