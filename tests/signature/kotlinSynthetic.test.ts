import { describe, expect, it } from 'vitest';
import { composable, extract, extractJson, paramsOf, run } from './support';

// Synthetic cases of the Kotlin reader: a minimal in-memory `A.kt` per test.

describe('enum class of the same file becomes kind enum with options', () => {
  const enumSource = `package demo.ui

enum class Variant(val code: Int) {
    Filled(1),
    @Deprecated("old") Tonal(2) {
        override fun label(): String = "t, (x)"
    },
    Outlined(3);

    open fun label(): String = name
}

enum class Size { Small, Medium, Large }

@Composable
fun Chip(variant: Variant = Variant.Tonal, size: Size?, other: Missing = Missing.A) {}
`;

  it('options in declaration order (constants with arguments, body, annotation and ";")', () => {
    const sig = extractJson(enumSource, 'Chip');
    const by = Object.fromEntries(sig.params.map((p) => [p.name, p]));
    expect(by.variant?.value).toEqual({
      kind: 'enum',
      default: 'Tonal',
      options: ['Filled', 'Tonal', 'Outlined'],
    });
    expect(by.size?.value).toEqual({
      kind: 'enum',
      options: ['Small', 'Medium', 'Large'],
    });
    expect(by.size?.required).toBe(true);
  });

  it('unknown enum (from another file) is opaque and has no value.default', () => {
    const sig = extractJson(enumSource, 'Chip');
    expect(sig.params[2]?.value).toEqual({ kind: 'opaque' });
  });

  it('the enum of an --also counts', () => {
    const also = `package demo.other\n\nenum class Tone { Warm, Cold }\n`;
    const sig = extractJson(
      composable('tone: Tone = Tone.Cold'),
      'Foo',
      ['--also', 'B.kt'],
      { 'B.kt': also },
    );
    expect(sig.params[0]?.value).toEqual({
      kind: 'enum',
      default: 'Cold',
      options: ['Warm', 'Cold'],
    });
  });

  it('a default of another qualified constant that does not exist in the enum does not become value.default', () => {
    const sig = extractJson(
      `package p\nenum class E { A, B }\n@Composable\nfun Foo(e: E = E.Z) {}\n`,
      'Foo',
    );
    expect(sig.params[0]?.value).toEqual({ kind: 'enum', options: ['A', 'B'] });
  });
});

