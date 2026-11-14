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
  run,
  spawnBundle,
} from './support';

// The real CLI: the generated bundle (`dist-mcp/mapping-signature.js` and `.mjs`), in a separate process.

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

describe('--help and usage errors (exit 2)', () => {
  it('--help prints the usage on stdout and exits with 0', () => {
    const result = spawnBundle(BUNDLE_CJS, ['--help']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('mapping-signature kotlin --file');
    for (const flag of ['--symbol', '--path', '--ref', '--also', '--overload', '--out']) {
      expect(result.stdout).toContain(flag);
    }
  });

  it('without arguments: usage on stderr and exit 2', () => {
    const result = spawnBundle(BUNDLE_CJS, []);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--help');
  });

  it('unknown reader: "unknown reader: <x>; available: kotlin"', () => {
    const result = spawnBundle(BUNDLE_CJS, ['rust', '--file', 'a.rs', '--symbol', 'X']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      'unknown reader: rust; available: kotlin, swift, figma',
    );
  });

  it.each([
    ['without --file', ['kotlin', '--symbol', 'Foo']],
    ['without --symbol', ['kotlin', '--file', 'A.kt']],
    ['--file without a value', ['kotlin', '--symbol', 'Foo', '--file']],
    ['unknown option', ['kotlin', '--file', 'A.kt', '--symbol', 'Foo', '--nope', 'x']],
    ['stray argument', ['kotlin', 'A.kt', '--symbol', 'Foo']],
    [
      'repeated --overload',
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
  ])('%s: exit 2 with the message on stderr', (_name, args) => {
    const result = spawnBundle(BUNDLE_CJS, args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('absolute --file without --path is a usage error (exit 2) before reading any file', () => {
    const result = run(['kotlin', '--file', '/abs/A.kt', '--symbol', 'Foo']);
    expect(result.code).toBe(2);
    const withAlso = run([
      'kotlin',
      '--file',
      '/abs/A.kt',
      '--symbol',
      'Foo',
      '--also',
      'missing.kt',
    ]);
    expect(withAlso.code).toBe(2);
  });

  it('a missing file is an extraction error (exit 1), not a usage error', () => {
    const result = spawnBundle(BUNDLE_CJS, [
      'kotlin',
      '--file',
      'does/not/exist.kt',
      '--symbol',
      'Foo',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('does/not/exist.kt');
  });
});

describe('the printed signature (CJS and ESM)', () => {
  it('the androidx Button: the expected signature, byte by byte, from the .js and the .mjs', () => {
    const cjs = spawnBundle(BUNDLE_CJS, button);
    const esm = spawnBundle(BUNDLE_ESM, button);
    expect(cjs.stderr).toBe('');
    expect(esm.stderr).toBe('');
    expect(cjs.code).toBe(0);
    expect(esm.code).toBe(0);
    expect(cjs.stdout).toBe(canonical('Button.expected.json'));
    expect(esm.stdout).toBe(cjs.stdout);
  });

  it('determinism: two runs give the same bytes (even from another working folder)', () => {
    const a = spawnBundle(BUNDLE_CJS, button);
    const b = spawnBundle(BUNDLE_CJS, button);
    expect(b.stdout).toBe(a.stdout);
    // the text does not depend on dates or absolute paths
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
    '%s %j: .js and .mjs give the same bytes and the signature passes parseSignature',
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
  it('writes the file (same output as stdout), does not print the signature and creates only it', () => {
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
    const result = spawnBundle(BUNDLE_CJS, [...args, '--out', 'signature.json'], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(readdirSync(dir).sort()).toEqual(['Button.kt', 'signature.json']);
    expect(readFileSync(join(dir, 'signature.json'), 'utf8')).toBe(printed.stdout);
  });

  it('does not create folders: --out in a folder that does not exist is an extraction error and nothing is created', () => {
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
        'sub/signature.json',
      ],
      dir,
    );
    expect(result.code).toBe(1);
    expect(readdirSync(dir)).toEqual(['Button.kt']);
  });

  it('a signature that fails parseSignature: internal error (exit 1) and nothing is written', () => {
    const dir = mkdtempSync(join(temp, 'bad-'));
    // repeated parameter name: the signature validation refuses it
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
        'signature.json',
      ],
      dir,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('internal error');
    expect(result.stderr).toContain('repeated');
    expect(readdirSync(dir)).toEqual(['A.kt']);
  });

  it('the syntax error comes out as file:line:column: message (exit 1)', () => {
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
