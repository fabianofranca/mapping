// Etapa #680, fase IA1: o guia do agente cita, entre crases, toda tool do servidor e todo `op` do lote.
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { operationSchema } from '../../mcp/operations';
import { createServer } from '../../mcp/server';

const GUIDE = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
const quoted = (name: string): boolean => GUIDE.includes(`\`${name}\``);

async function toolNames(): Promise<string[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [] }).connect(serverSide);
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => tool.name);
}

/** Os `op` do lote, lidos do schema (os `z.literal` de `mcp/operations.ts`). */
function operationNames(): string[] {
  return operationSchema.options.map((option) => String(option.shape.op.value));
}

describe('guia do agente × MCP', () => {
  it('toda tool de listTools() aparece entre crases no AGENT-GUIDE.md', async () => {
    const names = await toolNames();
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !quoted(name))).toEqual([]);
  });

  it('todo op do lote do propose_changes e do plan_changes aparece entre crases no AGENT-GUIDE.md', () => {
    const names = operationNames();
    expect(names.length).toBeGreaterThan(20);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => !quoted(name))).toEqual([]);
  });
});
