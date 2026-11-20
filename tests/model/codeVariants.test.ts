import { describe, expect, it } from 'vitest';
import {
  resolveCode,
  type CaseSheets,
  type Signature,
  type SpecCode,
  type SpecField,
} from '../../src/model';
import { variantsSpec } from './variantsFixtures';

const type = variantsSpec().layers[0]!.annotationTypes[0]!;
const fields: readonly SpecField[] = type.fields;
const base = type.code!.compose!;

describe('resolveCode', () => {
  it('value with a case: symbol replaced, the rest of the base stays', () => {
    const code = resolveCode(base, { style: 'outlined' }, fields);
    expect(code).toEqual({
      symbol: 'androidx.compose.material3.OutlinedButton',
      path: 'compose/material3/Button.kt',
      params: { label: 'text' },
      values: { size: { small: 'Small', large: 'Large' } },
      notes: 'content = { Text(label) }',
    });
  });

  it('symbol, path and notes of the case replace the base ones', () => {
    const code = resolveCode(base, { style: 'text' }, fields);
    expect(code.symbol).toBe('androidx.compose.material3.TextButton');
    expect(code.path).toBe('compose/material3/TextButton.kt');
    // pt-BR kept: matches the notes text of variantsFixtures (Portuguese fixture data).
    expect(code.notes).toBe('sem fundo');
  });

  it('params and values add up key by key (the case wins on the same key)', () => {
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

  it('a value without a case uses the base, without the variants key', () => {
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

  it('without a value: the field default; without a default, the base', () => {
    // `style` has default `filled` (no case): the base.
    expect(resolveCode(base, {}, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    expect(resolveCode(base, null, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    expect(resolveCode(base, undefined, fields).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    // Default with a case: uses the case.
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
    // Without default and without value: the base, even if a case exists.
    const noDefault = fields.map((f) => {
      if (f.key !== 'style' || f.type !== 'enum') return f;
      const copy = { ...f };
      delete copy.default;
      return copy;
    });
    expect(resolveCode(base, {}, noDefault).symbol).toBe(
      'androidx.compose.material3.Button',
    );
    // The annotation value wins over the default.
    expect(resolveCode(base, { style: 'text' }, withDefault).symbol).toBe(
      'androidx.compose.material3.TextButton',
    );
  });

  it('an entry without variants comes back the same (same reference)', () => {
    const plain: SpecCode = {
      symbol: 'Card',
      path: 'a/B.kt',
      params: { title: 'title' },
    };
    expect(resolveCode(plain, { style: 'outlined' }, fields)).toBe(plain);
    expect(resolveCode(plain, null, [])).toBe(plain);
  });

  it('the result never has variants and the original entry does not change', () => {
    const snapshot = JSON.stringify(base);
    for (const style of ['filled', 'outlined', 'text', 'tonal', 'missing', null]) {
      expect('variants' in resolveCode(base, { style }, fields)).toBe(false);
    }
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(base.variants).toBeDefined();
  });

  describe('with the case sheets (a case no longer inherits base params its sheet lacks)', () => {
    const sheet = (names: readonly string[]): Signature => ({
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'code',
        platform: 'compose',
        language: 'kotlin',
        symbol: 'B',
        path: 'a/B.kt',
        extractor: 'agent',
      },
      params: names.map((name) => ({ name, role: 'value' as const, type: 'String' })),
    });
    const sheets = (known: Record<string, Signature>): CaseSheets => ({
      read: (ref) => known[ref] ?? null,
    });
    const entry: SpecCode = {
      symbol: 'A',
      params: { title: 'title', subtitle: 'subtitle' },
      calls: { colors: 'A.colors' },
      variants: {
        field: 'style',
        cases: {
          center: { symbol: 'C', signature: 'c.json', params: { size: 'size' } },
          plain: { symbol: 'P' },
        },
      },
    };

    it('a case with its own sheet resolves without the base param its sheet lacks', () => {
      const code = resolveCode(
        entry,
        { style: 'center' },
        fields,
        sheets({ 'c.json': sheet(['title', 'size']) }),
      );
      expect(code.params).toEqual({ title: 'title', size: 'size' });
      expect(code.calls).toEqual({ colors: 'A.colors' });
    });

    it("the case's own entry stays even if its sheet lacks it", () => {
      const code = resolveCode(
        entry,
        { style: 'center' },
        fields,
        sheets({ 'c.json': sheet(['title']) }),
      );
      expect(code.params).toEqual({ title: 'title', size: 'size' });
    });

    it('a case that redeclares a base key keeps it even if its sheet lacks it', () => {
      const redeclared: SpecCode = {
        ...entry,
        variants: {
          field: 'style',
          cases: { center: { signature: 'c.json', params: { subtitle: 'subtitle' } } },
        },
      };
      const code = resolveCode(
        redeclared,
        { style: 'center' },
        fields,
        sheets({ 'c.json': sheet(['title']) }),
      );
      expect(code.params).toEqual({ title: 'title', subtitle: 'subtitle' });
    });

    it('a case without params also loses the inherited param its sheet lacks', () => {
      const bare: SpecCode = {
        ...entry,
        variants: { field: 'style', cases: { center: { signature: 'c.json' } } },
      };
      const code = resolveCode(
        bare,
        { style: 'center' },
        fields,
        sheets({ 'c.json': sheet(['title']) }),
      );
      expect(code.params).toEqual({ title: 'title' });
    });

    it('without sheets, with a case without its own sheet or with an unreadable one, the result equals the old one', () => {
      const old = resolveCode(entry, { style: 'center' }, fields);
      expect(old.params).toEqual({ title: 'title', subtitle: 'subtitle', size: 'size' });
      expect(resolveCode(entry, { style: 'center' }, fields, sheets({}))).toEqual(old);
      expect(
        resolveCode(entry, { style: 'plain' }, fields, sheets({ 'c.json': sheet([]) })),
      ).toEqual(resolveCode(entry, { style: 'plain' }, fields));
    });
  });
});
