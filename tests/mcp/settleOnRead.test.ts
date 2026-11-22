import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../mcp/server';
import { serialize } from '../../src/model';
import { sampleProject } from '../model/fixtures';

// Decisions 6 and 7 of #1971: the MCP reads `mapping.json` through the same settling read as the
// app. `get_marking` of a hand-edited `M2` (inside `M1` by geometry, `parentId` edited to null)
// gives `M1` as its parent.

let base: string;
let client: Client;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-settle-read-'));
  const dir = join(base, 'edited');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'lateral.jpg'), Buffer.from([0]));
  writeFileSync(join(dir, 'images', 'frente.jpg'), Buffer.from([0]));
  const json = JSON.parse(serialize(sampleProject())) as {
    markings: { id: string; parentId: string | null }[];
  };
  const m2 = json.markings.find((m) => m.id === 'M2');
  if (!m2) throw new Error('fixture');
  m2.parentId = null;
  writeFileSync(join(dir, 'mapping.json'), JSON.stringify(json, null, 2));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client?.close();
  rmSync(base, { recursive: true, force: true });
});

async function getMarking(id: string): Promise<Record<string, unknown>> {
  const result = (await client.callTool({
    name: 'get_marking',
    arguments: { ref: `mapping://edited/m/${id}` },
  })) as { content: { type: string; text: string }[] };
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('MCP read settles the project', () => {
  it('get_marking of the hand-edited marking gives the parent by geometry', async () => {
    const m2 = await getMarking('M2');
    const m1 = await getMarking('M1');
    expect(m2.parent).toBeTruthy();
    expect(m2.parent).toBe(m1.ref);
  });
});
