// MF3: cor herdada — avaliação do `$provided` e o que o slot oferece (`instantiate`).
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
  it('lê o valor oferecido', () => {
    expect(evaluate(expr, { [providedKey('ink')]: '#f00' }, '')).toBe('#f00');
  });
  it('sem valor vale o default; o default também é uma expressão', () => {
    expect(evaluate(expr, {}, '')).toBe('#999');
    expect(
      evaluate(
        { $provided: 'ink', default: { $field: 'cor', default: '#abc' } },
        { cor: '#123' },
        '',
      ),
    ).toBe('#123');
  });
  it('sem valor nem default vale o padrão do lugar', () => {
    expect(evaluate({ $provided: 'ink' }, {}, 'padrão')).toBe('padrão');
  });
  it('não conta como campo do tipo', () => {
    expect([...referencedFields({ color: expr })]).toEqual([]);
  });
});

describe('instantiate com cor herdada', () => {
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

  it('a filha usa o valor oferecido pelas opções', () => {
    const { root } = instantiate(reader, {}, box, {
      measure: approximateMeasurer,
      provided: { 'content-color': '#ff0000' },
    });
    expect(find(root, 't')).toMatchObject({ fills: [{ color: '#ff0000' }] });
  });

  it('sem valor oferecido usa o default', () => {
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
          vazio: { $field: 'nenhum' },
        },
      },
    ],
  });

  it('o slot devolve o que oferece, resolvido com os campos do pai; o vazio não oferece', () => {
    const a = instantiate(giver, { ink: '#112233' }, box, {
      measure: approximateMeasurer,
    });
    expect(a.provides).toEqual({ 'content-color': '#112233', size: 12 });
    const b = instantiate(giver, {}, box, { measure: approximateMeasurer });
    expect(b.provides).toEqual({ 'content-color': '#0000ff', size: 12 });
  });

  it('os tokens e o modo do pai valem no valor oferecido', () => {
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

  it('sem provide o resultado não oferece nada', () => {
    const none = instantiate(reader, {}, box, { measure: approximateMeasurer });
    expect(none.provides ?? {}).toEqual({});
  });
});
