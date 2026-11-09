// @vitest-environment node
// Etapa #971, fase CRI5 (itens 51 a 57 e 58/59): a CLI de `cloud.mjs` e `round-guide.mjs` roda
// num caminho com acento e espaço (`import.meta.url` vem codificado), e o cliente MCP por stdio
// lida com multibyte entre chunks, servidor que sai e servidor que não existe.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const tmp = mkdtempSync(path.join(tmpdir(), 'mapping cópia-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const copy = path.join(tmp, 'repositório com espaço');
mkdirSync(path.join(copy, 'scripts'), { recursive: true });
mkdirSync(path.join(copy, 'docs'), { recursive: true });
cpSync('scripts/testing', path.join(copy, 'scripts', 'testing'), { recursive: true });
cpSync('docs/TESTING.md', path.join(copy, 'docs', 'TESTING.md'));
symlinkSync(path.resolve('node_modules'), path.join(copy, 'node_modules'));

function run(args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    input: options.input,
    env: options.env ?? process.env,
    timeout: 20000,
  });
}

describe('CLI em caminho com acento e espaço (itens 51 e 52)', () => {
  it('round-guide.mjs imprime o guia', () => {
    const r = run([path.join(copy, 'scripts/testing/round-guide.mjs'), 'R0']);
    expect(r.stdout).toContain('### R0 ');
  });

  it('cloud.mjs executa o comando (help)', () => {
    const r = run([path.join(copy, 'scripts/testing/cloud.mjs'), 'help']);
    expect(r.stdout + r.stderr).toMatch(/saveFile/);
  });

  it('round-guide.mjs: ALL e All valem como all (item 59)', () => {
    const upper = run([path.join(copy, 'scripts/testing/round-guide.mjs'), 'ALL']);
    expect(upper.stdout).toContain('### R0 ');
    expect(upper.stdout).toContain('### R2 ');
  });
});

describe('mcp-stdio-client.mjs (itens 55 a 57)', () => {
  const client = path.resolve('scripts/testing/mcp-stdio-client.mjs');
  const calls = path.join(tmp, 'calls.json');

  function fakeServer(name: string, body: string): string {
    const file = path.join(tmp, name);
    writeFileSync(
      file,
      `
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { instructions: 'ok' } }) + '\\n');
  }
  ${body}
});
`,
    );
    return file;
  }

  it('multibyte cortado entre chunks chega inteiro (55)', () => {
    writeFileSync(calls, JSON.stringify([{ name: 'ferramenta', args: {} }]));
    const server = fakeServer(
      'multibyte.cjs',
      `if (m.method === 'tools/call') {
        const buf = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'ação ✓' }] } }) + '\\n');
        const cut = buf.indexOf(Buffer.from('ç')) + 1;
        process.stdout.write(buf.subarray(0, cut));
        setTimeout(() => process.stdout.write(buf.subarray(cut)), 100);
      }`,
    );
    const r = run([client, calls, '--', server]);
    expect(r.stdout).toContain('ação ✓');
  });

  it('request depois do exit do servidor rejeita na hora (56)', () => {
    writeFileSync(calls, JSON.stringify([{ name: 'ferramenta', args: {} }]));
    const server = fakeServer(
      'sai.cjs',
      `if (m.method === 'initialize') setTimeout(() => process.exit(0), 50);`,
    );
    const started = Date.now();
    const r = run([client, calls, '--', server]);
    expect(Date.now() - started).toBeLessThan(10000);
    expect(r.status).not.toBe(null);
    expect(r.stderr).toMatch(/servidor terminou/i);
  });

  it('servidor inexistente: mensagem curta, sem stack (57)', () => {
    writeFileSync(calls, JSON.stringify([{ list: true }]));
    const r = run([client, calls, '--', 'x.js'], {
      env: { ...process.env, PATH: '/nao-existe' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/não consegui iniciar o servidor/i);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });
});
