// Formato 4: stroke.cap, stroke.join e stroke.sides, e a regra genérica "só é permitido com formatVersion 4".
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSIONS,
} from '../../../src/model/components/componentFormat';
import {
  v4OnlyKeyIssues,
  validateComponent,
} from '../../../src/model/components/parseComponent';

function withStroke(
  stroke: unknown,
  version = 4,
  type: 'rect' | 'frame' | 'ellipse' | 'path' = 'rect',
): unknown {
  const node: Record<string, unknown> = { type, width: 100, height: 40, stroke };
  if (type === 'frame') node.children = [];
  if (type === 'path') {
    node.d = 'M0 0 L10 10';
    node.viewBox = [10, 10];
  }
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [node] },
  };
}

describe('formato 4 do componente', () => {
  it('as versões aceitas são 1 a 4', () => {
    expect([...COMPONENT_FORMAT_VERSIONS]).toEqual([1, 2, 3, 4]);
  });

  it('cap e join valem na formatVersion 4', () => {
    expect(
      validateComponent(withStroke({ color: '#000', cap: 'round', join: 'bevel' })),
    ).toEqual([]);
  });

  it('cap e join na formatVersion 3 dão o erro de versão, no caminho da chave', () => {
    expect(
      validateComponent(withStroke({ color: '#000', cap: 'round', join: 'bevel' }, 3)),
    ).toEqual([
      'template.children[0].stroke.cap: só é permitido com formatVersion 4',
      'template.children[0].stroke.join: só é permitido com formatVersion 4',
    ]);
  });

  it('cap fora da lista falha com os valores aceitos', () => {
    expect(validateComponent(withStroke({ color: '#000', cap: 'pointy' }))).toEqual([
      'template.children[0].stroke.cap: esperava um de: butt, round, square',
    ]);
    expect(validateComponent(withStroke({ color: '#000', join: 'x' }))).toEqual([
      'template.children[0].stroke.join: esperava um de: miter, round, bevel',
    ]);
  });

  it('cap e join aceitam expressão', () => {
    const stroke = {
      color: '#000',
      cap: { $switch: 'k', cases: { a: 'round' }, default: 'butt' },
      join: { $field: 'j', default: 'round' },
    };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
  });

  it('sides aceito em rect e em frame', () => {
    const stroke = { color: '#000', sides: ['top', 'bottom'] };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
    expect(validateComponent(withStroke(stroke, 4, 'frame'))).toEqual([]);
  });

  it('sides vazio, repetido ou com lado inválido falha', () => {
    const at = 'template.children[0].stroke.sides';
    expect(validateComponent(withStroke({ color: '#000', sides: [] }))).toEqual([
      `${at}: esperava ao menos um lado`,
    ]);
    expect(
      validateComponent(withStroke({ color: '#000', sides: ['top', 'top'] })),
    ).toEqual([`${at}[1]: lado repetido: top`]);
    expect(validateComponent(withStroke({ color: '#000', sides: ['middle'] }))).toEqual([
      `${at}[0]: esperava um de: top, right, bottom, left`,
    ]);
  });

  it('sides em ellipse e em path é erro', () => {
    for (const type of ['ellipse', 'path'] as const) {
      expect(
        validateComponent(withStroke({ color: '#000', sides: ['top'] }, 4, type)),
      ).toEqual([
        `template.children[0].stroke.sides: só vale em frame e rect (este é ${type})`,
      ]);
    }
  });

  it('sides com $switch que devolve ["left"] é aceito', () => {
    const stroke = {
      color: '#000',
      sides: { $switch: 'lado', cases: { e: ['left'] }, default: ['bottom'] },
    };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
  });

  it('sides na formatVersion 3 dá o erro de versão', () => {
    expect(validateComponent(withStroke({ color: '#000', sides: ['top'] }, 3))).toEqual([
      'template.children[0].stroke.sides: só é permitido com formatVersion 4',
    ]);
  });

  it('a regra de versão é genérica: uma chave fictícia na v3 devolve a mesma mensagem', () => {
    const template = { type: 'frame', fictional: { deep: 1 } };
    const out = v4OnlyKeyIssues(3, template, 'template', [['fictional', 'deep']]);
    expect(out).toEqual([
      {
        path: 'template.fictional.deep',
        message: 'só é permitido com formatVersion 4',
        code: 'component.v4Only',
      },
    ]);
    expect(v4OnlyKeyIssues(4, template, 'template', [['fictional', 'deep']])).toEqual([]);
  });
});
