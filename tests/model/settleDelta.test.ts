import { describe, expect, it } from 'vitest';
import type { Marking, Project } from '../../src/model';
import { settleDelta } from '../../src/model/settleDelta';
import { sampleProject } from './fixtures';

// A comparação de `before` com `next` do assentar recortado (#882): objetos, nunca valores.

const marking = (id: string, containerId: string | null, x = 0): Marking => ({
  id,
  containerId,
  parentId: null,
  name: null,
  rect: { x, y: 0, width: 10, height: 10 },
  needsReview: false,
  locked: false,
  floating: false,
  source: null,
});

// Os mesmos containers (mesmos objetos) em todos os projetos do teste.
const shared = sampleProject();

function projectWith(markings: readonly Marking[]): Project {
  return { ...shared, markings: [...markings] };
}

const base = (): Marking[] =>
  Array.from({ length: 12 }, (_, i) =>
    marking(`m${i}`, i % 2 === 0 ? 'I1' : 'I2', i * 20),
  );

describe('settleDelta', () => {
  it('nada mudou: delta vazio e estável', () => {
    const before = projectWith(base());
    expect(settleDelta(before, { ...before })).toEqual({
      changed: [],
      old: [],
      full: new Set(),
      stable: true,
    });
  });

  it('um objeto trocado na mesma posição: o índice, o antigo e estável', () => {
    const list = base();
    const before = projectWith(list);
    const swapped = {
      ...list[3],
      rect: { x: 5, y: 5, width: 10, height: 10 },
    } as Marking;
    const next = projectWith(list.map((m, i) => (i === 3 ? swapped : m)));
    const delta = settleDelta(before, next);
    expect(delta?.changed).toEqual([3]);
    expect(delta?.old).toEqual([list[3]]);
    expect(delta?.stable).toBe(true);
    expect(delta?.full.size).toBe(0);
  });

  it('marcação nova no fim: só a nova, estável', () => {
    const list = base();
    const next = projectWith([...list, marking('novo', 'I1')]);
    const delta = settleDelta(projectWith(list), next);
    expect(delta?.changed).toEqual([12]);
    expect(delta?.old).toEqual([]);
    expect(delta?.stable).toBe(true);
  });

  it('marcação apagada: a antiga, e as posições deixam de valer', () => {
    const list = base();
    const next = projectWith(list.filter((m) => m.id !== 'm5'));
    const delta = settleDelta(projectWith(list), next);
    expect(delta?.changed).toEqual([]);
    expect(delta?.old).toEqual([list[5]]);
    expect(delta?.stable).toBe(false);
  });

  it('marcação do canvas que mudou põe o canvas entre os espaços inteiros', () => {
    const list = [...base(), marking('c', null)];
    const swapped = { ...marking('c', null), name: 'novo' };
    const delta = settleDelta(
      projectWith(list),
      projectWith(list.map((m) => (m.id === 'c' ? swapped : m))),
    );
    expect([...(delta?.full ?? [])]).toEqual([null]);
  });

  it('irmãs reordenadas: o espaço delas é assentado inteiro', () => {
    const list = base();
    const reordered = [...list];
    [reordered[0], reordered[2]] = [list[2] as Marking, list[0] as Marking];
    const delta = settleDelta(projectWith(list), projectWith(reordered));
    expect(delta?.changed).toEqual([]);
    expect([...(delta?.full ?? [])]).toEqual(['I1']);
    expect(delta?.stable).toBe(false);
  });

  it('container trocado: o espaço dele e o canvas', () => {
    const before = projectWith(base());
    const containers = before.containers.map((c, i) =>
      i === 0 ? { ...c, name: 'outro' } : c,
    );
    const delta = settleDelta(before, { ...before, containers });
    const first = before.containers[0]?.id as string;
    expect(new Set(delta?.full)).toEqual(new Set([first, null]));
  });

  it('mais da metade mudou: o projeto inteiro (null)', () => {
    const list = base();
    const swapped = list.map((m) => ({ ...m, name: 'x' }));
    expect(settleDelta(projectWith(list), projectWith(swapped))).toBeNull();
  });

  it('id repetido no trecho que mudou: o projeto inteiro (null)', () => {
    const list = base();
    const next = projectWith([...list, marking('dup', 'I1'), marking('dup', 'I1')]);
    expect(settleDelta(projectWith(list), next)).toBeNull();
  });
});
