// SG1: the SVG transform list (`svgTransform.ts`, decision 7 of #2847): `gradientTransform` as a
// 2×3 matrix, its composition, its application to a point and the inverse of its linear part.
import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  invertLinear,
  parseTransform,
  type Matrix,
} from '../../../src/model/components/svgTransform';

function parsed(text: string): Matrix {
  const matrix = parseTransform(text);
  if (matrix === undefined) throw new Error(`not parsed: ${text}`);
  return matrix;
}

const point = (text: string, x: number, y: number): [number, number] => {
  const [px, py] = applyToPoint(parsed(text), [x, y]);
  return [Number(px.toFixed(9)) + 0, Number(py.toFixed(9)) + 0];
};

describe('parseTransform: each function', () => {
  it('matrix(a b c d e f) keeps the six numbers', () => {
    expect(parsed('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('translate with one value moves x only', () => {
    expect(parsed('translate(3)')).toEqual([1, 0, 0, 1, 3, 0]);
  });

  it('translate with two values moves x and y', () => {
    expect(parsed('translate(3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
  });

  it('scale with one value scales both axes', () => {
    expect(parsed('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('scale with two values scales each axis', () => {
    expect(parsed('scale(2 3)')).toEqual([2, 0, 0, 3, 0, 0]);
  });

  it('rotate without a center turns around the origin', () => {
    expect(point('rotate(90)', 1, 0)).toEqual([0, 1]);
    expect(point('rotate(180)', 1, 2)).toEqual([-1, -2]);
  });

  it('rotate with a center turns around it', () => {
    expect(point('rotate(90 12 12)', 0, 12)).toEqual([12, 0]);
    expect(point('rotate(90 12 12)', 12, 12)).toEqual([12, 12]);
  });

  it('skewX shifts x by tan(angle) times y', () => {
    expect(point('skewX(45)', 0, 2)).toEqual([2, 2]);
  });

  it('skewY shifts y by tan(angle) times x', () => {
    expect(point('skewY(45)', 2, 0)).toEqual([2, 2]);
  });
});

describe('parseTransform: lists', () => {
  it('composes left to right as SVG does: the last function applies first', () => {
    // translate(10 0) scale(2): the point is scaled, then moved.
    expect(point('translate(10 0) scale(2)', 1, 1)).toEqual([12, 2]);
    expect(point('scale(2) translate(10 0)', 1, 1)).toEqual([22, 2]);
  });

  it('accepts spaces and commas as separators, inside and between functions', () => {
    const expected = parsed('translate(1 2) scale(3 4)');
    expect(parsed('translate(1,2),scale(3,4)')).toEqual(expected);
    expect(parsed('  translate( 1 , 2 )   scale(3 4)  ')).toEqual(expected);
  });

  it('is the figma form: translate, rotate and scale', () => {
    expect(point('translate(12 12) rotate(90) scale(4)', 1, 0)).toEqual([12, 16]);
  });
});

describe('parseTransform: invalid text is undefined', () => {
  it.each([
    '',
    '   ',
    'rotate',
    'rotate(',
    'rotate(a)',
    'rotate(90 12)',
    'translate()',
    'translate(1 2 3)',
    'scale(1 2 3)',
    'matrix(1 2 3 4 5)',
    'skewX(1 2)',
    'spin(90)',
    'scale(2) junk',
    'scale(2);scale(3)',
    'scale(1e999)',
  ])('%j', (text) => {
    expect(parseTransform(text)).toBeUndefined();
  });
});

describe('invertLinear', () => {
  it('inverts the linear part and ignores the translation', () => {
    const inverse = invertLinear(parsed('translate(5 6) scale(2 4)'));
    expect(inverse).toEqual([0.5, 0, 0, 0.25]);
  });

  it('inverts a rotation to the opposite rotation', () => {
    const inverse = invertLinear(parsed('rotate(90)'));
    expect(inverse?.map((n) => Number(n.toFixed(9)) + 0)).toEqual([0, -1, 1, 0]);
  });

  it('is undefined for a singular matrix', () => {
    expect(invertLinear(parsed('scale(0 1)'))).toBeUndefined();
    expect(invertLinear(parsed('matrix(1 2 2 4 0 0)'))).toBeUndefined();
  });
});
