import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addContainer,
  moveContainer,
  resizeContainer,
  setContainerPlacement,
  snapPlacement,
} from '../../src/model';
import { emptyProject, image, sampleProject } from './fixtures';

// Ruído de ponto flutuante no `placement` (`275.00000000000006`): nenhuma operação do modelo o grava.
const NOISY = 275.00000000000006;
const TINY = 5.6843418860808e-14;

describe('snapPlacement', () => {
  it('inteiro passa como está', () => {
    expect(snapPlacement({ x: 10, y: -20, scale: 2 })).toEqual({
      x: 10,
      y: -20,
      scale: 2,
    });
  });

  it('ruído dos dois lados de um inteiro vira o inteiro', () => {
    expect(
      snapPlacement({ x: NOISY, y: 274.99999999999994, scale: 1.0000000000000002 }),
    ).toEqual({
      x: 275,
      y: 275,
      scale: 1,
    });
  });

  it('fração de verdade fica como está', () => {
    expect(snapPlacement({ x: 1868.13, y: 0.5, scale: 0.25 })).toEqual({
      x: 1868.13,
      y: 0.5,
      scale: 0.25,
    });
  });

  it('o negativo perto de zero dá 0, e não -0', () => {
    const p = snapPlacement({ x: -TINY, y: TINY, scale: 1 });
    expect(Object.is(p.x, 0)).toBe(true);
    expect(Object.is(p.y, 0)).toBe(true);
  });

  it('a escala pequena nunca vira 0 nem inteiro menor que 1', () => {
    expect(snapPlacement({ x: 0, y: 0, scale: 1e-9 }).scale).toBe(1e-9);
    expect(snapPlacement({ x: 0, y: 0, scale: 0.4 }).scale).toBe(0.4);
  });
});

describe('placement sem ruído nas operações do modelo', () => {
  it('setContainerPlacement, moveContainer e resizeContainer gravam o inteiro', () => {
    const p = sampleProject();
    const id = 'I2';
    const a = setContainerPlacement(p, id, { x: NOISY, y: 3000 + TINY, scale: 1 });
    expect(image(a, id).placement).toEqual({ x: 275, y: 3000, scale: 1 });
    const b = moveContainer(p, id, 3000.0000000000005, 4000.0000000000005);
    expect(image(b, id).placement).toMatchObject({ x: 3000, y: 4000 });
    const c = resizeContainer(p, id, { x: 1050, y: 0, scale: 1.0000000000000002 });
    expect(image(c, id).placement.scale).toBe(1);
  });

  it('criar com `center` que dá ruído grava o inteiro', () => {
    // 100 x 100 entra com escala 10 (lado maior = 1000): x = 275.00000000000006 - 500
    const size = { id: 'N1', file: 'images/n.jpg', width: 100, height: 100 };
    const p = addContainer(emptyProject(), {
      ...size,
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(p, 'N1').placement).toEqual({ x: -225, y: -400, scale: 10 });
    const bg = addBackgroundContainer(emptyProject(), {
      id: 'N2',
      width: 100,
      height: 100,
      background: '#FFFFFF',
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(bg, 'N2').placement).toEqual({ x: -225, y: -400, scale: 10 });
  });

  it('criar à direita de um container com ruído grava o inteiro', () => {
    const base = sampleProject();
    const first = base.containers[0]!;
    // simula um projeto antigo, gravado com ruído
    const noisy = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === first.id ? { ...c, placement: { ...c.placement, x: NOISY } } : c,
      ),
    };
    const p = addContainer(noisy, {
      id: 'N3',
      file: 'images/n3.jpg',
      width: 10,
      height: 10,
    });
    const { x, y, scale } = image(p, 'N3').placement;
    for (const v of [x, y, scale]) expect(v).toBe(Math.round(v * 1e6) / 1e6);
  });
});