describe('overloads', () => {
  const overloads = `package demo.ui

@Deprecated("use the other", level = DeprecationLevel.HIDDEN)
@Composable
fun Card(title: String) {}

@Composable
fun Card(title: String, subtitle: String = "") {}
`;

  it('the @Deprecated is ignored: with one left, it is that one, without source.overload', () => {
    const sig = extractJson(overloads, 'Card');
    expect(sig.params.map((p) => p.name)).toEqual(['title', 'subtitle']);
    expect(sig.source).not.toHaveProperty('overload');
  });

  it('the same-named function without @Composable does not count', () => {
    const sig = extractJson(
      `package p\nfun Card(a: Int) {}\n@Composable fun Card(b: Int) {}\n`,
      'Card',
    );
    expect(sig.params.map((p) => p.name)).toEqual(['b']);
  });

  it('two remaining without --overload: "ambiguous overload:" error with one candidate per line', () => {
    const source = `package demo.ui

@Composable
fun Card(title: String) {}

@Deprecated("x")
@Composable
fun Card(a: Int, b: Int) {}

@Composable fun Card(title: String, onClick: () -> Unit) {}
`;
    const result = extract(source, 'Card');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^ambiguous overload:/);
    expect(result.stderr.trimEnd().split('\n').slice(1)).toEqual([
      '  0: line 4 (title)',
      '  1: line 8 [@Deprecated] (a, b)',
      '  2: line 10 (title, onClick)',
    ]);
  });

  it('--overload n picks the n-th of the complete list (deprecated included) and writes source.overload', () => {
    const sig = extractJson(overloads, 'Card', ['--overload', '0']);
    expect(sig.params.map((p) => p.name)).toEqual(['title']);
    expect(sig.source.overload).toBe(0);
    const second = extractJson(overloads, 'Card', ['--overload', '1']);
    expect(second.params.map((p) => p.name)).toEqual(['title', 'subtitle']);
    expect(second.source.overload).toBe(1);
  });

  it('--overload outside the list: error with the list', () => {
    const result = extract(overloads, 'Card', ['--overload', '5']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--overload 5');
    expect(result.stderr).toContain('is not in the list');
    expect(result.stderr).toContain('  0: line 5 [@Deprecated] (title)');
    expect(result.stderr).toContain('  1: line 8 (title, subtitle)');
  });

  it('invalid --overload (not an integer, negative) is a usage error', () => {
    for (const bad of ['x', '-1', '1.5', '']) {
      const result = extract(overloads, 'Card', ['--overload', bad]);
      expect(result.code, bad).toBe(2);
    }
  });

  it('only deprecated ones and no --overload: ambiguous error (none remaining)', () => {
    const result = extract(
      `package p\n@Deprecated("x")\n@Composable\nfun Old(a: Int) {}\n`,
      'Old',
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^ambiguous overload:/);
    expect(result.stderr).toContain('  0: line 4 [@Deprecated] (a)');
  });

  it('missing symbol: "@Composable function <name> not found in <file>"', () => {
    const result = extract(composable('a: Int'), 'Nothing');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('@Composable function Nothing not found in A.kt');
  });

  it('a function without @Composable is not a candidate (missing symbol)', () => {
    const result = extract(`package p\nfun Plain(a: Int) {}\n`, 'Plain');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('@Composable function Plain not found');
  });
});

describe('syntax error with file:line:column (of the opener)', () => {
  const cases: [string, string, string][] = [
    [
      'unclosed parenthesis',
      `package p\n\n@Composable\nfun Foo(a: Int,\n  b: Int\n`,
      'A.kt:4:8:',
    ],
    [
      'unterminated string',
      `package p\nval s = "abc\n@Composable fun Foo() {}\n`,
      'A.kt:2:9:',
    ],
    [
      'unterminated comment',
      `package p\n\n  /* never closes\nfun x() {}\n`,
      'A.kt:3:3:',
    ],
    ['unclosed brace', `package p\nclass X {\n  fun y() {\n}\n`, 'A.kt:2:9:'],
    ['closing bracket without opening', `package p\nval a = 1 ]\n`, 'A.kt:2:11:'],
    ['closing of the wrong kind', `package p\nval a = (1]\n`, 'A.kt:2:11:'],
    ['unterminated raw string', `package p\nval a = """abc\n`, 'A.kt:2:9:'],
    ['unterminated character', `package p\nval c = 'a\n`, 'A.kt:2:9:'],
  ];

  it.each(cases)('%s', (_name, source, prefix) => {
    const result = extract(source, 'Foo');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(prefix)).toBe(true);
    expect(result.stderr).toMatch(/^A\.kt:\d+:\d+: \S/);
  });

  it('the error of an --also cites its own file', () => {
    const result = extract(composable('a: Int'), 'Foo', ['--also', 'B.kt'], {
      'B.kt': 'package q\nobject O {\n',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^B\.kt:2:10: /);
  });
});

