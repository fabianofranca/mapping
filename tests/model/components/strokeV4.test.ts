// Format 4: stroke.cap, stroke.join and stroke.sides, and the generic rule "only allowed with formatVersion 4".
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

describe('component format 4', () => {
  it('the accepted versions are 1 to 4', () => {
    expect([...COMPONENT_FORMAT_VERSIONS]).toEqual([1, 2, 3, 4]);
  });

  it('cap and join are valid in formatVersion 4', () => {
    expect(
      validateComponent(withStroke({ color: '#000', cap: 'round', join: 'bevel' })),
    ).toEqual([]);
  });

  it('cap and join in formatVersion 3 give the version error, at the key path', () => {
    expect(
      validateComponent(withStroke({ color: '#000', cap: 'round', join: 'bevel' }, 3)),
    ).toEqual([
      'template.children[0].stroke.cap: only allowed with formatVersion 4',
      'template.children[0].stroke.join: only allowed with formatVersion 4',
    ]);
  });

  it('cap outside the list fails with the accepted values', () => {
    expect(validateComponent(withStroke({ color: '#000', cap: 'pointy' }))).toEqual([
      'template.children[0].stroke.cap: expected one of: butt, round, square',
    ]);
    expect(validateComponent(withStroke({ color: '#000', join: 'x' }))).toEqual([
      'template.children[0].stroke.join: expected one of: miter, round, bevel',
    ]);
  });

  it('cap and join accept an expression', () => {
    const stroke = {
      color: '#000',
      cap: { $switch: 'k', cases: { a: 'round' }, default: 'butt' },
      join: { $field: 'j', default: 'round' },
    };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
  });

  it('sides accepted on rect and on frame', () => {
    const stroke = { color: '#000', sides: ['top', 'bottom'] };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
    expect(validateComponent(withStroke(stroke, 4, 'frame'))).toEqual([]);
  });

  it('empty, repeated or with an invalid side fails', () => {
    const at = 'template.children[0].stroke.sides';
    expect(validateComponent(withStroke({ color: '#000', sides: [] }))).toEqual([
      `${at}: expected at least one side`,
    ]);
    expect(
      validateComponent(withStroke({ color: '#000', sides: ['top', 'top'] })),
    ).toEqual([`${at}[1]: repeated side: top`]);
    expect(validateComponent(withStroke({ color: '#000', sides: ['middle'] }))).toEqual([
      `${at}[0]: expected one of: top, right, bottom, left`,
    ]);
  });

  it('sides on ellipse and on path is an error', () => {
    for (const type of ['ellipse', 'path'] as const) {
      expect(
        validateComponent(withStroke({ color: '#000', sides: ['top'] }, 4, type)),
      ).toEqual([
        `template.children[0].stroke.sides: only valid in frame and rect (this is ${type})`,
      ]);
    }
  });

  it('sides with $switch that returns ["left"] is accepted', () => {
    const stroke = {
      color: '#000',
      sides: { $switch: 'side', cases: { e: ['left'] }, default: ['bottom'] },
    };
    expect(validateComponent(withStroke(stroke))).toEqual([]);
  });

  it('sides on formatVersion 3 gives the version error', () => {
    expect(validateComponent(withStroke({ color: '#000', sides: ['top'] }, 3))).toEqual([
      'template.children[0].stroke.sides: only allowed with formatVersion 4',
    ]);
  });

  it('the generic rule of version: a fictitious key on v3 gives the same message', () => {
    const template = { type: 'frame', fictional: { deep: 1 } };
    const out = v4OnlyKeyIssues(3, template, 'template', [['fictional', 'deep']]);
    expect(out).toEqual([
      {
        path: 'template.fictional.deep',
        message: 'only allowed with formatVersion 4',
        code: 'component.v4Only',
      },
    ]);
    expect(v4OnlyKeyIssues(4, template, 'template', [['fictional', 'deep']])).toEqual([]);
  });
});
