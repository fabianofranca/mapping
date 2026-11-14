import { describe, expect, it } from 'vitest';
import {
  APPBAR_PATH,
  BUTTON_PATH,
  SWITCH_PATH,
  canonical,
  runReal,
  type Sig,
} from './support';

// Real androidx excerpts (commit 5113b82…) against the hand-written signatures
// (`tests/fixtures/signature/kotlin/*.expected.json`). Compares the bytes: key order matters.

describe('Button.kt (androidx): the hand-written expected signature', () => {
  const result = runReal('Button.kt', 'androidx.compose.material3.Button', BUTTON_PATH);

  it('exits with 0 and the output is the expected signature, byte by byte', () => {
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(canonical('Button.expected.json'));
  });

  it('all parameters, in source order, with role and type', () => {
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

  it('default, required and value (boolean with default, opaque without field)', () => {
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

  it('the buttonColors factory: the overload with the most parameters, no value on colors', () => {
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

  it('the doc: one @param per existing parameter and the factory ones as colors.<param>', () => {
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

  it('source: kind, platform, language, symbol, path, ref, extractor (no overload)', () => {
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

describe('Switch.kt (androidx): SwitchColors and the thumbContent slot', () => {
  const result = runReal('Switch.kt', 'Switch', SWITCH_PATH);

  it('the expected signature, byte by byte (the symbol becomes the full name through the package)', () => {
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(canonical('Switch.expected.json'));
  });

  it('thumbContent: (@Composable () -> Unit)? is a slot', () => {
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.params.find((p) => p.name === 'thumbContent')).toEqual({
      name: 'thumbContent',
      role: 'slot',
      type: '(@Composable () -> Unit)?',
      default: 'null',
    });
  });

  it('SwitchDefaults.colors: the 16-parameter overload, multi-line defaults in a single text', () => {
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

describe('AppBar.kt (androidx): the TopAppBar overloads', () => {
  const symbol = 'androidx.compose.material3.TopAppBar';

  it('--overload 2 (the one with subtitle): the expected signature, source.overload = 2', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '2']);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(canonical('AppBar.overload2.expected.json'));
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(2);
    expect(sig.params.map((p) => p.name)).toContain('subtitle');
  });

  it('without --overload: the @Deprecated(level = HIDDEN) is ignored and two remain: error listing the three', () => {
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

  it('--overload 1: the public one, with its KDoc (expandedHeight)', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '1']);
    expect(result.code).toBe(0);
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(1);
    expect(sig.params.map((p) => p.name)).not.toContain('subtitle');
    expect(sig.doc?.expandedHeight).toContain("this app bar's height");
  });

  it('--overload 0: the deprecated one chosen on purpose', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '0']);
    expect(result.code).toBe(0);
    const sig = JSON.parse(result.stdout) as Sig;
    expect(sig.source.overload).toBe(0);
    expect(sig.params.map((p) => p.name)).not.toContain('expandedHeight');
  });

  it('--overload 3: outside the list, the error shows the candidates', () => {
    const result = runReal('AppBar.kt', symbol, APPBAR_PATH, ['--overload', '3']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('is not in the list');
    expect(result.stderr.match(/^\s+\d+: line/gm)).toHaveLength(3);
  });
});