describe('parameters: text, role and value', () => {
  it('generics become opaque and the comma of the generic does not separate parameters', () => {
    const by = paramsOf(
      'items: List<String> = emptyList(), map: Map<String, List<Int>>, last: Int',
    );
    expect(by.items).toMatchObject({
      role: 'value',
      type: 'List<String>',
      default: 'emptyList()',
      value: { kind: 'opaque' },
    });
    expect(by.map).toMatchObject({
      type: 'Map<String, List<Int>>',
      required: true,
      value: { kind: 'opaque' },
    });
    expect(by.last?.value).toEqual({ kind: 'integer' });
  });

  it('vararg: role other, type "vararg T", without value', () => {
    const by = paramsOf('vararg tags: String, last: Int = 0');
    expect(by.tags).toEqual({
      name: 'tags',
      role: 'other',
      type: 'vararg String',
      required: true,
    });
  });

  it('lambdas with receiver: with @Composable is slot; without, callback; nullable likewise', () => {
    const by = paramsOf(
      [
        'a: @Composable RowScope.() -> Unit',
        'b: RowScope.() -> Unit',
        'c: (RowScope.() -> Unit)?',
        'd: (@Composable RowScope.() -> Unit)? = null',
        'e: (Int, String) -> Unit',
        'f: suspend () -> Unit',
        'g: List<() -> Unit>',
      ].join(', '),
    );
    expect(by.a).toMatchObject({ role: 'slot', type: '@Composable RowScope.() -> Unit' });
    expect(by.b).toMatchObject({ role: 'callback', type: 'RowScope.() -> Unit' });
    expect(by.c).toMatchObject({ role: 'callback', type: '(RowScope.() -> Unit)?' });
    expect(by.d).toMatchObject({ role: 'slot', default: 'null' });
    expect(by.e).toMatchObject({ role: 'callback', type: '(Int, String) -> Unit' });
    expect(by.f?.role).toBe('callback');
    expect(by.g).toMatchObject({ role: 'value', value: { kind: 'opaque' } });
    for (const p of Object.values(by).slice(0, 5)) expect(p.value).toBeUndefined();
  });

  it('default with braces and commas inside it', () => {
    const by = paramsOf(
      'navigationIcon: @Composable () -> Unit = {}, actions: @Composable () -> Unit = { Text("a, b"); foo(1, 2) }, z: Int = 1',
    );
    expect(by.navigationIcon).toMatchObject({ role: 'slot', default: '{}' });
    expect(by.actions?.default).toBe('{ Text("a, b"); foo(1, 2) }');
    expect(by.z?.value).toEqual({ kind: 'integer', default: 1 });
  });

  it('strings with parentheses, commas and $ (including nested ${…} and raw string)', () => {
    const by = paramsOf(
      [
        'a: String = "x, (y) \\" z"',
        'b: String = "cost: \\$5"',
        'c: String = "v${foo(1, "q)")}w"',
        'd: String = """raw ) , "quoted" $x"""',
        'e: Int = 1',
      ].join(', '),
    );
    expect(by.a?.default).toBe('"x, (y) \\" z"');
    expect(by.c?.default).toBe('"v${foo(1, "q)")}w"');
    expect(by.d?.default).toBe('"""raw ) , "quoted" $x"""');
    expect(by.e?.name).toBe('e');
    // a default with `$` or an escape is not a simple literal: only the text stays
    for (const name of ['a', 'b', 'c', 'd'])
      expect(by[name]?.value).toEqual({ kind: 'text' });
  });

  it('comments inside the parameter list do not count', () => {
    const sig = extractJson(
      `package p

@Composable
fun Foo(
    // a, b (
    a: Int, /* x, ) */ b: String = "k", // end, of, line
    /** doc of c, d */
    c: Boolean = true, // c
) {}
`,
      'Foo',
    );
    expect(sig.params.map((p) => [p.name, p.type, p.default])).toEqual([
      ['a', 'Int', undefined],
      ['b', 'String', '"k"'],
      ['c', 'Boolean', 'true'],
    ]);
  });

  it('trailing comma, nullables and the ? do not change the kind', () => {
    const by = paramsOf('a: String?, b: Boolean? = null, c: Int?,');
    expect(by.a).toMatchObject({
      type: 'String?',
      required: true,
      value: { kind: 'text' },
    });
    expect(by.b).toMatchObject({ default: 'null', value: { kind: 'boolean' } });
    expect(by.b?.value?.default).toBeUndefined();
    expect(by.c?.value).toEqual({ kind: 'integer' });
  });

  it('the kind of each known type; the rest are opaque', () => {
    const kinds: [string, string][] = [
      ['String', 'text'],
      ['AnnotatedString', 'text'],
      ['Boolean', 'boolean'],
      ['Int', 'integer'],
      ['Long', 'integer'],
      ['Short', 'integer'],
      ['Byte', 'integer'],
      ['Float', 'number'],
      ['Double', 'number'],
      ['Dp', 'dimension'],
      ['Color', 'color'],
      ['Shape', 'opaque'],
      ['PaddingValues', 'opaque'],
      ['BorderStroke', 'opaque'],
      ['TextUnit', 'opaque'],
      ['WindowInsets', 'opaque'],
      ['TextStyle', 'opaque'],
    ];
    const by = paramsOf(kinds.map(([t], i) => `p${i}: ${t}`).join(', '));
    kinds.forEach(([t, kind], i) => {
      expect(by[`p${i}`]?.value, t).toEqual({ kind });
    });
  });

  it('value.default only for a representable literal', () => {
    const literals: [string, string, string | number | boolean | undefined][] = [
      ['Boolean', 'true', true],
      ['Boolean', 'false', false],
      ['String', '"OK"', 'OK'],
      ['String', '""', ''],
      ['Int', '3', 3],
      ['Int', '1_000', 1000],
      ['Long', '10L', 10],
      ['Int', '-2', -2],
      ['Float', '0.5f', 0.5],
      ['Double', '1.0', 1],
      ['Float', '2', 2],
      ['Dp', '16.dp', 16],
      ['Dp', '16.0.dp', 16],
      ['Dp', '0.5.dp', 0.5],
      ['Int', 'DEFAULT', undefined],
      ['Color', 'Color.Red', undefined],
      ['Shape', 'ButtonDefaults.shape', undefined],
      ['String', 'stringResource(R.string.ok)', undefined],
      ['Boolean', 'enabledByDefault', undefined],
      ['Int', 'null', undefined],
    ];
    const by = paramsOf(literals.map(([t, d], i) => `p${i}: ${t} = ${d}`).join(', '));
    literals.forEach(([t, d, expected], i) => {
      expect(by[`p${i}`]?.value?.default, `${t} = ${d}`).toBe(expected);
      expect(by[`p${i}`]?.default, `${t} = ${d}`).toBe(d);
    });
  });

  it('Enum.CONSTANT of an enum in the file becomes value.default', () => {
    const sig = extractJson(
      `package p\nenum class Kind { Plain, Fancy }\n@Composable\nfun Foo(k: Kind = Kind.Fancy, j: Kind = DefaultKind) {}\n`,
      'Foo',
    );
    expect(sig.params[0]?.value?.default).toBe('Fancy');
    expect(sig.params[1]?.value?.default).toBeUndefined();
    expect(sig.params[1]?.default).toBe('DefaultKind');
  });

  it('role: Modifier, states and the rest', () => {
    const by = paramsOf(
      [
        'm: Modifier = Modifier',
        'm2: Modifier?',
        'i: InteractionSource',
        'mi: MutableInteractionSource? = null',
        's: State<Int>',
        'f: FocusRequester? = null',
        'b: TopAppBarScrollBehavior? = null',
        'x: Anything',
      ].join(', '),
    );
    expect(by.m?.role).toBe('modifier');
    expect(by.m2?.role).toBe('modifier');
    expect(by.i?.role).toBe('state');
    expect(by.mi?.role).toBe('state');
    expect(by.s?.role).toBe('state');
    expect(by.f?.role).toBe('state');
    expect(by.b?.role).toBe('state');
    expect(by.x).toMatchObject({ role: 'value', value: { kind: 'opaque' } });
    for (const n of ['m', 'm2', 'i', 'mi', 's', 'f', 'b'])
      expect(by[n]?.value).toBeUndefined();
  });

  it('the parameter own annotation: the text stays at the start of type and the value is opaque', () => {
    const by = paramsOf(
      '@FloatRange(from = 0.0, to = 1.0) alpha: Float = 1f, @StringRes val label: Int, noinline cb: () -> Unit',
    );
    expect(by.alpha).toMatchObject({
      role: 'value',
      type: '@FloatRange(from = 0.0, to = 1.0) Float',
      default: '1f',
      value: { kind: 'opaque' },
    });
    expect(by.label).toMatchObject({ type: '@StringRes Int', value: { kind: 'opaque' } });
    expect(by.cb).toMatchObject({ role: 'callback', type: '() -> Unit' });
  });

  it('spaces and line breaks of the type and the default are normalized', () => {
    const by = paramsOf(
      `a:   Map<
        String,
        Int
      >   =  mapOf(
        "k" to 1,
      ),
      b : Int=3`,
    );
    expect(by.a?.type).toBe('Map<String, Int>');
    expect(by.a?.default).toBe('mapOf("k" to 1,)');
    expect(by.b).toMatchObject({ type: 'Int', default: '3' });
  });
});

