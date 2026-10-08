import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const bundle = resolve('dist-mcp/mapping-mcp.js');

describe('dist-mcp/mapping-mcp.js (arquivo único, por stdio)', () => {
  it('gera o arquivo único', () => {
    expect(statSync(bundle).isFile()).toBe(true);
  });

  it('inicia por stdio e responde list_projects', async () => {
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

  it('sem --root termina com erro de uso no stderr e sem nada no stdout', () => {
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

  it('--version imprime a versão', () => {
    const out = execFileSync(process.execPath, [bundle, '--version']).toString();
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
