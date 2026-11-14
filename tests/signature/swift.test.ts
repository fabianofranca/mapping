import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSignature, planSignatureImport } from '../../src/model/signatures';
import type { Spec } from '../../src/model/spec';
import { BUNDLE_CJS, BUNDLE_ESM, ROOT, run, spawnBundle, type Sig } from './support';

// O leitor SwiftUI (`mapping-signature/swift@1`, etapa #1079, S4; decisões 3, 9 e 10): o `init`
// explícito (escolhido por `--init`) ou o memberwise, os rótulos, os enums, o padrão literal, o
// `@ViewBuilder` e os `///`. Casos sintéticos em memória e as fixtures de tests/fixtures/signature/swift.

const FIXTURES = join(ROOT, 'tests/fixtures/signature/swift');
const rel = (name: string): string => `tests/fixtures/signature/swift/${name}`;
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

function extractSwift(
  source: string,
  symbol: string,
  flags: readonly string[] = [],
  extra: Readonly<Record<string, string>> = {},
) {
  return run(['swift', '--file', 'A.swift', '--symbol', symbol, ...flags], {
    'A.swift': source,
    ...extra,
  });
}

function swiftJson(
  source: string,
  symbol: string,
  flags: readonly string[] = [],
  extra: Readonly<Record<string, string>> = {},
): Sig {
  const result = extractSwift(source, symbol, flags, extra);
  if (result.code !== 0) throw new Error(`exit ${result.code}: ${result.stderr}`);
  const parsed = parseSignature(JSON.parse(result.stdout));
  expect(parsed.ok, result.stdout).toBe(true);
  return JSON.parse(result.stdout) as Sig;
}

const byName = (sig: Sig): Record<string, Sig['params'][number]> =>
  Object.fromEntries(sig.params.map((p) => [p.name, p]));

/** Um `A.swift` mínimo: uma view com um `init` explícito cuja lista é a dada. */
const withInit = (list: string, extra = ''): string =>
  `import SwiftUI\n\nstruct Foo: View {\n${extra}\n    init(${list}) {}\n    var body: some View { EmptyView() }\n}\n`;

/** Um `A.swift` mínimo: uma view com as propriedades dadas (memberwise). */
const withProps = (props: string): string =>
  `import SwiftUI\n\nstruct Foo: View {\n${props}\n    var body: some View { EmptyView() }\n}\n`;

function extractFixture(name: string, flags: readonly string[]) {
  return run(['swift', '--file', rel(name), ...flags], { [rel(name)]: fixture(name) });
}

describe('init explícito: rótulos, `_`, padrões e papéis', () => {
  let sig: Sig;
  beforeAll(() => {
    sig = swiftJson(fixture('ProfileCard.swift'), 'DS.ProfileCard', [
      '--path',
      'Sources/DS/ProfileCard.swift',
      '--ref',
      'fixture',
    ]);
  });

  it('source: plataforma swiftui, linguagem swift, símbolo como veio, sem init (um só explícito)', () => {
    expect(sig.source).toEqual({
      kind: 'code',
      platform: 'swiftui',
      language: 'swift',
      symbol: 'DS.ProfileCard',
      path: 'Sources/DS/ProfileCard.swift',
      ref: 'fixture',
      extractor: 'mapping-signature/swift@1',
    });
  });

  it('os parâmetros do init, na ordem da fonte, com o rótulo externo só quando difere do nome', () => {
    expect(sig.params.map((p) => [p.name, p.label])).toEqual([
      ['title', '_'],
      ['badgeCount', 'badge'],
      ['style', undefined],
      ['onTap', undefined],
      ['content', undefined],
    ]);
  });

  it('title: texto obrigatório; badgeCount: inteiro de padrão 0', () => {
    const by = byName(sig);
    expect(by.title).toEqual({
      name: 'title',
      label: '_',
      role: 'value',
      type: 'String',
      required: true,
      value: { kind: 'text' },
    });
    expect(by.badgeCount).toEqual({
      name: 'badgeCount',
      label: 'badge',
      role: 'value',
      type: 'Int',
      default: '0',
      value: { kind: 'integer', default: 0 },
    });
  });

  it('o enum aninhado na struct vira options e o padrão `.compact` vira a opção', () => {
    expect(byName(sig).style).toEqual({
      name: 'style',
      role: 'value',
      type: 'Style',
      default: '.compact',
      value: { kind: 'enum', default: 'compact', options: ['compact', 'regular'] },
    });
  });

  it('closure opcional é callback (sem required, padrão nil); @ViewBuilder é slot obrigatório', () => {
    const by = byName(sig);
    expect(by.onTap).toEqual({
      name: 'onTap',
      role: 'callback',
      type: '(() -> Void)?',
      default: 'nil',
    });
    expect(by.content).toEqual({
      name: 'content',
      role: 'slot',
      type: '@ViewBuilder () -> Content',
      required: true,
    });
  });

  it('doc: o `- Parameters:` da struct, o `- Parameter` do init e o /// do init; só parâmetros que existem', () => {
    expect(sig.doc).toEqual({
      title: 'The name shown at the top of the card.',
      badgeCount: 'How many unread items the badge shows.',
      style: 'How tall the card is. Compact is the default.',
      onTap: 'Called when the card is tapped.',
      content: 'The body of the card.',
    });
  });
});

