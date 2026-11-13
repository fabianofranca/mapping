import { describe, expect, it } from 'vitest';
import { composable, extract, extractJson, paramsOf, run } from './support';

// Casos sintéticos do leitor Kotlin: um `A.kt` mínimo em memória por teste.

describe('enum class do mesmo arquivo vira kind enum com options', () => {
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

  it('options na ordem da declaração (constantes com argumentos, corpo, anotação e ";")', () => {
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

  it('enum desconhecido (de outro arquivo) é opaque e não tem value.default', () => {
    const sig = extractJson(enumSource, 'Chip');
    expect(sig.params[2]?.value).toEqual({ kind: 'opaque' });
  });

  it('o enum de um --also conta', () => {
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

  it('padrão de outra constante qualificada que não existe no enum não vira value.default', () => {
    const sig = extractJson(
      `package p\nenum class E { A, B }\n@Composable\nfun Foo(e: E = E.Z) {}\n`,
      'Foo',
    );
    expect(sig.params[0]?.value).toEqual({ kind: 'enum', options: ['A', 'B'] });
  });
});

describe('sobrecargas', () => {
  const overloads = `package demo.ui

@Deprecated("use the other", level = DeprecationLevel.HIDDEN)
@Composable
fun Card(title: String) {}

@Composable
fun Card(title: String, subtitle: String = "") {}
`;

  it('a @Deprecated é ignorada: sobrando uma, é ela, sem source.overload', () => {
    const sig = extractJson(overloads, 'Card');
    expect(sig.params.map((p) => p.name)).toEqual(['title', 'subtitle']);
    expect(sig.source).not.toHaveProperty('overload');
  });

  it('a função de mesmo nome sem @Composable não conta', () => {
    const sig = extractJson(
      `package p\nfun Card(a: Int) {}\n@Composable fun Card(b: Int) {}\n`,
      'Card',
    );
    expect(sig.params.map((p) => p.name)).toEqual(['b']);
  });

  it('duas restantes sem --overload: erro "sobrecarga ambígua:" com uma candidata por linha', () => {
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
    expect(result.stderr).toMatch(/^sobrecarga ambígua:/);
    expect(result.stderr.trimEnd().split('\n').slice(1)).toEqual([
      '  0: linha 4 (title)',
      '  1: linha 8 [@Deprecated] (a, b)',
      '  2: linha 10 (title, onClick)',
    ]);
  });

  it('--overload n escolhe a n-ésima da lista completa (deprecada inclusive) e grava source.overload', () => {
    const sig = extractJson(overloads, 'Card', ['--overload', '0']);
    expect(sig.params.map((p) => p.name)).toEqual(['title']);
    expect(sig.source.overload).toBe(0);
    const second = extractJson(overloads, 'Card', ['--overload', '1']);
    expect(second.params.map((p) => p.name)).toEqual(['title', 'subtitle']);
    expect(second.source.overload).toBe(1);
  });

  it('--overload fora da lista: erro com a lista', () => {
    const result = extract(overloads, 'Card', ['--overload', '5']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--overload 5');
    expect(result.stderr).toContain('fora da lista');
    expect(result.stderr).toContain('  0: linha 5 [@Deprecated] (title)');
    expect(result.stderr).toContain('  1: linha 8 (title, subtitle)');
  });

  it('--overload inválido (não inteiro, negativo) é erro de uso', () => {
    for (const bad of ['x', '-1', '1.5', '']) {
      const result = extract(overloads, 'Card', ['--overload', bad]);
      expect(result.code, bad).toBe(2);
    }
  });

  it('só deprecadas e sem --overload: erro ambíguo (nenhuma restante)', () => {
    const result = extract(
      `package p\n@Deprecated("x")\n@Composable\nfun Old(a: Int) {}\n`,
      'Old',
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^sobrecarga ambígua:/);
    expect(result.stderr).toContain('  0: linha 4 [@Deprecated] (a)');
  });

  it('símbolo ausente: "função @Composable <nome> não encontrada em <arquivo>"', () => {
    const result = extract(composable('a: Int'), 'Nada');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('função @Composable Nada não encontrada em A.kt');
  });

  it('uma função sem @Composable não é candidata (símbolo ausente)', () => {
    const result = extract(`package p\nfun Plain(a: Int) {}\n`, 'Plain');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('função @Composable Plain não encontrada');
  });
});

describe('erro de sintaxe com arquivo:linha:coluna (do abridor)', () => {
  const cases: [string, string, string][] = [
    [
      'parêntese não fechado',
      `package p\n\n@Composable\nfun Foo(a: Int,\n  b: Int\n`,
      'A.kt:4:8:',
    ],
    [
      'string não terminada',
      `package p\nval s = "abc\n@Composable fun Foo() {}\n`,
      'A.kt:2:9:',
    ],
    [
      'comentário não terminado',
      `package p\n\n  /* nunca fecha\nfun x() {}\n`,
      'A.kt:3:3:',
    ],
    ['chave não fechada', `package p\nclass X {\n  fun y() {\n}\n`, 'A.kt:2:9:'],
    ['colchete fechado sem abrir', `package p\nval a = 1 ]\n`, 'A.kt:2:11:'],
    ['fechamento do tipo errado', `package p\nval a = (1]\n`, 'A.kt:2:11:'],
    ['raw string não terminada', `package p\nval a = """abc\n`, 'A.kt:2:9:'],
    ['caractere não terminado', `package p\nval c = 'a\n`, 'A.kt:2:9:'],
  ];

  it.each(cases)('%s', (_name, source, prefix) => {
    const result = extract(source, 'Foo');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(prefix)).toBe(true);
    expect(result.stderr).toMatch(/^A\.kt:\d+:\d+: \S/);
  });

  it('o erro de um --also cita o arquivo dele', () => {
    const result = extract(composable('a: Int'), 'Foo', ['--also', 'B.kt'], {
      'B.kt': 'package q\nobject O {\n',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^B\.kt:2:10: /);
  });
});

describe('parâmetros: texto, role e value', () => {
  it('genéricos viram opaque e a vírgula do genérico não separa parâmetros', () => {
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

  it('vararg: role other, type "vararg T", sem value', () => {
    const by = paramsOf('vararg tags: String, last: Int = 0');
    expect(by.tags).toEqual({
      name: 'tags',
      role: 'other',
      type: 'vararg String',
      required: true,
    });
  });

  it('lambdas com receptor: com @Composable é slot; sem, callback; anulável idem', () => {
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

  it('padrão com chaves e vírgulas dentro dele', () => {
    const by = paramsOf(
      'navigationIcon: @Composable () -> Unit = {}, actions: @Composable () -> Unit = { Text("a, b"); foo(1, 2) }, z: Int = 1',
    );
    expect(by.navigationIcon).toMatchObject({ role: 'slot', default: '{}' });
    expect(by.actions?.default).toBe('{ Text("a, b"); foo(1, 2) }');
    expect(by.z?.value).toEqual({ kind: 'integer', default: 1 });
  });

  it('strings com parênteses, vírgulas e $ (inclusive ${…} aninhado e raw string)', () => {
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
    // padrão com `$` ou escape não é literal simples: só o texto fica
    for (const name of ['a', 'b', 'c', 'd'])
      expect(by[name]?.value).toEqual({ kind: 'text' });
  });

  it('comentários dentro da lista de parâmetros não contam', () => {
    const sig = extractJson(
      `package p

@Composable
fun Foo(
    // a, b (
    a: Int, /* x, ) */ b: String = "k", // fim, de, linha
    /** doc de c, d */
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

  it('vírgula final, anuláveis e o ? não muda o kind', () => {
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

  it('o kind de cada tipo conhecido; os demais são opaque', () => {
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

  it('value.default só para literal representável', () => {
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

  it('Enum.CONSTANTE de enum do arquivo vira value.default', () => {
    const sig = extractJson(
      `package p\nenum class Kind { Plain, Fancy }\n@Composable\nfun Foo(k: Kind = Kind.Fancy, j: Kind = DefaultKind) {}\n`,
      'Foo',
    );
    expect(sig.params[0]?.value?.default).toBe('Fancy');
    expect(sig.params[1]?.value?.default).toBeUndefined();
    expect(sig.params[1]?.default).toBe('DefaultKind');
  });

  it('role: Modifier, estados e o resto', () => {
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

  it('anotação própria do parâmetro: o texto fica no começo de type e o value é opaque', () => {
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

  it('espaços e quebras de linha do tipo e do padrão são normalizados', () => {
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

describe('candidatas', () => {
  it('@Composable em outra linha, depois de outras anotações, com genéricos e receptor', () => {
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

  it('@Composable no tipo de um parâmetro não faz candidata (a função não é composable)', () => {
    const result = extract(
      `package p\nfun Host(content: @Composable () -> Unit) {}\n`,
      'Host',
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('função @Composable Host não encontrada');
  });

  it('@Composable na mesma linha e com nome qualificado', () => {
    const sig = extractJson(
      `package p\n@Composable fun A(x: Int) = Unit\n@androidx.compose.runtime.Composable fun B(y: Int) = Unit\n`,
      'B',
    );
    expect(sig.params.map((p) => p.name)).toEqual(['y']);
  });

  it('o KDoc só vale se vier colado à declaração e só para parâmetros que existem', () => {
    const source = `package p

/**
 * Primeira.
 * @param a o primeiro
 *   que continua aqui
 * @param fantasma não existe
 * @return nada
 */
@Composable
fun Foo(a: Int, b: Int) {}

@Composable
fun Bar(a: Int) {}
`;
    const foo = extractJson(source, 'Foo');
    expect(foo.doc).toEqual({ a: 'o primeiro que continua aqui' });
    const bar = extractJson(source, 'Bar');
    expect(bar.doc).toBeUndefined();
  });
});

describe('fábricas (factory)', () => {
  const colorsSource = (extra = '') => `package demo.ui

@Composable
fun Foo(colors: Colors = FooDefaults.colors(), shape: Shape = FooDefaults.shape) {}

object FooDefaults {
    val shape: Shape = RoundedCornerShape(4.dp)

    /** sem parâmetros. */
    @Composable fun colors() = Colors()

    /**
     * Com tudo.
     * @param container a cor do container
     * @param content a cor do conteúdo
     * @param ghost não existe
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

  it('a sobrecarga de mais parâmetros; params sem factory dentro; doc como colors.<param>', () => {
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
      'colors.container': 'a cor do container',
      'colors.content': 'a cor do conteúdo',
    });
    // um padrão sem parênteses (`FooDefaults.shape`) não é fábrica
    expect(sig.params[1]).toMatchObject({ value: { kind: 'opaque' } });
    expect(sig.params[1]).not.toHaveProperty('factory');
  });

  it('as @Deprecated são descartadas, mesmo com mais parâmetros', () => {
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

  it('empate no número de parâmetros: a primeira', () => {
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

  it('fábrica sem parâmetros ou objeto ausente: sem factory (o value continua)', () => {
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

  it('--also: a fábrica em outro arquivo usa o package dele em call', () => {
    const also = `package demo.defaults

object Elsewhere {
    /** @param tint a cor */
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
    expect(sig.doc).toEqual({ 'b.tint': 'a cor' });
  });

  it('membros aninhados e corpos de função não viram fábrica', () => {
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

  it('--symbol completo com o package do arquivo funciona; source.symbol é sempre o nome completo', () => {
    expect(extractJson(source, 'demo.ui.Foo').source.symbol).toBe('demo.ui.Foo');
    expect(extractJson(source, 'Foo').source.symbol).toBe('demo.ui.Foo');
  });

  it('--symbol completo com package diferente: erro', () => {
    const result = extract(source, 'other.pkg.Foo');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('other.pkg');
    expect(result.stderr).toContain('demo.ui');
  });

  it('arquivo sem package: source.symbol é só o nome', () => {
    const sig = extractJson(`@Composable\nfun Foo(a: Int) {}\n`, 'Foo');
    expect(sig.source.symbol).toBe('Foo');
    expect(extract(`@Composable\nfun Foo(a: Int) {}\n`, 'x.Foo').code).toBe(1);
  });

  it('sem --path, o --file relativo vale (separadores /, sem ./ na frente)', () => {
    const sig = extractJson(source, 'Foo');
    expect(sig.source.path).toBe('A.kt');
    const nested = run2('./ui\\Foo.kt');
    expect(nested.source.path).toBe('ui/Foo.kt');
  });

  it('sem --path e com --file absoluto: erro de uso pedindo --path', () => {
    const result = run3('/abs/dir/A.kt');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--path');
    expect(result.stderr).toContain('raiz do repositório');
  });

  it('--path vale mesmo com --file absoluto', () => {
    const result = run3('/abs/dir/A.kt', ['--path', 'ui/A.kt']);
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as { source: { path: string } }).source.path).toBe(
      'ui/A.kt',
    );
  });

  it('--ref vai em source.ref; sem ele a chave não existe', () => {
    expect(extractJson(source, 'Foo', ['--ref', 'v1.2.3']).source.ref).toBe('v1.2.3');
    expect(extractJson(source, 'Foo').source).not.toHaveProperty('ref');
  });

  it('o arquivo ilegível é erro de extração (exit 1)', () => {
    const result = extract(source, 'Foo', ['--also', 'nao-existe.kt']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('nao-existe.kt');
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

describe('revisão: anotação qualificada, fábrica inteira, tipo-função entre parênteses', () => {
  it('anotação qualificada: @androidx.compose.runtime.Composable vira slot', () => {
    const p = paramsOf('content: @androidx.compose.runtime.Composable () -> Unit');
    expect(p.content?.role).toBe('slot');
  });

  it('@Composable (() -> Unit)? = null é slot', () => {
    const p = paramsOf('content: @Composable (() -> Unit)? = null');
    expect(p.content?.role).toBe('slot');
  });

  it('Objeto.fabrica(...).copy(...) não é fábrica (o default fica em texto)', () => {
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

  it('sobrecarga irmã com lista malformada não quebra quando --overload escolhe a boa', () => {
    const source = `package p
@Composable
fun Foo(a: Int) {}
@Composable
fun Foo(b Int) {}
`;
    const sig = extractJson(source, 'Foo', ['--overload', '0']);
    expect(sig.params[0]?.name).toBe('a');
  });

  it('sobrecarga malformada ao lado de uma só não-deprecada não quebra', () => {
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

  it('enum class cujo nome termina em State é enum, não state', () => {
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

describe('CL2 R-3: nome de parâmetro com crases', () => {
  it('`object`: String vira o parâmetro object (sem as crases), como o nome de função', () => {
    const sig = extractJson(composable('`object`: String, label: String'), 'Foo');
    expect(sig.params.map((p) => p.name)).toEqual(['object', 'label']);
  });
});
