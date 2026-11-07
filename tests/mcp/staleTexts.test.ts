// Etapa #680, fase CORR: textos embutidos no servidor e na ajuda que ficaram para trás.
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

describe('textos desatualizados', () => {
  it('a descrição do FORMAT.md cita o SCHEMA_VERSION atual', () => {
    const doc = DOC_RESOURCES.find((d) => d.name === 'format');
    expect(doc?.description).toContain(`schema v${SCHEMA_VERSION})`);
  });

  it('a descrição do SPEC-FORMAT.md cita a faixa de formatVersion atual', () => {
    const doc = DOC_RESOURCES.find((d) => d.name === 'spec-format');
    expect(doc?.description).toContain(`formatVersion 1 a ${SPEC_FORMAT_VERSION}`);
  });

  it('validate_specialization cita todos os códigos de aviso de specWarnings.ts', async () => {
    const source = readFileSync('src/model/specWarnings.ts', 'utf8');
    const codes = [...source.matchAll(/^\s*\| '([a-z-]+)'/gm)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThanOrEqual(8);
    const description = await toolDescription('validate_specialization');
    for (const code of codes) expect(description, code).toContain(code);
  });
});
