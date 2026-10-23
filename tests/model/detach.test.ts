import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addAnnotation,
  approximateMeasurer,
  createMarking,
  detachMarking,
  imageCanvasRect,
  rectsOverlap,
  type Project,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { expectValid, marking } from './fixtures';

// Container destacado (ME4): a marcação vira um container sem arquivo do tamanho dela.

let n = 0;
const newId = () => `D${++n}`;

function withMarking(): Project {
  return createMarking(componentProject(), {
    id: 'M',
    containerId: 'I1',
    rect: { x: 100, y: 100, width: 300, height: 200 },
    name: 'Cartão',
  });
}

function withInstance(): Project {
  const p = addComponentMarking(
    componentProject(),
    testCatalog(),
    {
      markingId: 'T',
      annotationId: 'AT',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x: 100, y: 100, width: 200, height: 60 },
      name: 'Título',
    },
    approximateMeasurer,
  );
  return addAnnotation(p, {
    id: 'AF',
    markingId: 'T',
    layerId: p.layers[0]!.id,
    name: 'Livre',
    entries: [{ id: 'E1', key: 'k', value: 'v' }],
  });
}

describe('detachMarking', () => {
  it('sem conteúdo: container em branco do tamanho do rect, ao lado do de origem', () => {
    const p = withMarking();
    const next = detachMarking(p, 'M', {
      containerId: 'C2',
      markingId: 'M2',
      newId,
      copyContent: false,
    });
    const created = next.containers.find((c) => c.id === 'C2')!;
    expect(created).toMatchObject({
      file: null,
      name: 'Cartão',
      width: 300,
      height: 200,
      background: '#FFFFFF',
    });
    const source = imageCanvasRect(p.containers[0]!, p.containers[0]!.placement);
    expect(rectsOverlap(imageCanvasRect(created, created.placement), source)).toBe(false);
    expect(created.placement.x).toBeGreaterThanOrEqual(source.x + source.width);
    // Nada além do container: a marcação de origem fica, sem cópia.
    expect(next.markings).toEqual(p.markings);
    expect(next.annotations).toEqual(p.annotations);
    expectValid(next);
  });

  it('com componente: copia a marcação, ocupando o container, e as anotações com ids novos', () => {
    const p = withInstance();
    const next = detachMarking(p, 'T', {
      containerId: 'C2',
      markingId: 'T2',
      newId,
      copyContent: true,
    });
    expect(marking(next, 'T2')).toMatchObject({
      containerId: 'C2',
      name: 'Título',
      rect: { x: 0, y: 0, width: 200, height: 60 },
    });
    // A original não muda.
    expect(marking(next, 'T')).toEqual(marking(p, 'T'));
    const copies = next.annotations.filter((a) => a.markingId === 'T2');
    const originals = p.annotations.filter((a) => a.markingId === 'T');
    expect(copies).toHaveLength(originals.length);
    expect(copies.map((a) => a.values)).toEqual(originals.map((a) => a.values));
    expect(copies.map((a) => a.id)).not.toContain('AT');
    const entry = copies.flatMap((a) => a.entries)[0]!;
    expect(entry).toMatchObject({ key: 'k', value: 'v' });
    expect(entry.id).not.toBe('E1');
    expectValid(next);
  });

  it('falha com not-found numa marcação inexistente e não altera o projeto', () => {
    const p = withMarking();
    expect(() =>
      detachMarking(p, 'zz', {
        containerId: 'C2',
        markingId: 'M2',
        newId,
        copyContent: false,
      }),
    ).toThrow();
    expect(p.containers).toHaveLength(1);
  });
});
