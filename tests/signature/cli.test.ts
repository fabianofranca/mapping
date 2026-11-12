import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseSignature } from '../../src/model/signatures';
import {
  APPBAR_PATH,
  BUNDLE_CJS,
  BUNDLE_ESM,
  BUTTON_PATH,
  FIXTURES,
  REF,
  SWITCH_PATH,
  canonical,
  fixtureText,
  spawnBundle,
} from './support';

// A CLI de verdade: o bundle gerado (`dist-mcp/mapping-signature.js` e `.mjs`), num processo à parte.

const temp = mkdtempSync(join(tmpdir(), 'mapping-signature-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const button = [
  'kotlin',
  '--file',
  'tests/fixtures/signature/kotlin/Button.kt',
  '--symbol',
  'androidx.compose.material3.Button',
  '--path',
  BUTTON_PATH,
  '--ref',
  REF,
];

describe('--help e erros de uso (exit 2)', () => {
  it('--help imprime o uso na saída padrão e sai com 0', () => {
    const result = spawnBundle(BUNDLE_CJS, ['--help']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('mapping-signature kotlin --file');
    for (const flag of ['--symbol', '--path', '--ref', '--also', '--overload', '--out']) {
      expect(result.stdout).toContain(flag);
    }
  });

  it('sem argumentos: uso no stderr e exit 2', () => {
    const result = spawnBundle(BUNDLE_CJS, []);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--help');
  });

  it('leitor desconhecido: "leitor desconhecido: <x>; disponíveis: kotlin"', () => {
    const result = spawnBundle(BUNDLE_CJS, [
      'swift',
      '--file',
      'a.swift',
      '--symbol',
      'X',
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('leitor desconhecido: swift; disponíveis: kotlin');
  });

  it.each([
    ['sem --file', ['kotlin', '--symbol', 'Foo']],
    ['sem --symbol', ['kotlin', '--file', 'A.kt']],
    ['--file sem valor', ['kotlin', '--symbol', 'Foo', '--file']],
    [
      'opção desconhecida',
      ['kotlin', '--file', 'A.kt', '--symbol', 'Foo', '--nope', 'x'],
    ],
    ['argumento solto', ['kotlin', 'A.kt', '--symbol', 'Foo']],
    [
      '--overload repetido',
      [
        'kotlin',
        '--file',
        'A.kt',
        '--symbol',
        'Foo',
        '--overload',
        '1',
        '--overload',
        '2',
      ],
    ],
  ])('%s: exit 2 com a mensagem no stderr', (_name, args) => {
    const result = spawnBundle(BUNDLE_CJS, args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('arquivo inexistente é erro de extração (exit 1), não de uso', () => {
    const result = spawnBundle(BUNDLE_CJS, [
      'kotlin',
      '--file',
      'nao/existe.kt',
      '--symbol',
      'Foo',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('nao/existe.kt');
  });
});

describe('a ficha impressa (CJS e ESM)', () => {
  it('o Button do androidx: a ficha esperada, byte a byte, pelo .js e pelo .mjs', () => {
    const cjs = spawnBundle(BUNDLE_CJS, button);
    const esm = spawnBundle(BUNDLE_ESM, button);
    expect(cjs.stderr).toBe('');
    expect(esm.stderr).toBe('');
    expect(cjs.code).toBe(0);
    expect(esm.code).toBe(0);
    expect(cjs.stdout).toBe(canonical('Button.expected.json'));
    expect(esm.stdout).toBe(cjs.stdout);
  });

  it('determinismo: duas execuções dão os mesmos bytes (mesmo de outra pasta de trabalho)', () => {
    const a = spawnBundle(BUNDLE_CJS, button);
    const b = spawnBundle(BUNDLE_CJS, button);
    expect(b.stdout).toBe(a.stdout);
    // o texto não depende de datas nem de caminhos absolutos
    expect(a.stdout).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(a.stdout).not.toContain(process.cwd());
    expect(a.stdout.endsWith('}\n')).toBe(true);
  });

  const all: [string, string[]][] = [
    ['Button.kt', ['--symbol', 'Button', '--path', BUTTON_PATH]],
    ['Switch.kt', ['--symbol', 'Switch', '--path', SWITCH_PATH]],
    ['AppBar.kt', ['--symbol', 'TopAppBar', '--path', APPBAR_PATH, '--overload', '0']],
    ['AppBar.kt', ['--symbol', 'TopAppBar', '--path', APPBAR_PATH, '--overload', '1']],
    ['AppBar.kt', ['--symbol', 'TopAppBar', '--path', APPBAR_PATH, '--overload', '2']],
  ];

  it.each(all)(
    '%s %j: .js e .mjs dão os mesmos bytes e a ficha passa no parseSignature',
    (file, rest) => {
      const args = [
        'kotlin',
        '--file',
        join(FIXTURES, file).replace(`${process.cwd()}/`, ''),
        ...rest,
      ];
      const cjs = spawnBundle(BUNDLE_CJS, args);
      const esm = spawnBundle(BUNDLE_ESM, args);
      expect(cjs.stderr).toBe('');
      expect(cjs.code).toBe(0);
      expect(esm.stdout).toBe(cjs.stdout);
      const parsed = parseSignature(JSON.parse(cjs.stdout));
      expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    },
  );
});

describe('--out', () => {
  it('grava o arquivo (mesma saída da padrão), não imprime a ficha e cria só ele', () => {
    const dir = mkdtempSync(join(temp, 'out-'));
    writeFileSync(join(dir, 'Button.kt'), fixtureText('Button.kt'));
    const args = [
      'kotlin',
      '--file',
      'Button.kt',
      '--symbol',
      'Button',
      '--path',
      'x/Button.kt',
    ];
    const printed = spawnBundle(BUNDLE_CJS, args, dir);
    const result = spawnBundle(BUNDLE_CJS, [...args, '--out', 'ficha.json'], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(readdirSync(dir).sort()).toEqual(['Button.kt', 'ficha.json']);
    expect(readFileSync(join(dir, 'ficha.json'), 'utf8')).toBe(printed.stdout);
  });

  it('não cria pastas: --out numa pasta que não existe é erro de extração e nada é criado', () => {
    const dir = mkdtempSync(join(temp, 'nodir-'));
    writeFileSync(join(dir, 'Button.kt'), fixtureText('Button.kt'));
    const result = spawnBundle(
      BUNDLE_CJS,
      [
        'kotlin',
        '--file',
        'Button.kt',
        '--symbol',
        'Button',
        '--path',
        'p.kt',
        '--out',
        'sub/ficha.json',
      ],
      dir,
    );
    expect(result.code).toBe(1);
    expect(readdirSync(dir)).toEqual(['Button.kt']);
  });

  it('ficha que não passa no parseSignature: erro interno (exit 1) e nada é escrito', () => {
    const dir = mkdtempSync(join(temp, 'bad-'));
    // nome de parâmetro repetido: a validação da ficha recusa
    writeFileSync(
      join(dir, 'A.kt'),
      'package p\n@Composable\nfun Foo(a: Int, a: Int) {}\n',
    );
    const result = spawnBundle(
      BUNDLE_CJS,
      [
        'kotlin',
        '--file',
        'A.kt',
        '--symbol',
        'Foo',
        '--path',
        'A.kt',
        '--out',
        'ficha.json',
      ],
      dir,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('erro interno');
    expect(result.stderr).toContain('repetido');
    expect(readdirSync(dir)).toEqual(['A.kt']);
  });

  it('o erro de sintaxe sai como arquivo:linha:coluna: mensagem (exit 1)', () => {
    const dir = mkdtempSync(join(temp, 'syntax-'));
    mkdirSync(join(dir, 'ui'));
    writeFileSync(join(dir, 'ui', 'A.kt'), 'package p\n\n@Composable\nfun Foo(a: Int,\n');
    const result = spawnBundle(
      BUNDLE_CJS,
      ['kotlin', '--file', 'ui/A.kt', '--symbol', 'Foo'],
      dir,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^ui\/A\.kt:4:8: .+\n$/);
  });
});
