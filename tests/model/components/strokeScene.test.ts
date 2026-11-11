// Formato 4 na cena: cap/join/sides propagados ao traço e o recorte da raiz (A3).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import type { FrameNode } from '../../../src/model/components/scene';

function run(template: FrameTemplate, values = {}) {
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width: 100, height: 40 },
    template,
  };
  const scene = instantiate(
    file,
    values,
    { x: 0, y: 0, width: 100, height: 40 },
    {
      measure: approximateMeasurer,
    },
  );
  return scene.root as FrameNode;
}

describe('traço na cena (formato 4)', () => {
  it('cap, join e sides chegam ao traço', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 100,
          height: 40,
          stroke: { color: '#000', cap: 'round', join: 'bevel', sides: ['bottom'] },
        },
      ],
    });
    expect(root.children[0]?.stroke).toMatchObject({
      cap: 'round',
      join: 'bevel',
      sides: ['bottom'],
    });
  });

  it('os quatro lados dão a cena sem stroke.sides (o contorno inteiro, MC0)', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 100,
          height: 40,
          cornerRadius: 8,
          stroke: { color: '#000', sides: ['left', 'bottom', 'right', 'top'] },
        },
      ],
    });
    expect(root.children[0]?.stroke).not.toHaveProperty('sides');
  });

  it('três lados ficam, na ordem de STROKE_SIDES', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 100,
          height: 40,
          stroke: { color: '#000', sides: ['left', 'bottom', 'top'] },
        },
      ],
    });
    expect(root.children[0]?.stroke?.sides).toEqual(['top', 'bottom', 'left']);
  });

  it('sem as chaves novas o traço não ganha cap, join nem sides', () => {
    const root = run({
      type: 'frame',
      children: [{ type: 'rect', width: 10, height: 10, stroke: { color: '#000' } }],
    });
    const stroke = root.children[0]?.stroke;
    expect(stroke).toBeDefined();
    expect(stroke).not.toHaveProperty('cap');
    expect(stroke).not.toHaveProperty('join');
    expect(stroke).not.toHaveProperty('sides');
  });

  it('sides por $switch é resolvido', () => {
    const root = run(
      {
        type: 'frame',
        children: [
          {
            type: 'rect',
            width: 10,
            height: 10,
            stroke: {
              color: '#000',
              sides: { $switch: 'lado', cases: { e: ['left'] }, default: ['top'] },
            },
          },
        ],
      },
      { lado: 'e' },
    );
    expect(root.children[0]?.stroke?.sides).toEqual(['left']);
  });
});

describe('recorte da raiz (A3)', () => {
  it('o traço outside cresce o recorte (antes o anel sumia)', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4, align: 'outside' },
      children: [],
    });
    expect(root.clip).toBe(true);
    expect(root.clipBox).toEqual({ x: -4, y: -4, width: 108, height: 48 });
  });

  it('o traço center cresce metade da largura', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4, align: 'center' },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -2, y: -2, width: 104, height: 44 });
  });

  it('o traço inside não muda o recorte', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4 },
      children: [],
    });
    expect(root.clipBox).toBeUndefined();
  });

  it('a sombra da raiz cresce o recorte por lado (blur 8, y 4)', () => {
    const root = run({
      type: 'frame',
      fill: '#fff',
      shadow: { color: '#0003', blur: 8, y: 4 },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -8, y: -4, width: 116, height: 56 });
  });

  it('a sombra de um filho que passa da caixa só por ela entra no recorte', () => {
    const root = run({
      type: 'frame',
      layout: { type: 'row' },
      children: [
        {
          type: 'rect',
          width: 100,
          height: 40,
          fill: '#fff',
          shadow: { color: '#0003', blur: 8, y: 4 },
        },
      ],
    });
    expect(root.clipBox).toEqual({ x: -8, y: -4, width: 116, height: 56 });
  });

  it('um filho com texto que passa da caixa continua recortado em 100×40', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'text',
          width: 300,
          height: 40,
          text: 'um texto muito mais largo que a caixa da instância',
        },
      ],
    });
    expect(root.clip).toBe(true);
    expect(root.clipBox).toBeUndefined();
  });

  it('um filho que passa da caixa pelo conteúdo não alarga o recorte além da sua sombra', () => {
    const root = run({
      type: 'frame',
      layout: { type: 'row' },
      children: [{ type: 'rect', width: 300, height: 40, fill: '#fff' }],
    });
    expect(root.clipBox).toBeUndefined();
  });
});
