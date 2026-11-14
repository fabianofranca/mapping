// Components Lab: evaluation of the expressions against the field values.
import { describe, expect, it } from 'vitest';
import type { Condition, Expr } from '../../../src/model/components/componentFormat';
import {
  evaluate,
  evaluateBoolean,
  evaluateCondition,
  evaluateText,
  NUMERIC_FNS,
  NUMERIC_OPS,
  isEmpty,
  linesKey,
  referencedFields,
  truthy,
} from '../../../src/model/components/expressions';

describe('isEmpty e truthy', () => {
  it('empty: null, undefined and text with only spaces', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('yes')).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });

  it('truthy: affirmative text and a non-zero number', () => {
    expect(truthy('yes')).toBe(true);
    expect(truthy('Primary')).toBe(true);
    expect(truthy(3)).toBe(true);
    // pt-BR kept: 'não' is in the engine's falsy set (FALSY_TEXT in src/model/components/expressions.ts)
    expect(truthy('não')).toBe(false);
    expect(truthy('nao')).toBe(false);
    expect(truthy('NAO')).toBe(false);
    expect(truthy('false')).toBe(false);
    expect(truthy('False')).toBe(false);
    expect(truthy('0')).toBe(false);
    expect(truthy('off')).toBe(false);
    expect(truthy(0)).toBe(false);
    expect(truthy('')).toBe(false);
    expect(truthy(null)).toBe(false);
    expect(truthy(undefined)).toBe(false);
  });
});

describe('evaluateCondition', () => {
  const values = { on: 'yes', off: 'no', variant: 'primary', count: 2, empty: '' };

  it('$field: truthy field', () => {
    expect(evaluateCondition({ $field: 'on' }, values)).toBe(true);
    expect(evaluateCondition({ $field: 'off' }, values)).toBe(false);
    expect(evaluateCondition({ $field: 'empty' }, values)).toBe(false);
    expect(evaluateCondition({ $field: 'missing' }, values)).toBe(false);
  });

  it('$eq: compares as text, empty is never equal', () => {
    expect(evaluateCondition({ $eq: ['variant', 'primary'] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['variant', 'secondary'] }, values)).toBe(false);
    expect(evaluateCondition({ $eq: ['count', 2] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['count', '2'] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['empty', ''] }, values)).toBe(false);
    expect(evaluateCondition({ $eq: ['missing', 'x'] }, values)).toBe(false);
  });

  it('$has: filled field, even if "no"', () => {
    expect(evaluateCondition({ $has: 'off' }, values)).toBe(true);
    expect(evaluateCondition({ $has: 'empty' }, values)).toBe(false);
    expect(evaluateCondition({ $has: 'missing' }, values)).toBe(false);
  });

  it('$not, $and and $or', () => {
    const on: Condition = { $field: 'on' };
    const off: Condition = { $field: 'off' };
    expect(evaluateCondition({ $not: on }, values)).toBe(false);
    expect(evaluateCondition({ $not: off }, values)).toBe(true);
    expect(evaluateCondition({ $and: [on, { $has: 'off' }] }, values)).toBe(true);
    expect(evaluateCondition({ $and: [on, off] }, values)).toBe(false);
    expect(evaluateCondition({ $and: [] }, values)).toBe(true);
    expect(evaluateCondition({ $or: [off, on] }, values)).toBe(true);
    expect(evaluateCondition({ $or: [off, { $has: 'empty' }] }, values)).toBe(false);
    expect(evaluateCondition({ $or: [] }, values)).toBe(false);
  });

  it('nested conditions', () => {
    const condition: Condition = {
      $and: [
        { $not: { $field: 'off' } },
        { $or: [{ $eq: ['variant', 'x'] }, { $has: 'on' }] },
      ],
    };
    expect(evaluateCondition(condition, values)).toBe(true);
  });
});

