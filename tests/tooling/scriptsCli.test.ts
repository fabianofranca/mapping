// @vitest-environment node
// Stage #971, phase CRI5 (items 51 to 57 and 58/59): the `cloud.mjs` and `round-guide.mjs` CLI runs
// on a path with an accent and a space (`import.meta.url` comes encoded), and the stdio MCP client
// handles multibyte across chunks, a server that exits and a server that does not exist.
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

const copy = path.join(tmp, 'répository with space');
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

describe('CLI on a path with an accent and a space (items 51 and 52)', () => {
  it('round-guide.mjs prints the guide', () => {
    const r = run([path.join(copy, 'scripts/testing/round-guide.mjs'), 'R0']);
    expect(r.stdout).toContain('### R0 ');
  });

  it('cloud.mjs runs the command (help)', () => {
    const r = run([path.join(copy, 'scripts/testing/cloud.mjs'), 'help']);
    expect(r.stdout + r.stderr).toMatch(/saveFile/);
  });

  it('cloud.mjs help lists the cadastro command (RH3)', () => {
    const r = run([path.join(copy, 'scripts/testing/cloud.mjs'), 'help']);
    expect(r.stdout).toMatch(/cloud\.mjs cadastro <file>/);
  });

  it('cloud.mjs cadastro without the file is a usage error (RH3)', () => {
    const r = run([path.join(copy, 'scripts/testing/cloud.mjs'), 'cadastro']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Usage: node cloud\.mjs cadastro <file>/);
  });

  it('cloud.mjs passo reads the guide generated in the copy (#1232)', () => {
    const guide = path.join(tmp, 'apoio with accént', 'guia.md');
    const gen = run([
      path.join(copy, 'scripts/testing/round-guide.mjs'),
      'R0',
      '--out',
      guide,
    ]);
    expect(gen.status).toBe(0);
    const r = run([
      path.join(copy, 'scripts/testing/cloud.mjs'),
      'passo',
      'R0.1',
      `--guia=${guide}`,
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(
      /^\| Step \| Action \| Expected \|\n\| --- \|[^\n]*\n\| R0\.1 \|/,
    );
  });

  it('round-guide.mjs: ALL and All count as all (item 59)', () => {
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

  it('multibyte split across chunks arrives whole (55)', () => {
    writeFileSync(calls, JSON.stringify([{ name: 'tool', args: {} }]));
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

  it('a request after the server exits rejects right away (56)', () => {
    writeFileSync(calls, JSON.stringify([{ name: 'tool', args: {} }]));
    const server = fakeServer(
      'sai.cjs',
      `if (m.method === 'initialize') setTimeout(() => process.exit(0), 50);`,
    );
    const started = Date.now();
    const r = run([client, calls, '--', server]);
    expect(Date.now() - started).toBeLessThan(10000);
    expect(r.status).not.toBe(null);
    expect(r.stderr).toMatch(/server ended/i);
  });

  it('nonexistent server: short message, no stack (57)', () => {
    writeFileSync(calls, JSON.stringify([{ list: true }]));
    const r = run([client, calls, '--', 'x.js'], {
      env: { ...process.env, PATH: '/does-not-exist' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not start the server/i);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });
});