describe('candidates', () => {
  it('@Composable on another line, after other annotations, with generics and receiver', () => {
    const source = `package p

@Suppress("x")
@Composable
@OptIn(ExperimentalApi::class)
internal fun <T> RowScope.Foo(item: T, onPick: (T) -> Unit) {}
`;
    const sig = extractJson(source, 'Foo');
    expect(sig.params.map((p) => p.name)).toEqual(['item', 'onPick']);
    expect(sig.params[0]).toMatchObject({
      type: 'T',
      role: 'value',
      value: { kind: 'opaque' },
    });
  });

  it('@Composable in the type of a parameter does not make a candidate (the function is not composable)', () => {
    const result = extract(
      `package p\nfun Host(content: @Composable () -> Unit) {}\n`,
      'Host',
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('@Composable function Host not found');
  });

  it('@Composable on the same line and with a qualified name', () => {
    const sig = extractJson(
      `package p\n@Composable fun A(x: Int) = Unit\n@androidx.compose.runtime.Composable fun B(y: Int) = Unit\n`,
      'B',
    );
    expect(sig.params.map((p) => p.name)).toEqual(['y']);
  });

  it('the KDoc only counts if attached to the declaration and only for parameters that exist', () => {
    const source = `package p

/**
 * First.
 * @param a the first
 *   that continues here
 * @param ghost does not exist
 * @return nothing
 */
@Composable
fun Foo(a: Int, b: Int) {}

@Composable
fun Bar(a: Int) {}
`;
    const foo = extractJson(source, 'Foo');
    expect(foo.doc).toEqual({ a: 'the first that continues here' });
    const bar = extractJson(source, 'Bar');
    expect(bar.doc).toBeUndefined();
  });
});

describe('factories (factory)', () => {
  const colorsSource = (extra = '') => `package demo.ui

@Composable
fun Foo(colors: Colors = FooDefaults.colors(), shape: Shape = FooDefaults.shape) {}

object FooDefaults {
    val shape: Shape = RoundedCornerShape(4.dp)

    /** no parameters. */
    @Composable fun colors() = Colors()

    /**
     * With everything.
     * @param container the container color
     * @param content the content color
     * @param ghost does not exist
     */
    @Composable
    fun colors(
        container: Color = Color.Unspecified,
        content: Color = Color.Unspecified,
        inner: Inner = Inner.make(),
    ): Colors = Colors()
${extra}
}
`;

  it('the overload with the most parameters; params without a factory inside; doc as colors.<param>', () => {
    const sig = extractJson(colorsSource(), 'Foo');
    const colors = sig.params[0];
    expect(colors?.factory?.call).toBe('demo.ui.FooDefaults.colors');
    expect(colors?.factory?.params.map((p) => p.name)).toEqual([
      'container',
      'content',
      'inner',
    ]);
    expect(colors?.factory?.params[2]).toMatchObject({ default: 'Inner.make()' });
    expect(colors?.factory?.params[2]).not.toHaveProperty('factory');
    expect(colors?.value).toBeUndefined();
    expect(sig.doc).toEqual({
      'colors.container': 'the container color',
      'colors.content': 'the content color',
    });
    // a default without parentheses (`FooDefaults.shape`) is not a factory
    expect(sig.params[1]).toMatchObject({ value: { kind: 'opaque' } });
    expect(sig.params[1]).not.toHaveProperty('factory');
  });

  it('the @Deprecated ones are discarded, even with more parameters', () => {
    const sig = extractJson(
      colorsSource(`
    @Deprecated("old")
    @Composable
    fun colors(a: Color, b: Color, c: Color, d: Color): Colors = Colors()`),
      'Foo',
    );
    expect(sig.params[0]?.factory?.params.map((p) => p.name)).toEqual([
      'container',
      'content',
      'inner',
    ]);
  });

  it('tie in the number of parameters: the first one', () => {
    const source = `package p
@Composable
fun Foo(c: C = D.make()) {}
object D {
    fun make(first: Int = 1): C = C()
    fun make(second: Int = 2): C = C()
}
`;
    expect(extractJson(source, 'Foo').params[0]?.factory?.params[0]?.name).toBe('first');
  });

  it('factory without parameters or missing object: no factory (the value stays)', () => {
    const sig = extractJson(
      `package p
@Composable
fun Foo(a: A = D.make(), b: B = Elsewhere.make()) {}
object D { fun make(): A = A() }
`,
      'Foo',
    );
    expect(sig.params[0]).not.toHaveProperty('factory');
    expect(sig.params[1]).not.toHaveProperty('factory');
    expect(sig.params[0]?.value).toEqual({ kind: 'opaque' });
  });

  it('--also: the factory in another file uses its own package in call', () => {
    const also = `package demo.defaults

object Elsewhere {
    /** @param tint the color */
    fun make(tint: Color = Color.Red): B = B()
}
`;
    const sig = extractJson(
      `package demo.ui\n@Composable\nfun Foo(b: B = Elsewhere.make()) {}\n`,
      'Foo',
      ['--also', 'B.kt'],
      { 'B.kt': also },
    );
    expect(sig.params[0]?.factory).toEqual({
      call: 'demo.defaults.Elsewhere.make',
      params: [
        {
          name: 'tint',
          role: 'value',
          type: 'Color',
          default: 'Color.Red',
          value: { kind: 'color' },
        },
      ],
    });
    expect(sig.doc).toEqual({ 'b.tint': 'the color' });
  });

  it('nested members and function bodies do not become factories', () => {
    const sig = extractJson(
      `package p
@Composable
fun Foo(a: A = D.make()) {}
object D {
    fun helper() { fun make(x: Int) = x }
    fun make(real: Int = 0): A = A()
}
`,
      'Foo',
    );
    expect(sig.params[0]?.factory?.params.map((p) => p.name)).toEqual(['real']);
  });
});

describe('--symbol, --path, --ref', () => {
  const source = composable('a: Int');

  it('a full --symbol with the file package works; source.symbol is always the full name', () => {
    expect(extractJson(source, 'demo.ui.Foo').source.symbol).toBe('demo.ui.Foo');
    expect(extractJson(source, 'Foo').source.symbol).toBe('demo.ui.Foo');
  });

  it('a full --symbol with a different package: error', () => {
    const result = extract(source, 'other.pkg.Foo');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('other.pkg');
    expect(result.stderr).toContain('demo.ui');
  });

  it('file without a package: source.symbol is just the name', () => {
    const sig = extractJson(`@Composable\nfun Foo(a: Int) {}\n`, 'Foo');
    expect(sig.source.symbol).toBe('Foo');
    expect(extract(`@Composable\nfun Foo(a: Int) {}\n`, 'x.Foo').code).toBe(1);
  });

  it('without --path, the relative --file is used (/ separators, no leading ./)', () => {
    const sig = extractJson(source, 'Foo');
    expect(sig.source.path).toBe('A.kt');
    const nested = run2('./ui\\Foo.kt');
    expect(nested.source.path).toBe('ui/Foo.kt');
  });

  it('without --path and with an absolute --file: usage error asking for --path', () => {
    const result = run3('/abs/dir/A.kt');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--path');
    expect(result.stderr).toContain('repository root');
  });

  it('--path is valid even with an absolute --file', () => {
    const result = run3('/abs/dir/A.kt', ['--path', 'ui/A.kt']);
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as { source: { path: string } }).source.path).toBe(
      'ui/A.kt',
    );
  });

  it('--ref goes in source.ref; without it the key does not exist', () => {
    expect(extractJson(source, 'Foo', ['--ref', 'v1.2.3']).source.ref).toBe('v1.2.3');
    expect(extractJson(source, 'Foo').source).not.toHaveProperty('ref');
  });

  it('an unreadable file is an extraction error (exit 1)', () => {
    const result = extract(source, 'Foo', ['--also', 'does-not-exist.kt']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('does-not-exist.kt');
  });
});

