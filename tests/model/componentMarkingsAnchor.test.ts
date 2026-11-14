// Instância nova com `anchor` e sem `rect` (R3, decisão 12): nasce no tamanho medido e já
// encostada na âncora (`snapToAnchor`). `componentAnchoredPlacement` é a função pura que o MCP usa.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  componentAnchoredPlacement,
  componentSize,
  createMarking,
  imageCanvasRect,
  setContainerDensity,
  snapToAnchor,
  type NewComponentArgs,
  validateProject,
  type Project,
} from '../../src/model';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { marking } from './fixtures';

const catalog = fitCatalog();
const T = { x: 400, y: 300, width: 200, height: 100 };

function withTarget(): Project {
  return createMarking(fitProject(), { id: 'T', containerId: 'I1', rect: T });
}

const args = (
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): NewComponentArgs => ({
  markingId: 'B',
  annotationId: 'A_B',
  containerId: 'I1',
  parentId: null,
  specId: FIT_SPEC_ID,
  typeId,
  anchor: { to: 'T', side: 'top', align: 'center' },
  ...extra,
});

const create = (p: Project, typeId: string, extra: Partial<NewComponentArgs> = {}) =>
  addComponentMarking(p, catalog, args(typeId, extra), approximateMeasurer);

describe('instância nova ancorada', () => {
  it('sem rect nasce no tamanho do componente, encostada acima da âncora e com a âncora gravada', () => {
    const b = marking(create(withTarget(), 'fit-plain'), 'B');
    expect(b.rect).toEqual({ x: 440, y: 260, width: 120, height: 40 });
    expect(b.anchor).toEqual({ to: 'T', side: 'top', align: 'center' });
  });

  it('nasce no tamanho medido com os valores dados (e é o que o snapToAnchor daria)', () => {
    const p = create(withTarget(), 'fit-button', { values: { label: LONG_LABEL } });
    const b = marking(p, 'B');
    expect(b.rect.width).toBe(120);
    expect(b.rect.height).toBeGreaterThanOrEqual(76);
    expect(b.rect.y).toBe(300 - b.rect.height);
    expect(snapToAnchor(p, 'B').project).toBe(p);
  });

  it('o rect dado manda: não encosta, mas grava a âncora', () => {
    const given = { x: 10, y: 20, width: 120, height: 40 };
    const b = marking(create(withTarget(), 'fit-plain', { rect: given }), 'B');
    expect(b.rect).toEqual(given);
    expect(b.anchor).toEqual({ to: 'T', side: 'top', align: 'center' });
  });

  it('os padrões do componente completam o que a âncora não diz, e a densidade os escala', () => {
    const p = setContainerDensity(withTarget(), 'I1', 2);
    const b = marking(
      create(p, 'fit-plain', {
        anchor: { to: 'T' },
        anchorDefaults: { side: 'bottom', align: 'start', offset: { main: 4, cross: 2 } },
      }),
      'B',
    );
    // 120×40 unidades × 2; main 4 × 2 abaixo da âncora, cross 2 × 2 ao longo dela.
    expect(b.rect).toEqual({ x: 404, y: 408, width: 240, height: 80 });
    expect(b.anchor).toEqual({ to: 'T' });
  });

  it('presa dentro do container quando passa dele', () => {
    const b = marking(
      create(withTarget(), 'fit-plain', {
        anchor: { to: 'T', side: 'top', offset: { main: 5000, cross: 0 } },
      }),
      'B',
    );
    expect(b.rect.y).toBe(0);
  });

  it('âncora inválida falha com o código da invariante, sem criar nada', () => {
    const p = withTarget();
    expect(() => create(p, 'fit-plain', { anchor: { to: 'nada' } })).toThrowError(
      /^anchor-missing/,
    );
    expect(() => create(p, 'fit-plain', { anchor: { to: 'B' } })).toThrowError(
      /^anchor-self/,
    );
  });

  it('componentAnchoredPlacement devolve o retângulo e os avisos, sem criar a marcação', () => {
    const p = withTarget();
    const placement = componentAnchoredPlacement(
      p,
      catalog,
      { ...args('fit-plain'), anchor: { to: 'T', side: 'top', align: 'center' } },
      approximateMeasurer,
    );
    expect(placement.rect).toEqual({ x: 440, y: 260, width: 120, height: 40 });
    expect(placement.warnings).toEqual([]);
    expect(componentSize(p, catalog, args('fit-plain'), approximateMeasurer)).toEqual({
      width: 120,
      height: 40,
    });
    expect(p.markings.some((m) => m.id === 'B')).toBe(false);
    const far = componentAnchoredPlacement(
      p,
      catalog,
      { ...args('fit-plain'), anchor: { to: 'T', offset: { main: 5000, cross: 0 } } },
      approximateMeasurer,
    );
    expect(far.warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });
});

describe('o assentar leva a instância nova para outro espaço que o alvo', () => {
  /** T0 no canvas sobre a borda direita de I1; a instância ancorada à esquerda dele cai dentro de I1. */
  function straddling(): { p: Project; anchor: NewComponentArgs['anchor'] } {
    const p0 = fitProject();
    const box = imageCanvasRect(p0.containers[0]!, p0.containers[0]!.placement);
    const edge = box.x + box.width;
    const p = createMarking(p0, {
      id: 'T0',
      containerId: null,
      rect: { x: edge - 20, y: box.y + 100, width: 100, height: 40 },
    });
    return { p, anchor: { to: 'T0', side: 'start', align: 'center' } };
  }
  const canvasArgs = (anchor: NewComponentArgs['anchor']): NewComponentArgs => ({
    ...args('fit-plain'),
    containerId: null,
    anchor,
  });

  it('addComponentMarking cria a marcação e solta a âncora (não falha a criação inteira)', () => {
    const { p, anchor } = straddling();
    const out = addComponentMarking(p, catalog, canvasArgs(anchor), approximateMeasurer);
    const b = marking(out, 'B');
    expect(b.containerId).toBe('I1');
    expect(b.anchor ?? null).toBeNull();
    expect(out.annotations.some((a) => a.markingId === 'B')).toBe(true);
    expect(validateProject(out)).toEqual([]);
  });

  it('o alvo inexistente continua falhando (a âncora nunca foi aceitável)', () => {
    const { p } = straddling();
    expect(() =>
      addComponentMarking(p, catalog, canvasArgs({ to: 'nada' }), approximateMeasurer),
    ).toThrowError(/^anchor-missing/);
  });
});