describe('memberwise: as propriedades armazenadas, sem os property wrappers de estado', () => {
  let sig: Sig;
  let by: Record<string, Sig['params'][number]>;
  beforeAll(() => {
    sig = swiftJson(fixture('Tag.swift'), 'Tag', ['--path', 'Tag.swift']);
    by = byName(sig);
  });

  it('só entram let e var armazenadas, na ordem da declaração', () => {
    expect(sig.params.map((p) => p.name)).toEqual([
      'text',
      'borderWidth',
      'tint',
      'isSelected',
      'level',
      'onRemove',
      'count',
      'trailing',
    ]);
  });

  it('ficam de fora @State, @FocusState, @Environment, @EnvironmentObject, @StateObject, let com valor, private, static e computadas', () => {
    for (const out of [
      'hovering',
      'focused',
      'scheme',
      'theme',
      'model',
      'id',
      'cache',
      'shared',
      'body',
      'summary',
    ]) {
      expect(by[out], out).toBeUndefined();
    }
  });

  it('CGFloat é dimension; Color é color; Bool é boolean; Int? é integer sem required e de padrão nil', () => {
    expect(by.borderWidth?.value).toEqual({ kind: 'dimension', default: 1 });
    expect(by.tint).toMatchObject({
      type: 'Color',
      default: '.blue',
      value: { kind: 'color' },
    });
    expect(by.isSelected?.value).toEqual({ kind: 'boolean', default: false });
    expect(by.level).toEqual({
      name: 'level',
      role: 'value',
      type: 'Int?',
      default: 'nil',
      value: { kind: 'integer' },
    });
  });

  it('let sem valor é obrigatório e o texto vem do /// da propriedade', () => {
    expect(by.text).toEqual({
      name: 'text',
      role: 'value',
      type: 'String',
      required: true,
      value: { kind: 'text' },
    });
    expect(sig.doc).toEqual({
      text: 'The text of the tag.',
      borderWidth: 'How wide the border is.',
    });
  });

  it('@Binding vira Binding<T> com papel state; @ViewBuilder em closure é slot', () => {
    expect(by.count).toEqual({
      name: 'count',
      role: 'state',
      type: 'Binding<Int>',
      required: true,
    });
    expect(by.trailing).toEqual({
      name: 'trailing',
      role: 'slot',
      type: '@ViewBuilder () -> TrailingContent',
      required: true,
    });
  });

  it('sem init explícito não há source.init', () => {
    expect(sig.source.init).toBeUndefined();
  });
});