describe('evaluate', () => {
  it('literals come back as they are', () => {
    expect(evaluate('abc', {}, 'x')).toBe('abc');
    expect(evaluate(12, {}, 0)).toBe(12);
    expect(evaluate(false, {}, true)).toBe(false);
    expect(evaluate([1, 2, 3, 4] as const, {}, [0, 0, 0, 0] as const)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(evaluate<unknown>({ type: 'linear', angle: 0 }, {}, null)).toEqual({
      type: 'linear',
      angle: 0,
    });
  });

  it('$field with and without default', () => {
    expect(evaluate({ $field: 'label' }, { label: 'Save' }, '?')).toBe('Save');
    expect(evaluate({ $field: 'size' }, { size: 14 }, 0)).toBe(14);
    expect(evaluate({ $field: 'label' }, {}, '?')).toBe('?');
    expect(evaluate({ $field: 'label' }, { label: '  ' }, '?')).toBe('?');
    expect(evaluate({ $field: 'label', default: 'OK' }, {}, '?')).toBe('OK');
    expect(evaluate({ $field: 'label', default: 'OK' }, { label: 'Ir' }, '?')).toBe('Ir');
  });

  it('$if with and without else', () => {
    const withElse: Expr<string> = { $if: { $field: 'on' }, then: 'A', else: 'B' };
    expect(evaluate(withElse, { on: 'yes' }, '-')).toBe('A');
    expect(evaluate(withElse, { on: 'no' }, '-')).toBe('B');
    const noElse: Expr<string> = { $if: { $field: 'on' }, then: 'A' };
    expect(evaluate(noElse, { on: 'yes' }, '-')).toBe('A');
    expect(evaluate(noElse, { on: 'no' }, '-')).toBe('-');
  });

  it('$switch with case, default and missing field', () => {
    const expr: Expr<string> = {
      $switch: 'variant',
      cases: { primary: '#0a84ff', danger: '#ff3b30' },
      default: '#cccccc',
    };
    expect(evaluate(expr, { variant: 'primary' }, '#000000')).toBe('#0a84ff');
    expect(evaluate(expr, { variant: 'danger' }, '#000000')).toBe('#ff3b30');
    expect(evaluate(expr, { variant: 'outro' }, '#000000')).toBe('#cccccc');
    expect(evaluate(expr, {}, '#000000')).toBe('#cccccc');
    const noDefault: Expr<string> = { $switch: 'variant', cases: { primary: 'P' } };
    expect(evaluate(noDefault, { variant: 'outro' }, '#000000')).toBe('#000000');
    expect(evaluate(noDefault, {}, '#000000')).toBe('#000000');
  });

  it('$switch with a value inherited from Object.prototype falls to the default', () => {
    const expr: Expr<string> = { $switch: 'v', cases: { a: 'A' }, default: 'D' };
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
      expect(evaluate(expr, { v: key }, '-')).toBe('D');
    const noDefault: Expr<string> = { $switch: 'v', cases: { a: 'A' } };
    expect(evaluate(noDefault, { v: 'toString' }, '-')).toBe('-');
  });

  it('nested expressions', () => {
    const expr: Expr<string> = {
      $if: { $has: 'variant' },
      then: {
        $switch: 'variant',
        cases: { primary: { $field: 'accent', default: 'azul' } },
      },
      else: 'nenhum',
    };
    expect(evaluate(expr, { variant: 'primary', accent: 'verde' }, '-')).toBe('verde');
    expect(evaluate(expr, { variant: 'primary' }, '-')).toBe('azul');
    expect(evaluate(expr, { variant: 'x' }, '-')).toBe('-');
    expect(evaluate(expr, {}, '-')).toBe('nenhum');
  });

  it('$concat joins parts, converting numbers', () => {
    const expr: Expr<string> = {
      $concat: [
        'Total: ',
        { $field: 'count' },
        ' ',
        3,
        { $field: 'unit', default: 'un' },
      ],
    };
    expect(evaluate(expr, { count: 5 }, '')).toBe('Total: 5 3un');
    expect(evaluate(expr, { count: 5, unit: 'kg' }, '')).toBe('Total: 5 3kg');
    expect(evaluate(expr, {}, '')).toBe('Total:  3un');
  });
});

describe('evaluateText', () => {
  it('text, number and empty with fallback', () => {
    expect(evaluateText('Hi', {})).toBe('Hi');
    expect(evaluateText(42, {})).toBe('42');
    expect(evaluateText({ $field: 'n' }, { n: 7 })).toBe('7');
    expect(evaluateText({ $field: 'label' }, {})).toBe('');
    expect(evaluateText({ $field: 'label' }, {}, 'Label')).toBe('Label');
    expect(evaluateText('', {}, 'Label')).toBe('Label');
    expect(evaluateText({ $concat: ['a', 1] }, {})).toBe('a1');
  });
});

describe('referencedFields', () => {
  it('collects fields from expressions and conditions in a nested template', () => {
    const template = {
      type: 'frame',
      visible: { $has: 'shown' },
      fill: { $switch: 'variant', cases: { a: '#fff' }, default: { $field: 'bg' } },
      children: [
        {
          type: 'text',
          text: { $concat: [{ $field: 'label' }, ' ', { $field: 'count', default: 0 }] },
          color: {
            $if: { $and: [{ $eq: ['state', 'on'] }, { $not: { $field: 'locked' } }] },
            then: '#000',
            else: { $field: 'muted' },
          },
        },
        { type: 'rect', width: 10, anchors: { left: 1 } },
      ],
    };
    expect([...referencedFields(template)].sort()).toEqual([
      'bg',
      'count',
      'label',
      'locked',
      'muted',
      'shown',
      'state',
      'variant',
    ]);
  });

  it('literals do not cite fields', () => {
    expect(referencedFields('x').size).toBe(0);
    expect(referencedFields(null).size).toBe(0);
    expect(referencedFields({ type: 'rect', width: 10 }).size).toBe(0);
  });

  it('accumulates into the received set', () => {
    const out = new Set(['a']);
    referencedFields({ $field: 'b' }, out);
    expect([...out]).toEqual(['a', 'b']);
  });
});

describe('evaluateBoolean', () => {
  const values = { on: 'yes', off: 'no', label: 'Hi', variant: 'primary' };

  it('literal', () => {
    expect(evaluateBoolean(true, {}, false)).toBe(true);
    expect(evaluateBoolean(false, {}, true)).toBe(false);
  });

  it('direct condition', () => {
    expect(evaluateBoolean({ $has: 'label' }, values, false)).toBe(true);
    expect(evaluateBoolean({ $has: 'missing' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $not: { $field: 'on' } }, values, true)).toBe(false);
    expect(evaluateBoolean({ $eq: ['variant', 'primary'] }, values, false)).toBe(true);
    expect(
      evaluateBoolean({ $and: [{ $has: 'label' }, { $field: 'off' }] }, values, true),
    ).toBe(false);
  });

  it('$field by truthiness: "yes" and "no"', () => {
    expect(evaluateBoolean({ $field: 'on' }, values, false)).toBe(true);
    expect(evaluateBoolean({ $field: 'off' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'missing' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'label' }, values, false)).toBe(true);
  });

  it('$if with boolean branches', () => {
    const expr = { $if: { $has: 'label' }, then: true, else: false };
    expect(evaluateBoolean(expr, values, false)).toBe(true);
    expect(evaluateBoolean(expr, {}, true)).toBe(false);
    const noElse = { $if: { $field: 'off' }, then: true };
    expect(evaluateBoolean(noElse, values, true)).toBe(true); // sem else: fallback
    expect(evaluateBoolean(noElse, values, false)).toBe(false);
  });

  it('$switch with boolean branches', () => {
    const expr = { $switch: 'variant', cases: { primary: true }, default: false };
    expect(evaluateBoolean(expr, values, false)).toBe(true);
    expect(evaluateBoolean(expr, { variant: 'x' }, true)).toBe(false);
  });
});

describe('evaluateBoolean com $field e default (#951)', () => {
  it('empty field uses the default; filled uses the truthiness; without default, false', () => {
    expect(evaluateBoolean({ $field: 'f', default: true }, {}, false)).toBe(true);
    expect(evaluateBoolean({ $field: 'f', default: false }, {}, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'f', default: true }, { f: '  ' }, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $field: 'f', default: true }, { f: 'no' }, false)).toBe(
      false,
    );
    expect(evaluateBoolean({ $field: 'f', default: false }, { f: 'yes' }, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $field: 'f' }, {}, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'f' }, { f: 'yes' }, false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// Stage "expressions that compute" (EX1): numeric operations, comparisons, number in the text
// ---------------------------------------------------------------------------------------

const num = (expr: unknown, values: Record<string, string | number | null> = {}) =>
  evaluate<number | undefined>(expr as Expr<number | undefined>, values, undefined);

describe('numeric operations', () => {
  it('$add, $sub, $mul, $div', () => {
    expect(num({ $add: [1, 2, 3] })).toBe(6);
    expect(num({ $sub: [10, 4] })).toBe(6);
    expect(num({ $mul: [2, 3, 4] })).toBe(24);
    expect(num({ $div: [9, 4] })).toBe(2.25);
  });

  it('$mod has the sign of the divisor', () => {
    expect(num({ $mod: [7, 3] })).toBe(1);
    expect(num({ $mod: [-1, 12] })).toBe(11);
    expect(num({ $mod: [7, -3] })).toBe(-2);
    expect(num({ $mod: [-7, -3] })).toBe(-1);
  });

  it('$round, $floor, $ceil and $abs', () => {
    expect(num({ $round: 2.5 })).toBe(3);
    expect(num({ $round: 2.4 })).toBe(2);
    expect(num({ $floor: -1.2 })).toBe(-2);
    expect(num({ $ceil: 1.2 })).toBe(2);
    expect(num({ $abs: -4.5 })).toBe(4.5);
  });

  it('$min, $max and $clamp', () => {
    expect(num({ $min: [3, 1, 2] })).toBe(1);
    expect(num({ $max: [3, 1, 2] })).toBe(3);
    expect(num({ $clamp: [5, 0, 3] })).toBe(3);
    expect(num({ $clamp: [-5, 0, 3] })).toBe(0);
    expect(num({ $clamp: [2, 0, 3] })).toBe(2);
  });

  it('$sin and $cos in degrees', () => {
    expect(num({ $sin: 0 })).toBe(0);
    expect(num({ $sin: 90 })).toBe(1);
    expect(num({ $cos: 90 })).toBe(0);
    expect(num({ $cos: 180 })).toBe(-1);
    expect(num({ $sin: 30 })).toBeCloseTo(0.5, 12);
  });

  it('nested operations and with $field, $if and $switch as operand', () => {
    const values = { p: 0.37, kind: 'b', on: 'yes' };
    expect(num({ $mul: [{ $field: 'p' }, 200] }, values)).toBeCloseTo(74, 10);
    expect(num({ $add: [{ $mul: [2, 3] }, { $sub: [10, { $abs: -4 }] }] })).toBe(12);
    expect(num({ $add: [{ $if: { $field: 'on' }, then: 10, else: 1 }, 1] }, values)).toBe(
      11,
    );
    expect(
      num({ $mul: [{ $switch: 'kind', cases: { a: 1, b: 5 }, default: 0 }, 2] }, values),
    ).toBe(10);
    expect(num({ $add: [{ $field: 'q', default: 4 }, 1] }, values)).toBe(5);
  });

  it('empty operand, non-numeric text or with a comma: no value (the fallback applies)', () => {
    expect(num({ $add: [{ $field: 'a' }, 1] }, { a: null })).toBeUndefined();
    expect(num({ $add: [{ $field: 'a' }, 1] }, {})).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: 'abc' })).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: '0,5' })).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: '  ' })).toBeUndefined();
    expect(evaluate({ $mul: [{ $field: 'a' }, 200] }, { a: 'abc' }, 7)).toBe(7);
    expect(num({ $abs: { $field: 'a' } }, { a: 'x' })).toBeUndefined();
  });

  it('numeric text applies, with trimmed spaces', () => {
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: ' 0.5 ' })).toBe(100);
    expect(num({ $add: [{ $field: 'a' }, 1] }, { a: '3' })).toBe(4);
  });

  it('division and remainder by zero: no value', () => {
    expect(num({ $div: [1, 0] })).toBeUndefined();
    expect(num({ $mod: [1, 0] })).toBeUndefined();
    expect(num({ $div: [1, { $field: 'z' }] }, { z: 0 })).toBeUndefined();
  });

  it('an operand without a value makes the whole nested operation have no value', () => {
    expect(num({ $add: [1, { $div: [1, 0] }] })).toBeUndefined();
  });
});

