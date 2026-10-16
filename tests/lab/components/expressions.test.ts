// Laboratório Componentes: avaliação das expressões contra os valores dos campos.
import { describe, expect, it } from 'vitest';
import type { Condition, Expr } from '../../../lab/components/componentFormat';
import {
  evaluate,
  evaluateBoolean,
  evaluateCondition,
  evaluateText,
  isEmpty,
  referencedFields,
  truthy,
} from '../../../lab/components/expressions';

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