describe('o tipo de cada parâmetro, o padrão literal e o papel', () => {
  it('Double e Float são number; LocalizedStringKey e String são text; padrão string simples vira literal', () => {
    const sig = swiftJson(
      withInit(
        'ratio: Double = 0.5, scale: Float = 2, key: LocalizedStringKey = "OK", name: String = "a \\(b)"',
      ),
      'Foo',
    );
    const by = byName(sig);
    expect(by.ratio?.value).toEqual({ kind: 'number', default: 0.5 });
    expect(by.scale?.value).toEqual({ kind: 'number', default: 2 });
    expect(by.key?.value).toEqual({ kind: 'text', default: 'OK' });
    // interpolação não é literal representável
    expect(by.name?.value).toEqual({ kind: 'text' });
  });

  it('CGFloat(8) e números negativos são literais; expressões ficam só no default em texto', () => {
    const by = byName(
      swiftJson(
        withInit(
          'gap: CGFloat = CGFloat(8), offset: Int = -3, pad: CGFloat = Metrics.pad',
        ),
        'Foo',
      ),
    );
    expect(by.gap?.value).toEqual({ kind: 'dimension', default: 8 });
    expect(by.offset?.value).toEqual({ kind: 'integer', default: -3 });
    expect(by.pad?.value).toEqual({ kind: 'dimension' });
    expect(by.pad?.default).toBe('Metrics.pad');
  });

  it('tipos que não são do mapa (Font, Image, listas, tuplas) são opaque', () => {
    const by = byName(
      swiftJson(
        withInit('font: Font = .body, icons: [String] = [], pair: (Int, Int) = (0, 0)'),
        'Foo',
      ),
    );
    expect(by.font?.value).toEqual({ kind: 'opaque' });
    expect(by.icons?.value).toEqual({ kind: 'opaque' });
    expect(by.pair?.value).toEqual({ kind: 'opaque' });
  });

  it('o padrão do enum vale em .a, Tipo.a e Outer.Tipo.a; constante que não existe fica sem default', () => {
    const src = (def: string): string =>
      `import SwiftUI\nenum Tone { case warm, cold }\nstruct Foo: View {\n  init(tone: Tone = ${def}) {}\n  var body: some View { EmptyView() }\n}\n`;
    for (const def of ['.cold', 'Tone.cold', 'Module.Tone.cold']) {
      expect(swiftJson(src(def), 'Foo').params[0]?.value, def).toEqual({
        kind: 'enum',
        default: 'cold',
        options: ['warm', 'cold'],
      });
    }
    expect(swiftJson(src('.missing'), 'Foo').params[0]?.value).toEqual({
      kind: 'enum',
      options: ['warm', 'cold'],
    });
  });

  it('o enum de um --also conta; enum com valor associado é opaque', () => {
    const also =
      'enum Tone: String { case warm = "w", cold = "c" }\nenum Rich { case a, b(Int) }\n';
    const src = withInit('tone: Tone = .warm, rich: Rich = .a');
    const by = byName(swiftJson(src, 'Foo', ['--also', 'B.swift'], { 'B.swift': also }));
    expect(by.tone?.value).toEqual({
      kind: 'enum',
      default: 'warm',
      options: ['warm', 'cold'],
    });
    expect(by.rich?.value).toEqual({ kind: 'opaque' });
    // sem o --also, o enum é desconhecido
    expect(byName(swiftJson(src, 'Foo')).tone?.value).toEqual({ kind: 'opaque' });
  });

  it('@escaping e closures são callback; closure que devolve view e @ViewBuilder são slot', () => {
    const src = `import SwiftUI
struct Foo<Label: View>: View {
  init(
    action: @escaping () -> Void,
    onChange: @escaping (Int) -> Void,
    label: () -> Label,
    @ViewBuilder header: () -> Label,
    icon: AnyView
  ) {}
  var body: some View { EmptyView() }
}
`;
    const by = byName(swiftJson(src, 'Foo'));
    expect(by.action).toMatchObject({ role: 'callback', type: '@escaping () -> Void' });
    expect(by.onChange?.role).toBe('callback');
    expect(by.label?.role).toBe('slot');
    expect(by.header).toMatchObject({ role: 'slot', type: '@ViewBuilder () -> Label' });
    expect(by.icon?.role).toBe('slot');
  });

  it('o tipo genérico que é View (no <> ou no where) é slot; o que não é, value opaque', () => {
    const src = `import SwiftUI
struct Foo<Content, Other>: View where Content: View {
  let content: Content
  let other: Other
  var body: some View { EmptyView() }
}
`;
    const by = byName(swiftJson(src, 'Foo'));
    expect(by.content?.role).toBe('slot');
    expect(by.other).toMatchObject({ role: 'value', value: { kind: 'opaque' } });
  });

  it('Binding no init é state; variádico é other; o nome interno `_` rótulo e o rótulo diferente do nome', () => {
    const by = byName(
      swiftJson(withInit('_ on: Binding<Bool>, items names: String...'), 'Foo'),
    );
    expect(by.on).toMatchObject({ label: '_', role: 'state', type: 'Binding<Bool>' });
    expect(by.names).toMatchObject({ label: 'items', role: 'other', type: 'String...' });
  });

  it('vírgula final, comentários, atributos e quebras de linha na lista', () => {
    const src = `import SwiftUI
struct Foo: View {
  init(
    // o título
    title: String, /* o selo */
    count: Int = 0,
  ) {}
  var body: some View { EmptyView() }
}
`;
    expect(swiftJson(src, 'Foo').params.map((p) => p.name)).toEqual(['title', 'count']);
  });
});