function run2(file: string): { source: { path: string } } {
  const result = run(['kotlin', '--file', file, '--symbol', 'Foo'], {
    [file]: composable('a: Int'),
  });
  if (result.code !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as { source: { path: string } };
}

function run3(file: string, flags: readonly string[] = []): ReturnType<typeof run> {
  return run(['kotlin', '--file', file, '--symbol', 'Foo', ...flags], {
    [file]: composable('a: Int'),
  });
}

describe('review: qualified annotation, whole factory, function type in parentheses', () => {
  it('qualified annotation: @androidx.compose.runtime.Composable becomes slot', () => {
    const p = paramsOf('content: @androidx.compose.runtime.Composable () -> Unit');
    expect(p.content?.role).toBe('slot');
  });

  it('@Composable (() -> Unit)? = null is slot', () => {
    const p = paramsOf('content: @Composable (() -> Unit)? = null');
    expect(p.content?.role).toBe('slot');
  });

  it('Object.factory(...).copy(...) is not a factory (the default stays as text)', () => {
    const source = `package p
object FDefaults {
    fun colors(a: Int = 0, b: Int = 1): Colors = Colors()
}
@Composable
fun Foo(colors: Colors = FDefaults.colors().copy(a = 1), plain: Colors = FDefaults.colors(a = 2)) {}
`;
    const sig = extractJson(source, 'Foo');
    expect(sig.params[0]?.factory).toBeUndefined();
    expect(sig.params[0]?.default).toBe('FDefaults.colors().copy(a = 1)');
    expect(sig.params[1]?.factory?.call).toBe('p.FDefaults.colors');
  });

  it('a sibling overload with a malformed list does not break when --overload picks the good one', () => {
    const source = `package p
@Composable
fun Foo(a: Int) {}
@Composable
fun Foo(b Int) {}
`;
    const sig = extractJson(source, 'Foo', ['--overload', '0']);
    expect(sig.params[0]?.name).toBe('a');
  });

  it('a malformed overload next to a single non-deprecated one does not break', () => {
    const source = `package p
@Deprecated("x")
@Composable
fun Foo(b Int) {}
@Composable
fun Foo(a: Int) {}
`;
    const sig = extractJson(source, 'Foo');
    expect(sig.params[0]?.name).toBe('a');
  });

  it('enum class whose name ends in State is enum, not state', () => {
    const source = `package p
enum class ToggleState { On, Off }
@Composable
fun Foo(s: ToggleState = ToggleState.On, t: OtherState) {}
`;
    const sig = extractJson(source, 'Foo');
    expect(sig.params[0]?.role).toBe('value');
    expect(sig.params[0]?.value).toEqual({
      kind: 'enum',
      default: 'On',
      options: ['On', 'Off'],
    });
    expect(sig.params[1]?.role).toBe('state');
  });
});

describe('CL2 R-3: parameter name with backticks', () => {
  it('`object`: String becomes the parameter object (without the backticks), like the function name', () => {
    const sig = extractJson(composable('`object`: String, label: String'), 'Foo');
    expect(sig.params.map((p) => p.name)).toEqual(['object', 'label']);
  });
});
