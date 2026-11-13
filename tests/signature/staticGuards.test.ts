import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLE_CJS, BUNDLE_ESM, FIXTURES, ROOT, spawnBundle } from './support';

// Guardas estáticas e de execução: o extrator não abre rede e só grava o `--out`.
// Mudar estas listas é uma decisão (docs/ARCHITECTURE.md, "signature/").

const DIR = join(ROOT, 'signature');

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/\s+\/\/\s.*$/, ''))
    .join('\n');
}

function sources(): { file: string; code: string }[] {
  return readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => ({
      file,
      code: stripComments(readFileSync(join(DIR, file), 'utf8')),
    }));
}

const WRITERS = [
  'writeFile',
  'appendFile',
  'rename',
  'link',
  'symlink',
  'mkdir',
  'mkdtemp',
  'rm',
  'rmdir',
  'unlink',
  'copyFile',
  'cp',
  'truncate',
  'open',
  'createWriteStream',
];
const WRITER_CALL = new RegExp(`(?<![\\w$.])(${WRITERS.join('|')})(?:Sync)?\\s*\\(`, 'g');
const NETWORK_MODULES =
  /['"](?:node:)?(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads|cluster|inspector|vm)(?:\/\w+)?['"]/;
const NETWORK_GLOBALS =
  /(?<![\w$.])(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*[(\s]|new Function/;

describe('o que o código de signature/ pode fazer', () => {
  const all = sources();

  it('a varredura vê o código do extrator (main, cli, leitor, tokenizador)', () => {
    const files = all.map((s) => s.file);
    expect(files).toContain('main.ts');
    expect(files).toContain('cli.ts');
    expect(files.some((f) => /kotlin/i.test(f))).toBe(true);
  });

  it('nenhum módulo de rede ou de processo é importado, nenhum global de rede é usado', () => {
    for (const { file, code } of all) {
      expect(NETWORK_MODULES.test(code), `${file}: módulo de rede`).toBe(false);
      expect(NETWORK_GLOBALS.test(code), `${file}: global de rede`).toBe(false);
    }
  });

  it('só cli.ts chama função que grava, e só writeFile (o --out)', () => {
    const calls: Record<string, string[]> = {};
    for (const { file, code } of all) {
      const names = [...new Set([...code.matchAll(WRITER_CALL)].map((m) => m[1]!))];
      if (names.length > 0) calls[file] = names.sort();
    }
    expect(calls).toEqual({ 'cli.ts': ['writeFile'] });
  });

  it('só importa de src/model/ (o app não entra no bundle)', () => {
    for (const { file, code } of all) {
      for (const m of code.matchAll(/from\s+['"]([^'"]*\/src\/[^'"]*)['"]/g)) {
        expect(m[1], file).toMatch(/\/src\/model(\/|$)/);
      }
    }
  });

  it('os bundles só tocam em node:fs (e node:path, node:url), nenhum módulo de rede', () => {
    for (const bundle of [BUNDLE_CJS, BUNDLE_ESM]) {
      const text = readFileSync(bundle, 'utf8');
      const mods = new Set(
        [
          ...text.matchAll(
            /(?:require\(|from\s*|import\()\s*["'](?:node:)?([a-z_/]+)["']/g,
          ),
        ].map((m) => m[1]!),
      );
      for (const mod of mods) expect(['fs', 'path', 'url', 'os']).toContain(mod);
      expect(text).not.toMatch(/child_process|XMLHttpRequest|WebSocket/);
    }
  });
});

/** Caminho relativo → conteúdo (ou `dir`) de tudo sob a pasta. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const full = join(dir, entry);
    out[entry] = statSync(full).isDirectory() ? 'dir' : readFileSync(full, 'utf8');
  }
  return out;
}

describe('execução: a árvore de pastas antes e depois', () => {
  it('sem --out nada é gravado; com --out só o arquivo pedido aparece', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapping-signature-tree-'));
    try {
      cpSync(FIXTURES, join(dir, 'kt'), { recursive: true });
      const before = tree(dir);
      const base = [
        'kotlin',
        '--file',
        'kt/Switch.kt',
        '--symbol',
        'Switch',
        '--path',
        'x/S.kt',
      ];
      const printed = spawnBundle(BUNDLE_CJS, base, dir);
      expect(printed.code).toBe(0);
      expect(tree(dir)).toEqual(before);
      const failed = spawnBundle(
        BUNDLE_ESM,
        ['kotlin', '--file', 'kt/AppBar.kt', '--symbol', 'TopAppBar', '--path', 'x'],
        dir,
      );
      expect(failed.code).toBe(1);
      expect(tree(dir)).toEqual(before);
      const written = spawnBundle(BUNDLE_ESM, [...base, '--out', 'ficha.json'], dir);
      expect(written.code).toBe(0);
      expect(tree(dir)).toEqual({ ...before, 'ficha.json': printed.stdout });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