describe('number in the text', () => {
  it('0.1 + 0.2 in $concat becomes 0.3', () => {
    expect(evaluateText({ $concat: [{ $add: [0.1, 0.2] }] }, {})).toBe('0.3');
  });

  it('a non-integer comes out with up to 6 places, no trailing zeros; an integer as today', () => {
    expect(evaluateText({ $concat: [{ $div: [1, 3] }] }, {})).toBe('0.333333');
    expect(evaluateText({ $concat: [{ $div: [1, 4] }, '%'] }, {})).toBe('0.25%');
    expect(evaluateText({ $concat: [{ $mul: [2, 3] }, 'px'] }, {})).toBe('6px');
    expect(evaluateText({ $concat: ['a', 1.5, 'b'] }, {})).toBe('a1.5b');
  });

  it('operation without a value inside $concat becomes empty text', () => {
    expect(evaluateText({ $concat: ['x', { $div: [1, 0] }, 'y'] }, {})).toBe('xy');
  });

  it('a non-integer number as evaluated text also uses up to 6 places', () => {
    expect(evaluateText({ $add: [0.1, 0.2] } as unknown as Expr<number>, {})).toBe('0.3');
  });
});

describe('comparisons', () => {
  const cmp = (condition: unknown, values: Record<string, string | number | null> = {}) =>
    evaluateCondition(condition as Condition, values);

  it('$gt, $gte, $lt and $lte', () => {
    expect(cmp({ $gt: [2, 1] })).toBe(true);
    expect(cmp({ $gt: [1, 1] })).toBe(false);
    expect(cmp({ $gte: [1, 1] })).toBe(true);
    expect(cmp({ $lt: [1, 2] })).toBe(true);
    expect(cmp({ $lt: [2, 2] })).toBe(false);
    expect(cmp({ $lte: [2, 2] })).toBe(true);
  });

  it('operands are expressions', () => {
    const values = { p: 0.5 };
    expect(cmp({ $gt: [{ $mul: [{ $field: 'p' }, 100] }, 49] }, values)).toBe(true);
    expect(cmp({ $lt: [{ $field: 'p' }, 0.5] }, values)).toBe(false);
  });

  it('operand without a value gives false (also in $lt and $lte)', () => {
    const values = { a: null, b: 'abc' };
    for (const op of ['$gt', '$gte', '$lt', '$lte'])
      expect(cmp({ [op]: [{ $field: 'a' }, 1] }, values)).toBe(false);
    expect(cmp({ $lte: [1, { $field: 'b' }] }, values)).toBe(false);
    expect(cmp({ $gte: [{ $div: [1, 0] }, 0] })).toBe(false);
  });

  it('compose with $and, $or and $not; $not of an empty operand gives true', () => {
    expect(cmp({ $and: [{ $gt: [2, 1] }, { $lt: [1, 2] }] })).toBe(true);
    expect(cmp({ $or: [{ $gt: [1, 2] }, { $lt: [1, 2] }] })).toBe(true);
    expect(cmp({ $not: { $gt: [{ $field: 'a' }, 1] } }, { a: null })).toBe(true);
  });

  it('apply in $if and in visible (evaluateBoolean)', () => {
    expect(evaluate({ $if: { $gte: [3, 3] }, then: 'yes', else: 'no' }, {}, 'x')).toBe(
      'yes',
    );
    expect(
      evaluateBoolean(
        { $lt: [{ $field: 'n' }, 2] } as unknown as Condition,
        { n: 1 },
        false,
      ),
    ).toBe(true);
    expect(
      evaluateBoolean(
        { $lt: [{ $field: 'n' }, 2] } as unknown as Condition,
        { n: 5 },
        true,
      ),
    ).toBe(false);
  });
});

