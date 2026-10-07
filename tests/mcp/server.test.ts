import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/model';
import { createServer } from '../../mcp/server';

describe('servidor MCP (em memória)', () => {
  it('anuncia list_projects e responde com as raízes e nenhum projeto', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer({ roots: ['/raiz/a', '/raiz/b'] }).connect(serverSide);
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(clientSide);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['list_projects']);

    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(result.structuredContent).toEqual({
      roots: ['/raiz/a', '/raiz/b'],
      projects: [],
      schemaVersion: SCHEMA_VERSION,
    });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(text)).toEqual(result.structuredContent);
    await client.close();
  });
});
