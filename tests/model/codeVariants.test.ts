import { describe, expect, it } from 'vitest';
import { resolveCode, type SpecCode, type SpecField } from '../../src/model';
import { variantsSpec } from './variantsFixtures';

const type = variantsSpec().layers[0]!.annotationTypes[0]!;
const fields: readonly SpecField[] = type.fields;
const base = type.code!.compose!;

describe('resolveCode', () => {
  it('valor com caso: symbol substituído, o resto da base fica', () => {
    const code = resolveCode(base, { style: 'outlined' }, fields);
    expect(code).toEqual({
      symbol: 'androidx.compose.material3.OutlinedButton',
      path: 'compose/material3/Button.kt',
      params: { label: 'text' },
      values: { size: { small: 'Small', large: 'Large' } },
      notes: 'content = { Text(label) }',
    });
  });

  it('symbol, path e notes do caso substituem os da base', () => {
    const code = resolveCode(base, { style: 'text' }, fields);
    expect(code.symbol).toBe('androidx.compose.material3.TextButton');
    expect(code.path).toBe('compose/material3/TextButton.kt');
    expect(code.notes).toBe('sem fundo');
  });

  it('params e values somam chave a chave (o caso vence na mesma chave)', () => {
    const code = resolveCode(base, { style: 'tonal' }, fields);
    expect(code.params).toEqual({ label: 'text', size: 'sizeHint' });
    expect(code.values).toEqual({ size: { large: 'XL' } });
    const more: SpecCode = {
      symbol: 'B',
      params: { a: 'a1', b: 'b1' },
      values: { x: { p: 'P' }, y: { q: 'Q' } },
      variants: {
        field: 'style',
        cases: { text: { params: { b: 'b2', c: 'c2' }, values: { x: { r: 'R' } } } },
      },
    };
    expect(resolveCode(more, { style: 'text' }, fields)).toEqual({
      symbol: 'B',
      params: { a: 'a1', b: 'b2', c: 'c2' },
      values: { x: { r: 'R' }, y: { q: 'Q' } },
    });
  });

  it('valor sem caso usa a base, sem a chave variants', () => {
    const code = resolveCode(base, { style: 'filled' }, fields);
    expect(code).toEqual({
      symbol: 'androidx.compose.material3.Button',
      path: 'compose/material3/Button.kt',
      params: { label: 'text' },
      values: { size: { small: 'Small', large: 'Large' } },
      notes: 'content = { Text(label) }',
    });
    expect('variants' in code).toBe(false);
  });

  it('sem valor: o default do campo; sem default, a base', () => {
    // `style` tem default `filled` (sem caso): a base.
    expect(resolveCode(base, {}, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    expect(resolveCode(base, null, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    expect(resolveCode(base, undefined, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    // Default com caso: usa o caso.
    const withDefault = fields.map((f) =>
      f.key === 'style' && f.type === 'enum' ? { ...f, default: 'outlined' } : f,
    );
    expect(resolveCode(base, {}, withDefault).symbol).toBe(
      'androidx.compose.material3.OutlinedButton',
    );
    expect(resolveCode(base, { style: '' }, withDefault).symbol).toBe(
      'androidx.compose.material3.OutlinedButton',
    );
    expect(resolveCode(base, { style: null }, withDefault).symbol).toBe(
      'androidx.compose.material3.OutlinedButton',
    );
    // Sem default e sem valor: a base, mesmo que exista caso.
    const noDefault = fields.map((f) => {
      if (f.key !== 'style' || f.type !== 'enum') return f;
      const copy = { ...f };
      delete copy.default;
      return copy;
    });
    expect(resolveCode(base, {}, noDefault).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    // O valor da anotação vence o default.
    expect(resolveCode(base, { style: 'text' }, withDefault).symbol).toBe(
      'androidx.compose.material3.TextButton',
    );
  });

  it('entrada sem variants volta igual (mesma referência)', () => {
    const plain: SpecCode = {
      symbol: 'Card',
      path: 'a/B.kt',
      params: { title: 'title' },
    };
    expect(resolveCode(plain, { style: 'outlined' }, fields)).toBe(plain);
    expect(resolveCode(plain, null, [])).toBe(plain);
  });

  it('o resultado nunca tem variants e a entrada original não muda', () => {
    const snapshot = JSON.stringify(base);
    for (const style of ['filled', 'outlined', 'text', 'tonal', 'inexistente', null]) {
      expect('variants' in resolveCode(base, { style }, fields)).toBe(false);
    }
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(base.variants).toBeDefined();
  });
});