describe('referencedFields with operations and comparisons', () => {
  it('counts the fields inside the operations, the comparisons and nested $if/$switch', () => {
    const fields = referencedFields({
      width: { $mul: [{ $field: 'p' }, { $add: [{ $field: 'q' }, 1] }] },
      visible: { $gt: [{ $field: 'r' }, { $sub: [{ $field: 's' }, 1] }] },
      gap: { $round: { $if: { $has: 't' }, then: { $field: 'u' }, else: 0 } },
    });
    expect([...fields].sort()).toEqual(['p', 'q', 'r', 's', 't', 'u']);
  });
});

describe('keys inherited from Object are not operations', () => {
  it('an object with constructor or valueOf is still the literal', () => {
    const literal = { constructor: 1, valueOf: 2 };
    expect(evaluate(literal as unknown as Expr<unknown>, {}, 'x')).toBe(literal);
  });
});

describe('table of the operations', () => {
  it('every operation with an arity has an implementation, and vice-versa', () => {
    expect(Object.keys(NUMERIC_FNS).sort()).toEqual(Object.keys(NUMERIC_OPS).sort());
  });
});

describe('$rows e $size (formato 4, EX2)', () => {
  it('$rows is the number of rows of the table field (0 without rows or without the field)', () => {
    const expr = { $rows: 'itens' } as unknown as Expr<number>;
    expect(evaluate(expr, { itens: [{ a: 1 }, { a: 2 }] }, -1)).toBe(2);
    expect(evaluate(expr, { itens: [] }, -1)).toBe(0);
    expect(evaluate(expr, {}, -1)).toBe(0);
    expect(evaluate(expr, { itens: 'texto' }, -1)).toBe(0);
  });

  it('$size reads the width or the height of the instance; without a size, no value', () => {
    const w = { $size: 'width' } as unknown as Expr<number>;
    const h = { $size: 'height' } as unknown as Expr<number>;
    const values = { '$size:width': 120, '$size:height': 48 };
    expect(evaluate(w, values, -1)).toBe(120);
    expect(evaluate(h, values, -1)).toBe(48);
    expect(evaluate(w, {}, -1)).toBe(-1);
  });

  it('enter operations and comparisons', () => {
    const values = { '$size:width': 200, itens: [{}, {}, {}] };
    const half = { $mul: [{ $size: 'width' }, 0.5] } as unknown as Expr<number>;
    expect(evaluate(half, values, -1)).toBe(100);
    expect(evaluateCondition({ $gt: [{ $rows: 'itens' }, 2] } as never, values)).toBe(
      true,
    );
  });

  it('referencedFields counts the $rows field, not the $index', () => {
    expect([...referencedFields({ a: { $rows: 'itens' } })]).toEqual(['itens']);
    expect([...referencedFields({ a: { $field: '$index' } })]).toEqual([]);
  });
});

describe('$lines (MC2, decision 8 of #898)', () => {
  it('reads the number of lines that the engine puts in the values', () => {
    expect(evaluate({ $lines: 'msg' }, { [linesKey('msg')]: 3 }, 0)).toBe(3);
  });

  it('without a value it falls to the fallback', () => {
    expect(evaluate({ $lines: 'msg' }, {}, 7)).toBe(7);
  });

  it('enters the comparisons and the numeric operations', () => {
    const values = { [linesKey('msg')]: 2 };
    expect(evaluateCondition({ $gt: [{ $lines: 'msg' }, 1] }, values)).toBe(true);
    expect(evaluate({ $mul: [{ $lines: 'msg' }, 10] }, values, 0)).toBe(20);
  });

  it('it is not a field: referencedFields does not count it', () => {
    expect([...referencedFields({ $gt: [{ $lines: 'msg' }, 1] })]).toEqual([]);
  });
});
