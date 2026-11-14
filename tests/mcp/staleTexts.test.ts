// Stage #680, phase CORR: texts embedded in the server and in the help that were left behind.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { DOC_RESOURCES } from '../../mcp/docs';
import { createServer } from '../../mcp/server';
import { SCHEMA_VERSION } from '../../src/model/types';
import { SPEC_FORMAT_VERSION } from '../../src/model/spec';

async function toolDescription(name: string): Promise<string> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [] }).connect(serverSide);
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  return tools.find((tool) => tool.name === name)?.description ?? '';
}

describe('stale texts', () => {
  it('the FORMAT.md description cites the current SCHEMA_VERSION', () => {
    const doc = DOC_RESOURCES.find((d) => d.name === 'format');
    expect(doc?.description).toContain(`schema v${SCHEMA_VERSION})`);
  });

  it('the SPEC-FORMAT.md description cites the current formatVersion range', () => {
    const doc = DOC_RESOURCES.find((d) => d.name === 'spec-format');
    expect(doc?.description).toContain(`formatVersion 1 to ${SPEC_FORMAT_VERSION}`);
  });

  it('validate_specialization cites all the warning codes of specWarnings.ts', async () => {
    const source = readFileSync('src/model/specWarnings.ts', 'utf8');
    const codes = [...source.matchAll(/^\s*\| '([a-z-]+)'/gm)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThanOrEqual(8);
    const description = await toolDescription('validate_specialization');
    for (const code of codes) expect(description, code).toContain(code);
  });
});
