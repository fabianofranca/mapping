// MF3: inherited color — evaluation of `$provided` and what the slot offers (`instantiate`).
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  evaluate,
  providedKey,
  referencedFields,
} from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { pickProvided } from '../../../src/model/components/provided';
import type { SceneNode } from '../../../src/model/components/scene';

const box = { x: 0, y: 0, width: 200, height: 60 };

function component(template: Record<string, unknown>): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 60 },
    template,
  } as unknown as ComponentFile;
}

function find(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node)
    for (const child of node.children) {
      const found = find(child, name);
      if (found) return found;
    }
  return undefined;
}

describe('evaluate: $provided', () => {
  const expr = { $provided: 'ink', default: '#999' };
  it('reads the provided value', () => {
    expect(evaluate(expr, { [providedKey('ink')]: '#f00' }, '')).toBe('#f00');
  });
  it('without a value the default applies; the default is also an expression', () => {
    expect(evaluate(expr, {}, '')).toBe('#999');
    expect(
      evaluate(
        { $provided: 'ink', default: { $field: 'color', default: '#abc' } },
        { color: '#123' },
        '',
      ),
    ).toBe('#123');
  });
  it('without a value or default the fallback of the place applies', () => {
    expect(evaluate({ $provided: 'ink' }, {}, 'fallback')).toBe('fallback');
  });
  it('does not count as a type field', () => {
    expect([...referencedFields({ color: expr })]).toEqual([]);
  });
});

describe('names that are members of Object.prototype', () => {
  it('without an ancestor that offers it, the default applies', () => {
    const comp = component({
      type: 'frame',
      children: [
        {
          type: 'text',
          name: 't',
          text: 'x',
          color: { $provided: 'constructor', default: '#010203' },
        },
      ],
    });
    expect(pickProvided({}, comp)).toEqual({});
    const { root } = instantiate(comp, {}, box, { measure: approximateMeasurer });
    expect(find(root, 't')).toMatchObject({ fills: [{ color: '#010203' }] });
  });
});

describe('instantiate with inherited color', () => {
  const reader = component({
    type: 'frame',
    children: [
      {
        type: 'text',
        name: 't',
        text: 'x',
        color: { $provided: 'content-color', default: '#999999' },
      },
    ],
  });

  it('the child uses the value offered by the options', () => {
    const { root } = instantiate(reader, {}, box, {
      measure: approximateMeasurer,
      provided: { 'content-color': '#ff0000' },
    });
    expect(find(root, 't')).toMatchObject({ fills: [{ color: '#ff0000' }] });
  });

  it('without an offered value it uses the default', () => {
    const { root } = instantiate(reader, {}, box, { measure: approximateMeasurer });
    expect(find(root, 't')).toMatchObject({ fills: [{ color: '#999999' }] });
  });

  const giver = component({
    type: 'frame',
    children: [
      {
        type: 'slot',
        provide: {
          'content-color': { $field: 'ink', default: '#0000ff' },
          size: 12,
          empty: { $field: 'none' },
        },
      },
    ],
  });

  it('the slot returns what it offers, resolved with the parent fields; the empty one does not offer', () => {
    const a = instantiate(giver, { ink: '#112233' }, box, {
      measure: approximateMeasurer,
    });
    expect(a.provides).toEqual({ 'content-color': '#112233', size: 12 });
    const b = instantiate(giver, {}, box, { measure: approximateMeasurer });
    expect(b.provides).toEqual({ 'content-color': '#0000ff', size: 12 });
  });

  it('the tokens and the mode of the parent apply to the offered value', () => {
    const tokenGiver = component({
      type: 'frame',
      children: [{ type: 'slot', provide: { 'content-color': { $token: 'on' } } }],
    });
    const dark = instantiate(tokenGiver, {}, box, {
      measure: approximateMeasurer,
      tokens: { on: '#eeeeee' },
    });
    expect(dark.provides).toEqual({ 'content-color': '#eeeeee' });
  });

  it('without provide the result offers nothing', () => {
    const none = instantiate(reader, {}, box, { measure: approximateMeasurer });
    expect(none.provides ?? {}).toEqual({});
  });
});
