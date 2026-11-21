import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const bundle = resolve('dist-mcp/mapping-mcp.js');

describe('dist-mcp/mapping-mcp.js (single file, over stdio)', () => {
  it('generates the single file', () => {
    expect(statSync(bundle).isFile()).toBe(true);
  });

  it('carries at the end the license notices of the embedded dependencies', () => {
    const text = readFileSync(bundle, 'utf8');
    const notices = text.slice(text.indexOf('THIRD-PARTY NOTICES'));
    expect(notices.startsWith('THIRD-PARTY NOTICES')).toBe(true);
    // Image codec (Apache-2.0), MCP SDK and zod (MIT): each one's license text.
    expect(notices).toContain('@jsquash/png');
    // The QuickJS executor of the format plugins (MIT) and its core.
    expect(notices).toContain('@jitl/quickjs-wasmfile-release-sync');
    expect(notices).toContain('quickjs-emscripten-core');
    expect(notices).toContain('Apache License');
    expect(notices).toContain('@modelcontextprotocol/sdk');
    expect(notices).toContain('Permission is hereby granted, free of charge');
  });

  it('embeds the QuickJS .wasm of the format plugins (bytes in the file, no .wasm beside it)', () => {
    const wasm = readFileSync(
      createRequire(import.meta.url).resolve('@jitl/quickjs-wasmfile-release-sync/wasm'),
    );
    // The first 48 bytes of the module as base64 (64 characters, no padding): how esbuild embeds it.
    const start = wasm.subarray(0, 48).toString('base64');
    expect(readFileSync(bundle, 'utf8')).toContain(start);
    expect(readdirSync('dist-mcp').filter((name) => name.endsWith('.wasm'))).toEqual([]);
  });

  it('runs a plugin in QuickJS from the bundle alone, with no node_modules around it', () => {
    const folder = mkdtempSync(join(tmpdir(), 'mapping-bundle-'));
    try {
      copyFileSync(bundle, join(folder, 'mapping-mcp.js'));
      const out = execFileSync(
        process.execPath,
        [join(folder, 'mapping-mcp.js'), '--check-plugin-runner'],
        {
          cwd: folder,
        },
      ).toString();
      expect(out).toMatch(/^plugin runner: ok \(QuickJS, \d+ ms\)\n$/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('carries the notices of harfbuzzjs and of HarfBuzz itself (Old MIT, from the version the wasm reports)', () => {
    const text = readFileSync(bundle, 'utf8');
    const notices = text.slice(text.indexOf('THIRD-PARTY NOTICES'));
    expect(notices).toContain('== harfbuzzjs ==');
    const copying = readFileSync('mcp/licenses/harfbuzz.txt', 'utf8').trim();
    expect(copying).toContain('"Old MIT" license');
    expect(notices).toContain('== HarfBuzz (WebAssembly in harfbuzzjs) ==');
    expect(notices).toContain(copying);
  });

  it('patches the HarfBuzz glue for CommonJS: the bundle URL replaces import.meta.url', () => {
    const text = readFileSync(bundle, 'utf8');
    expect(text).toContain('harfbuzzBundleUrl');
    expect(text).not.toMatch(/"harfbuzz\.wasm",\s*import\.meta\.url/);
  });

  it('starts over stdio and answers list_projects', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bundle, '--root', 'design/mapeamentos'],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(transport);
    try {
      const result = await client.callTool({ name: 'list_projects', arguments: {} });
      const text = (result.content as { type: string; text: string }[])[0]!.text;
      expect(JSON.parse(text)).toMatchObject({
        roots: [resolve('design/mapeamentos')],
        projects: [],
      });
    } finally {
      await client.close();
    }
  });

  it('without --root it ends with a usage error on stderr and nothing on stdout', () => {
    let failure: { status: number | null; stdout: Buffer; stderr: Buffer } | null = null;
    try {
      execFileSync(process.execPath, [bundle], { stdio: 'pipe' });
    } catch (error) {
      failure = error as { status: number | null; stdout: Buffer; stderr: Buffer };
    }
    expect(failure?.status).toBe(2);
    expect(failure?.stdout.toString()).toBe('');
    expect(failure?.stderr.toString()).toContain('--root');
  });

  it('--version prints the version', () => {
    const out = execFileSync(process.execPath, [bundle, '--version']).toString();
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
