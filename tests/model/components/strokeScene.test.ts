// Format 4 in the scene: cap/join/sides propagated to the stroke and the root clip (A3).
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

describe('stroke in the scene (format 4)', () => {
  it('cap, join and sides reach the stroke', () => {
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

  it('the four sides give the scene without stroke.sides (the whole outline, MC0)', () => {
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

  it('three sides stay, in the order of STROKE_SIDES', () => {
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

  it('without the new keys the stroke does not get cap, join or sides', () => {
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

  it('sides by $switch is resolved', () => {
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

describe('root clip (A3)', () => {
  it('the outside stroke grows the clip (before, the ring disappeared)', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4, align: 'outside' },
      children: [],
    });
    expect(root.clip).toBe(true);
    expect(root.clipBox).toEqual({ x: -4, y: -4, width: 108, height: 48 });
  });

  it('the center stroke grows half the width', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4, align: 'center' },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -2, y: -2, width: 104, height: 44 });
  });

  it('the inside stroke does not change the clip', () => {
    const root = run({
      type: 'frame',
      stroke: { color: '#f00', width: 4 },
      children: [],
    });
    expect(root.clipBox).toBeUndefined();
  });

  it('the root shadow grows the clip per side (blur 8, y 4)', () => {
    const root = run({
      type: 'frame',
      fill: '#fff',
      shadow: { color: '#0003', blur: 8, y: 4 },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -8, y: -4, width: 116, height: 56 });
  });

  it('a shadow of a child that goes past the box only by it enters the clip', () => {
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

  it('a child with text that goes past the box is still clipped at 100×40', () => {
    const root = run({
      type: 'frame',
      children: [
        {
          type: 'text',
          width: 300,
          height: 40,
          text: 'a text much wider than the box of the instance',
        },
      ],
    });
    expect(root.clip).toBe(true);
    expect(root.clipBox).toBeUndefined();
  });

  it('a child that goes past the box by content does not widen the clip beyond its shadow', () => {
    const root = run({
      type: 'frame',
      layout: { type: 'row' },
      children: [{ type: 'rect', width: 300, height: 40, fill: '#fff' }],
    });
    expect(root.clipBox).toBeUndefined();
  });
});
