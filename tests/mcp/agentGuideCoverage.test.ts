// Stage #680, phase IA1: the agent guide cites, in backticks, every server tool and every batch `op`.
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

/** The batch `op`s, read from the schema (the `z.literal`s of `mcp/operations.ts`). */
function operationNames(): string[] {
  return operationSchema.options.map((option) => String(option.shape.op.value));
}

describe('agent guide × MCP', () => {
  it('every tool of listTools() appears in backticks in AGENT-GUIDE.md', async () => {
    const names = await toolNames();
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !quoted(name))).toEqual([]);
  });

  it('every batch op of propose_changes and plan_changes appears in backticks in AGENT-GUIDE.md', () => {
    const names = operationNames();
    expect(names.length).toBeGreaterThan(20);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => !quoted(name))).toEqual([]);
  });
});
