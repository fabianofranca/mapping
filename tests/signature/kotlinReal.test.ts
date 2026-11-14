import { describe, expect, it } from 'vitest';
import {
  APPBAR_PATH,
  BUTTON_PATH,
  SWITCH_PATH,
  canonical,
  runReal,
  type Sig,
} from './support';

// Trechos reais do androidx (commit 5113b82…) contra as fichas escritas à mão
// (`tests/fixtures/signature/kotlin/*.expected.json`). Compara os bytes: a ordem das chaves conta.

describe('Button.kt (androidx): a ficha esperada à mão', () => {
  const result = runReal('Button.kt', 'androidx.compose.material3.Button', BUTTON_PATH);

  it('sai com 0 e a saída é a ficha esperada, byte a byte', () => {
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(canonical('Button.expected.json'));
  });

  it('todos os parâmetros, na ordem da fonte, com role e type', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.params.map((p) => [p.name, p.role, p.type])).toEqual([
      ['onClick', 'callback', '() -> Unit'],
      ['modifier', 'modifier', 'Modifier'],
      ['enabled', 'value', 'Boolean'],
      ['shape', 'value', 'Shape'],
      ['colors', 'value', 'ButtonColors'],
      ['elevation', 'value', 'ButtonElevation?'],
      ['border', 'value', 'BorderStroke?'],
      ['contentPadding', 'value', 'PaddingValues'],
      ['interactionSource', 'state', 'MutableInteractionSource?'],
      ['content', 'slot', '@Composable RowScope.() -> Unit'],
    ]);
  });

  it('default, required e value (boolean com padrão, opaque sem campo)', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    const by = Object.fromEntries(sig.params.map((p) => [p.name, p]));
    expect(by.onClick).toMatchObject({ required: true });
    expect(by.onClick?.default).toBeUndefined();
    expect(by.enabled).toMatchObject({
      default: 'true',
      value: { kind: 'boolean', default: true },
    });
    expect(by.shape).toMatchObject({
      default: 'ButtonDefaults.shape',
      value: { kind: 'opaque' },
    });
  });

  it('a fábrica de buttonColors: a sobrecarga com mais parâmetros, sem value no colors', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    const colors = sig.params.find((p) => p.name === 'colors');
    expect(colors?.value).toBeUndefined();
    expect(colors?.factory?.call).toBe(
      'androidx.compose.material3.ButtonDefaults.buttonColors',
    );
    expect(colors?.factory?.params.map((p) => p.name)).toEqual([
      'containerColor',
      'contentColor',
      'disabledContainerColor',
      'disabledContentColor',
    ]);
  });

  it('o doc: um @param por parâmetro que existe e os da fábrica como colors.<param>', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    expect(Object.keys(sig.doc ?? {})).toEqual([
      'onClick',
      'modifier',
      'enabled',
      'shape',
      'colors',
      'colors.containerColor',
      'colors.contentColor',
      'colors.disabledContainerColor',
      'colors.disabledContentColor',
      'elevation',
      'border',
      'contentPadding',
      'interactionSource',
      'content',
    ]);
    expect(sig.doc?.border).toBe(
      'the border to draw around the container of this button',
    );
  });

  it('source: kind, platform, language, symbol, path, ref, extractor (sem overload)', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source).toEqual({
      kind: 'code',
      platform: 'compose',
      language: 'kotlin',
      symbol: 'androidx.compose.material3.Button',
      path: BUTTON_PATH,
      ref: '5113b82a4ed6416d6344efa50e41db8cb65928ff',
      extractor: 'mapping-signature/kotlin@1',
    });
  });
});

describe('Switch.kt (androidx): SwitchColors e o slot thumbContent', () => {
  const result = runReal('Switch.kt', 'Switch', SWITCH_PATH);

  it('a ficha esperada, byte a byte (o symbol vira o nome completo pelo package)', () => {
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(canonical('Switch.expected.json'));
  });

  it('thumbContent: (@Composable () -> Unit)? é um slot', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.params.find((p) => p.name === 'thumbContent')).toEqual({
      name: 'thumbContent',
      role: 'slot',
      type: '(@Composable () -> Unit)?',
      default: 'null',
    });
  });

  it('SwitchDefaults.colors: a sobrecarga de 16 parâmetros, defaults de várias linhas num texto só', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    const colors = sig.params.find((p) => p.name === 'colors');
    expect(colors?.factory?.call).toBe(
      'androidx.compose.material3.SwitchDefaults.colors',
    );
    expect(colors?.factory?.params).toHaveLength(16);
    expect(colors?.factory?.params[8]?.default).toBe(
      'SwitchTokens.DisabledSelectedHandleColor.value.copy(alpha = SwitchTokens.DisabledSelectedHandleOpacity).compositeOver(MaterialTheme.colorScheme.surface)',
    );
  });
});

describe('AppBar.kt (androidx): as sobrecargas do TopAppBar', () => {
  const symbol = 'androidx.compose.material3.TopAppBar';

  it('--overload 2 (a com subtitle): a ficha esperada, source.overload = 2', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '2']);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(canonical('AppBar.overload2.expected.json'));
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(2);
    expect(sig.params.map((p) => p.name)).toContain('subtitle');
  });

  it('sem --overload: a @Deprecated(level = HIDDEN) é ignorada e ainda restam duas: erro listando as três', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('ambiguous overload:')).toBe(true);
    const lines = result.stderr.trimEnd().split('\n');
    const candidates = lines.filter((l) => /^\s+\d+: line \d+/.test(l));
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatch(/^\s+0: line \d+ \[@Deprecated\] \(title, modifier,/);
    expect(candidates[1]).toMatch(/^\s+1: line \d+ \(title, modifier, navigationIcon/);
    expect(candidates[2]).toMatch(/^\s+2: line \d+ \(title, subtitle, modifier,/);
    expect(result.stderr).toContain('--overload');
  });

  it('--overload 1: a pública, com o KDoc dela (expandedHeight)', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '1']);
    expect(result.code).toBe(0);
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(1);
    expect(sig.params.map((p) => p.name)).not.toContain('subtitle');
    expect(sig.doc?.expandedHeight).toContain("this app bar's height");
  });

  it('--overload 0: a deprecada escolhida de propósito', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '0']);
    expect(result.code).toBe(0);
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(0);
    expect(sig.params.map((p) => p.name)).not.toContain('expandedHeight');
  });

  it('--overload 3: fora da lista, o erro mostra as candidatas', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '3']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('is not in the list');
    expect(result.stderr.match(/^\s+\d+: line/gm)).toHaveLength(3);
  });
});