describe('sobrecargas de init (decisão 9)', () => {
  it('ambíguo sem --init: falha (exit 1) listando todos os inits, com a marca dos deprecated', () => {
    const result = extractFixture('Chip.swift', ['--symbol', 'Chip']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'ambiguous init: Chip has 2 inits (not counting the deprecated ones) in tests/fixtures/signature/swift/Chip.swift; pick one with --init <n>:',
    );
    expect(result.stderr).toContain('  0: line 7 (_:)');
    expect(result.stderr).toContain('  1: line 12 (title:count:)');
    expect(result.stderr).toContain('  2: line 18 [deprecated] (label:)');
  });

  it('--init escolhe pelo índice na lista completa e fica em source.init', () => {
    const one = swiftJson(fixture('Chip.swift'), 'Chip', ['--init', '1']);
    expect(one.source.init).toBe(1);
    expect(one.params.map((p) => [p.name, p.label])).toEqual([
      ['title', undefined],
      ['count', undefined],
    ]);
    const zero = swiftJson(fixture('Chip.swift'), 'Chip', ['--init', '0']);
    expect(zero.params.map((p) => [p.name, p.label])).toEqual([['title', '_']]);
    // o deprecated também se escolhe, pelo índice
    expect(
      swiftJson(fixture('Chip.swift'), 'Chip', ['--init', '2']).params[0]?.name,
    ).toBe('label');
  });

  it('--init fora da lista: erro com a lista', () => {
    const result = extractSwift(fixture('Chip.swift'), 'Chip', ['--init', '7']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--init 7 is not in the list: Chip has 3 inits');
    expect(result.stderr).toContain('  1: line 12 (title:count:)');
  });

  it('só inits deprecated e sem --init: ambíguo (cita que só há deprecated)', () => {
    const src = `import SwiftUI
struct Foo: View {
  @available(*, deprecated) init(a: Int) {}
  @available(iOS, introduced: 13, deprecated: 15) init(b: Int) {}
  var body: some View { EmptyView() }
}
`;
    const result = extractSwift(src, 'Foo');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('only has deprecated inits');
  });

  it('sem init explícito, --init 0 vale para o memberwise e fica em source.init', () => {
    const sig = swiftJson(withProps('  let a: Int\n  var b = 2'), 'Foo', ['--init', '0']);
    expect(sig.source.init).toBe(0);
    expect(sig.params.map((p) => p.name)).toEqual(['a', 'b']);
    const result = extractSwift(withProps('  let a: Int'), 'Foo', ['--init', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--init 1 fora da lista');
  });
});

describe('o memberwise em detalhe', () => {
  it('var sem tipo escrito: o tipo vem do literal; sem literal, `_`', () => {
    const by = byName(
      swiftJson(
        withProps(
          '  var count = 0\n  var title = "x"\n  var flag = true\n  var ratio = 1.5\n  var what = make()',
        ),
        'Foo',
      ),
    );
    expect(by.count).toMatchObject({
      type: 'Int',
      default: '0',
      value: { kind: 'integer', default: 0 },
    });
    expect(by.title?.type).toBe('String');
    expect(by.flag?.type).toBe('Bool');
    expect(by.ratio?.type).toBe('Double');
    expect(by.what?.type).toBe('_');
  });

  it('observadores (didSet) não tornam a propriedade computada; getter sim', () => {
    const src = withProps(
      '  var a: Int = 0 { didSet { print(a) } }\n  var b: Int { 5 }\n  var c: Int { get { 1 } }',
    );
    expect(swiftJson(src, 'Foo').params.map((p) => p.name)).toEqual(['a']);
  });

  it('atributo e modificador em linhas separadas; ponto e vírgula; private(set) fica', () => {
    const src = withProps(
      '  @State\n  private var hidden = 0\n  let a: Int; let b: Int\n  public private(set) var c: Int = 1',
    );
    expect(swiftJson(src, 'Foo').params.map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('wrapper com argumentos (@AppStorage("k")) não entra; @ObservedObject entra como state com o tipo do objeto', () => {
    const src = withProps(
      '  @AppStorage("k") var saved = false\n  @ObservedObject var model: Model\n  @Bindable var other: Other',
    );
    const sig = swiftJson(src, 'Foo');
    expect(sig.params.map((p) => [p.name, p.role, p.type])).toEqual([
      ['model', 'state', 'Model'],
      ['other', 'state', 'Other'],
    ]);
  });

  it('o /// da propriedade vira o doc; o `- Parameter` da struct vale quando a propriedade não tem', () => {
    const src = `import SwiftUI
/// - Parameter b: Documented on the struct.
struct Foo: View {
  /// Documented on the property.
  let a: Int
  let b: Int
  var body: some View { EmptyView() }
}
`;
    expect(swiftJson(src, 'Foo').doc).toEqual({
      a: 'Documented on the property.',
      b: 'Documented on the struct.',
    });
  });
});

describe('a struct pelo --symbol', () => {
  it('o prefixo do --symbol é guardado como veio; uma struct fora das duas de mesmo nome desambigua pelo tipo que a envolve', () => {
    const src = `import SwiftUI
enum A { struct Row: View { let x: Int; var body: some View { EmptyView() } } }
enum B { struct Row: View { let y: Int; var body: some View { EmptyView() } } }
`;
    const ambiguous = extractSwift(src, 'Row');
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stderr).toContain('Row appears 2 times');
    expect(ambiguous.stderr).toContain('inside A');
    expect(ambiguous.stderr).toContain('inside B');
    const chosen = swiftJson(src, 'B.Row');
    expect(chosen.params.map((p) => p.name)).toEqual(['y']);
    expect(chosen.source.symbol).toBe('B.Row');
    expect(swiftJson(src, 'Mod.A.Row').params.map((p) => p.name)).toEqual(['x']);
  });

  it('struct inexistente: erro (exit 1) com o arquivo', () => {
    const result = extractSwift(withProps('  let a: Int'), 'Nada');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('struct Nada not found in A.swift');
  });

  it('class e enum de mesmo nome não são struct', () => {
    const result = extractSwift('class Foo {}\nenum Bar {}\n', 'Foo');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('struct Foo not found');
  });

  it('erro de sintaxe: arquivo:linha:coluna com o delimitador não fechado', () => {
    const result = extractSwift('struct Foo: View {\n  init(a: Int,\n', 'Foo');
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^A\.swift:2:7: "\(" not closed\n$/);
  });

  it('o --path vira source.path; sem ele vale o --file relativo', () => {
    const sig = swiftJson(withProps('  let a: Int'), 'Foo');
    expect(sig.source.path).toBe('A.swift');
    expect(sig.source).not.toHaveProperty('ref');
  });
});

describe('opções que não são do leitor Swift (exit 2)', () => {
  it('--overload é do kotlin e --init é do swift', () => {
    const a = extractSwift(withProps('  let a: Int'), 'Foo', ['--overload', '1']);
    expect(a.code).toBe(2);
    expect(a.stderr).toContain('--overload');
    const k = run(['kotlin', '--file', 'A.kt', '--symbol', 'Foo', '--init', '1'], {
      'A.kt': 'x',
    });
    expect(k.code).toBe(2);
    expect(k.stderr).toContain('--init');
  });

  it('--init precisa de um inteiro de 0 em diante', () => {
    for (const bad of ['-1', 'a', '1.5']) {
      const r = extractSwift(withProps('  let a: Int'), 'Foo', ['--init', bad]);
      expect(r.code, bad).toBe(2);
    }
  });

  it('o uso lista os três leitores e as opções novas', () => {
    const help = run(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('mapping-signature swift --file');
    expect(help.stdout).toContain('--init');
    expect(help.stdout).toContain('mapping-signature figma --file');
    expect(help.stdout).toContain('--node');
    expect(help.stdout).toContain('Readers: kotlin, swift, figma');
  });
});

describe('determinismo e o bundle', () => {
  const args = [
    'swift',
    '--file',
    rel('ProfileCard.swift'),
    '--symbol',
    'DS.ProfileCard',
    '--path',
    'Sources/DS/ProfileCard.swift',
    '--ref',
    'fixture',
  ];

  it('duas execuções e o .js contra o .mjs dão os mesmos bytes, e a ficha passa no parseSignature', () => {
    const a = spawnBundle(BUNDLE_CJS, args);
    const b = spawnBundle(BUNDLE_CJS, args);
    const esm = spawnBundle(BUNDLE_ESM, args);
    expect(a.stderr).toBe('');
    expect(a.code).toBe(0);
    expect(b.stdout).toBe(a.stdout);
    expect(esm.stdout).toBe(a.stdout);
    expect(a.stdout.endsWith('}\n')).toBe(true);
    expect(a.stdout).not.toContain(process.cwd());
    expect(parseSignature(JSON.parse(a.stdout)).ok).toBe(true);
  });

  it('as fichas esperadas das fixtures, byte a byte', () => {
    const cases: [string, string[]][] = [
      [
        'ProfileCard.swift',
        [
          '--symbol',
          'DS.ProfileCard',
          '--path',
          'Sources/DS/ProfileCard.swift',
          '--ref',
          'fixture',
        ],
      ],
      ['Tag.swift', ['--symbol', 'Tag', '--path', 'Tag.swift']],
    ];
    for (const [file, rest] of cases) {
      const out = spawnBundle(BUNDLE_CJS, ['swift', '--file', rel(file), ...rest]);
      const expected = JSON.parse(fixture(file.replace('.swift', '.expected.json')));
      expect(out.code, file).toBe(0);
      expect(out.stdout, file).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    }
  });
});

describe('a ficha Swift importada pela mesma tool, sem caso especial de plataforma', () => {
  const library = JSON.parse(
    readFileSync(join(ROOT, 'tests/fixtures/signature/library/lib.spec.json'), 'utf8'),
  ) as Spec;
  let signature: ReturnType<typeof parseSignatureOf>;
  beforeAll(() => {
    signature = parseSignatureOf(
      extractFixture('ProfileCard.swift', [
        '--symbol',
        'DS.ProfileCard',
        '--path',
        'Sources/DS/ProfileCard.swift',
        '--ref',
        'fixture',
      ]).stdout,
    );
  });

  function plan(spec: Spec, previous?: typeof signature) {
    const result = planSignatureImport(spec, {
      type: 'profile-card',
      target: { platform: 'swiftui' },
      signature,
      ...(previous === undefined ? {} : { previous }),
    });
    if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
    return result.plan;
  }

  it('o argumento posicional vira `#0` e o rótulo externo vai para o code.params', () => {
    const result = plan(library);
    expect(result.code?.params).toEqual({
      title: '#0',
      badgeCount: 'badge',
      style: 'style',
    });
    expect(result.fields.map((f) => [f.key, f.type])).toEqual([
      ['title', 'string'],
      ['badgeCount', 'number'],
      ['style', 'enum'],
    ]);
    // onTap é callback e content é slot: ficam no unmapped
    expect(result.unmapped.map((u) => u.name)).toEqual(['onTap', 'content']);
  });

  it('importar a mesma ficha duas vezes não muda nada', () => {
    const first = plan(library);
    const again = plan(first.spec, signature);
    expect(again.spec).toEqual(first.spec);
    expect(again.versionBump).toBe(false);
    expect(again.fields).toEqual([]);
  });
});

function parseSignatureOf(text: string) {
  const parsed = parseSignature(JSON.parse(text));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.signature;
}

describe('achados da revisão `/code-review high` (S4)', () => {
  it('a `{` (e o `where`) em linha própria não separa o cabeçalho da struct do corpo', () => {
    const allman = `import SwiftUI\n\nstruct Foo: View\n{\n    let title: String\n    var body: some View { EmptyView() }\n}\n`;
    expect(swiftJson(allman, 'Foo').params.map((p) => p.name)).toEqual(['title']);
    const where = `import SwiftUI\n\nstruct Foo<C>: View\n    where C: View\n{\n    let content: C\n    var body: some View { EmptyView() }\n}\n`;
    expect(swiftJson(where, 'Foo').params[0]).toMatchObject({
      name: 'content',
      role: 'slot',
    });
  });

  it('property wrappers sem argumento que o próprio Swift preenche ficam fora do memberwise', () => {
    const sig = swiftJson(
      withProps(
        '    let title: String\n    @Namespace var ns\n    @GestureState var drag = false\n    @ScaledMetric var size = 12\n    @AccessibilityFocusState var a11y: Bool',
      ),
      'Foo',
    );
    expect(sig.params.map((p) => p.name)).toEqual(['title']);
  });

  it('um init `private` não conta como candidato: sobrando um chamável, ele é o escolhido', () => {
    const source = `import SwiftUI\n\nstruct Foo: View {\n    let title: String\n    private let cache: Int\n    public init(title: String) { self.title = title; cache = 0 }\n    private init(title: String, cache: Int) { self.title = title; self.cache = cache }\n    var body: some View { EmptyView() }\n}\n`;
    expect(swiftJson(source, 'Foo').params.map((p) => p.name)).toEqual(['title']);
    // com --init, o índice continua contando todos (também o private)
    expect(swiftJson(source, 'Foo', ['--init', '1']).params.map((p) => p.name)).toEqual([
      'title',
      'cache',
    ]);
  });

  it('um padrão que quebra a linha com `?`, `:` ou `&&` na frente não é truncado', () => {
    const sig = swiftJson(
      withProps(
        '    let flag: Bool\n    var tint: Color = flag\n        ? .red\n        : .blue\n    var ok: Bool = flag\n        && true',
      ),
      'Foo',
    );
    const params = byName(sig);
    expect(params.tint?.default).toBe('flag ? .red : .blue');
    expect(params.ok?.default).toBe('flag && true');
  });

  it('um genérico `View & Equatable` também é slot', () => {
    const source = `import SwiftUI\n\nstruct Card<Content: View & Equatable, Other: View & Hashable>: View {\n    let content: Content\n    let other: Other\n    var body: some View { EmptyView() }\n}\n`;
    const params = byName(swiftJson(source, 'Card'));
    expect(params.content?.role).toBe('slot');
    expect(params.other?.role).toBe('slot');
  });
});
