// Laboratório Componentes: avaliação das expressões contra os valores dos campos.
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
  referencedFields,
  truthy,
} from '../../../src/model/components/expressions';

describe('isEmpty e truthy', () => {
  it('vazio: null, undefined e texto só com espaços', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('sim')).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });

  it('truthy: texto afirmativo e número diferente de zero', () => {
    expect(truthy('sim')).toBe(true);
    expect(truthy('Primário')).toBe(true);
    expect(truthy(3)).toBe(true);
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
  const values = { on: 'sim', off: 'não', variant: 'primary', count: 2, empty: '' };

  it('$field: campo verdadeiro', () => {
    expect(evaluateCondition({ $field: 'on' }, values)).toBe(true);
    expect(evaluateCondition({ $field: 'off' }, values)).toBe(false);
    expect(evaluateCondition({ $field: 'empty' }, values)).toBe(false);
    expect(evaluateCondition({ $field: 'missing' }, values)).toBe(false);
  });

  it('$eq: compara como texto, vazio nunca é igual', () => {
    expect(evaluateCondition({ $eq: ['variant', 'primary'] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['variant', 'secondary'] }, values)).toBe(false);
    expect(evaluateCondition({ $eq: ['count', 2] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['count', '2'] }, values)).toBe(true);
    expect(evaluateCondition({ $eq: ['empty', ''] }, values)).toBe(false);
    expect(evaluateCondition({ $eq: ['missing', 'x'] }, values)).toBe(false);
  });

  it('$has: campo preenchido, mesmo que "não"', () => {
    expect(evaluateCondition({ $has: 'off' }, values)).toBe(true);
    expect(evaluateCondition({ $has: 'empty' }, values)).toBe(false);
    expect(evaluateCondition({ $has: 'missing' }, values)).toBe(false);
  });

  it('$not, $and e $or', () => {
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

  it('condições aninhadas', () => {
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
  it('literais voltam como estão', () => {
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

  it('$field com e sem default', () => {
    expect(evaluate({ $field: 'label' }, { label: 'Salvar' }, '?')).toBe('Salvar');
    expect(evaluate({ $field: 'size' }, { size: 14 }, 0)).toBe(14);
    expect(evaluate({ $field: 'label' }, {}, '?')).toBe('?');
    expect(evaluate({ $field: 'label' }, { label: '  ' }, '?')).toBe('?');
    expect(evaluate({ $field: 'label', default: 'OK' }, {}, '?')).toBe('OK');
    expect(evaluate({ $field: 'label', default: 'OK' }, { label: 'Ir' }, '?')).toBe('Ir');
  });

  it('$if com e sem else', () => {
    const withElse: Expr<string> = { $if: { $field: 'on' }, then: 'A', else: 'B' };
    expect(evaluate(withElse, { on: 'sim' }, '-')).toBe('A');
    expect(evaluate(withElse, { on: 'não' }, '-')).toBe('B');
    const noElse: Expr<string> = { $if: { $field: 'on' }, then: 'A' };
    expect(evaluate(noElse, { on: 'sim' }, '-')).toBe('A');
    expect(evaluate(noElse, { on: 'não' }, '-')).toBe('-');
  });

  it('$switch com caso, default e campo ausente', () => {
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

  it('$switch com valor herdado de Object.prototype cai no default', () => {
    const expr: Expr<string> = { $switch: 'v', cases: { a: 'A' }, default: 'D' };
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
      expect(evaluate(expr, { v: key }, '-')).toBe('D');
    const noDefault: Expr<string> = { $switch: 'v', cases: { a: 'A' } };
    expect(evaluate(noDefault, { v: 'toString' }, '-')).toBe('-');
  });

  it('expressões aninhadas', () => {
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

  it('$concat junta partes, convertendo números', () => {
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
  it('texto, número e vazio com fallback', () => {
    expect(evaluateText('Oi', {})).toBe('Oi');
    expect(evaluateText(42, {})).toBe('42');
    expect(evaluateText({ $field: 'n' }, { n: 7 })).toBe('7');
    expect(evaluateText({ $field: 'label' }, {})).toBe('');
    expect(evaluateText({ $field: 'label' }, {}, 'Rótulo')).toBe('Rótulo');
    expect(evaluateText('', {}, 'Rótulo')).toBe('Rótulo');
    expect(evaluateText({ $concat: ['a', 1] }, {})).toBe('a1');
  });
});

describe('referencedFields', () => {
  it('coleta campos de expressões e condições em um template aninhado', () => {
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

  it('literais não citam campos', () => {
    expect(referencedFields('x').size).toBe(0);
    expect(referencedFields(null).size).toBe(0);
    expect(referencedFields({ type: 'rect', width: 10 }).size).toBe(0);
  });

  it('acumula no conjunto recebido', () => {
    const out = new Set(['a']);
    referencedFields({ $field: 'b' }, out);
    expect([...out]).toEqual(['a', 'b']);
  });
});

describe('evaluateBoolean', () => {
  const values = { on: 'sim', off: 'não', label: 'Oi', variant: 'primary' };

  it('literal', () => {
    expect(evaluateBoolean(true, {}, false)).toBe(true);
    expect(evaluateBoolean(false, {}, true)).toBe(false);
  });

  it('condição direta', () => {
    expect(evaluateBoolean({ $has: 'label' }, values, false)).toBe(true);
    expect(evaluateBoolean({ $has: 'missing' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $not: { $field: 'on' } }, values, true)).toBe(false);
    expect(evaluateBoolean({ $eq: ['variant', 'primary'] }, values, false)).toBe(true);
    expect(
      evaluateBoolean({ $and: [{ $has: 'label' }, { $field: 'off' }] }, values, true),
    ).toBe(false);
  });

  it('$field por veracidade: "sim" e "não"', () => {
    expect(evaluateBoolean({ $field: 'on' }, values, false)).toBe(true);
    expect(evaluateBoolean({ $field: 'off' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'missing' }, values, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'label' }, values, false)).toBe(true);
  });

  it('$if com ramos booleanos', () => {
    const expr = { $if: { $has: 'label' }, then: true, else: false };
    expect(evaluateBoolean(expr, values, false)).toBe(true);
    expect(evaluateBoolean(expr, {}, true)).toBe(false);
    const noElse = { $if: { $field: 'off' }, then: true };
    expect(evaluateBoolean(noElse, values, true)).toBe(true); // sem else: fallback
    expect(evaluateBoolean(noElse, values, false)).toBe(false);
  });

  it('$switch com ramos booleanos', () => {
    const expr = { $switch: 'variant', cases: { primary: true }, default: false };
    expect(evaluateBoolean(expr, values, false)).toBe(true);
    expect(evaluateBoolean(expr, { variant: 'x' }, true)).toBe(false);
  });
});

describe('evaluateBoolean com $field e default (#951)', () => {
  it('campo vazio usa o default; preenchido usa a veracidade; sem default, falso', () => {
    expect(evaluateBoolean({ $field: 'f', default: true }, {}, false)).toBe(true);
    expect(evaluateBoolean({ $field: 'f', default: false }, {}, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'f', default: true }, { f: '  ' }, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $field: 'f', default: true }, { f: 'não' }, false)).toBe(
      false,
    );
    expect(evaluateBoolean({ $field: 'f', default: false }, { f: 'sim' }, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $field: 'f' }, {}, true)).toBe(false);
    expect(evaluateBoolean({ $field: 'f' }, { f: 'sim' }, false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// Etapa "expressões que calculam" (EX1): operações numéricas, comparações, número no texto
// ---------------------------------------------------------------------------------------

const num = (expr: unknown, values: Record<string, string | number | null> = {}) =>
  evaluate<number | undefined>(expr as Expr<number | undefined>, values, undefined);

describe('operações numéricas', () => {
  it('$add, $sub, $mul, $div', () => {
    expect(num({ $add: [1, 2, 3] })).toBe(6);
    expect(num({ $sub: [10, 4] })).toBe(6);
    expect(num({ $mul: [2, 3, 4] })).toBe(24);
    expect(num({ $div: [9, 4] })).toBe(2.25);
  });

  it('$mod tem o sinal do divisor', () => {
    expect(num({ $mod: [7, 3] })).toBe(1);
    expect(num({ $mod: [-1, 12] })).toBe(11);
    expect(num({ $mod: [7, -3] })).toBe(-2);
    expect(num({ $mod: [-7, -3] })).toBe(-1);
  });

  it('$round, $floor, $ceil e $abs', () => {
    expect(num({ $round: 2.5 })).toBe(3);
    expect(num({ $round: 2.4 })).toBe(2);
    expect(num({ $floor: -1.2 })).toBe(-2);
    expect(num({ $ceil: 1.2 })).toBe(2);
    expect(num({ $abs: -4.5 })).toBe(4.5);
  });

  it('$min, $max e $clamp', () => {
    expect(num({ $min: [3, 1, 2] })).toBe(1);
    expect(num({ $max: [3, 1, 2] })).toBe(3);
    expect(num({ $clamp: [5, 0, 3] })).toBe(3);
    expect(num({ $clamp: [-5, 0, 3] })).toBe(0);
    expect(num({ $clamp: [2, 0, 3] })).toBe(2);
  });

  it('$sin e $cos em graus', () => {
    expect(num({ $sin: 0 })).toBe(0);
    expect(num({ $sin: 90 })).toBe(1);
    expect(num({ $cos: 90 })).toBe(0);
    expect(num({ $cos: 180 })).toBe(-1);
    expect(num({ $sin: 30 })).toBeCloseTo(0.5, 12);
  });

  it('operações aninhadas e com $field, $if e $switch como operando', () => {
    const values = { p: 0.37, kind: 'b', on: 'sim' };
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

  it('operando vazio, texto não numérico ou com vírgula: sem valor (vale o fallback)', () => {
    expect(num({ $add: [{ $field: 'a' }, 1] }, { a: null })).toBeUndefined();
    expect(num({ $add: [{ $field: 'a' }, 1] }, {})).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: 'abc' })).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: '0,5' })).toBeUndefined();
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: '  ' })).toBeUndefined();
    expect(evaluate({ $mul: [{ $field: 'a' }, 200] }, { a: 'abc' }, 7)).toBe(7);
    expect(num({ $abs: { $field: 'a' } }, { a: 'x' })).toBeUndefined();
  });

  it('texto numérico vale, com espaços aparados', () => {
    expect(num({ $mul: [{ $field: 'a' }, 200] }, { a: ' 0.5 ' })).toBe(100);
    expect(num({ $add: [{ $field: 'a' }, 1] }, { a: '3' })).toBe(4);
  });

  it('divisão e resto por zero: sem valor', () => {
    expect(num({ $div: [1, 0] })).toBeUndefined();
    expect(num({ $mod: [1, 0] })).toBeUndefined();
    expect(num({ $div: [1, { $field: 'z' }] }, { z: 0 })).toBeUndefined();
  });

  it('um operando sem valor faz a operação aninhada inteira ficar sem valor', () => {
    expect(num({ $add: [1, { $div: [1, 0] }] })).toBeUndefined();
  });
});

describe('número no texto', () => {
  it('0.1 + 0.2 no $concat vira 0.3', () => {
    expect(evaluateText({ $concat: [{ $add: [0.1, 0.2] }] }, {})).toBe('0.3');
  });

  it('não inteiro sai com até 6 casas, sem zeros à direita; inteiro como hoje', () => {
    expect(evaluateText({ $concat: [{ $div: [1, 3] }] }, {})).toBe('0.333333');
    expect(evaluateText({ $concat: [{ $div: [1, 4] }, '%'] }, {})).toBe('0.25%');
    expect(evaluateText({ $concat: [{ $mul: [2, 3] }, 'px'] }, {})).toBe('6px');
    expect(evaluateText({ $concat: ['a', 1.5, 'b'] }, {})).toBe('a1.5b');
  });

  it('operação sem valor dentro do $concat vira texto vazio', () => {
    expect(evaluateText({ $concat: ['x', { $div: [1, 0] }, 'y'] }, {})).toBe('xy');
  });

  it('um número não inteiro como texto avaliado também usa até 6 casas', () => {
    expect(evaluateText({ $add: [0.1, 0.2] } as unknown as Expr<number>, {})).toBe('0.3');
  });
});

describe('comparações', () => {
  const cmp = (condition: unknown, values: Record<string, string | number | null> = {}) =>
    evaluateCondition(condition as Condition, values);

  it('$gt, $gte, $lt e $lte', () => {
    expect(cmp({ $gt: [2, 1] })).toBe(true);
    expect(cmp({ $gt: [1, 1] })).toBe(false);
    expect(cmp({ $gte: [1, 1] })).toBe(true);
    expect(cmp({ $lt: [1, 2] })).toBe(true);
    expect(cmp({ $lt: [2, 2] })).toBe(false);
    expect(cmp({ $lte: [2, 2] })).toBe(true);
  });

  it('operandos são expressões', () => {
    const values = { p: 0.5 };
    expect(cmp({ $gt: [{ $mul: [{ $field: 'p' }, 100] }, 49] }, values)).toBe(true);
    expect(cmp({ $lt: [{ $field: 'p' }, 0.5] }, values)).toBe(false);
  });

  it('operando sem valor dá falso (também em $lt e $lte)', () => {
    const values = { a: null, b: 'abc' };
    for (const op of ['$gt', '$gte', '$lt', '$lte'])
      expect(cmp({ [op]: [{ $field: 'a' }, 1] }, values)).toBe(false);
    expect(cmp({ $lte: [1, { $field: 'b' }] }, values)).toBe(false);
    expect(cmp({ $gte: [{ $div: [1, 0] }, 0] })).toBe(false);
  });

  it('compõem com $and, $or e $not; $not de operando vazio dá verdadeiro', () => {
    expect(cmp({ $and: [{ $gt: [2, 1] }, { $lt: [1, 2] }] })).toBe(true);
    expect(cmp({ $or: [{ $gt: [1, 2] }, { $lt: [1, 2] }] })).toBe(true);
    expect(cmp({ $not: { $gt: [{ $field: 'a' }, 1] } }, { a: null })).toBe(true);
  });

  it('valem em $if e em visible (evaluateBoolean)', () => {
    expect(evaluate({ $if: { $gte: [3, 3] }, then: 'sim', else: 'não' }, {}, 'x')).toBe(
      'sim',
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

describe('referencedFields com operações e comparações', () => {
  it('conta os campos dentro das operações, das comparações e de $if/$switch aninhados', () => {
    const fields = referencedFields({
      width: { $mul: [{ $field: 'p' }, { $add: [{ $field: 'q' }, 1] }] },
      visible: { $gt: [{ $field: 'r' }, { $sub: [{ $field: 's' }, 1] }] },
      gap: { $round: { $if: { $has: 't' }, then: { $field: 'u' }, else: 0 } },
    });
    expect([...fields].sort()).toEqual(['p', 'q', 'r', 's', 't', 'u']);
  });
});

describe('chaves herdadas do Object não são operações', () => {
  it('um objeto com constructor ou valueOf continua sendo o literal', () => {
    const literal = { constructor: 1, valueOf: 2 };
    expect(evaluate(literal as unknown as Expr<unknown>, {}, 'x')).toBe(literal);
  });
});

describe('tabela das operações', () => {
  it('toda operação com aridade tem implementação, e vice-versa', () => {
    expect(Object.keys(NUMERIC_FNS).sort()).toEqual(Object.keys(NUMERIC_OPS).sort());
  });
});
