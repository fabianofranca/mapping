import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../mcp/server';

describe('servidor MCP (em memória)', () => {
  it('anuncia as tools e, com raízes inexistentes, lista só as raízes', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer({ roots: ['/raiz/a', '/raiz/b'] }).connect(serverSide);
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(clientSide);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain('list_projects');

    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(JSON.parse(text)).toEqual({
      roots: ['/raiz/a', '/raiz/b'],
      missingRoots: ['/raiz/a', '/raiz/b'],
      projects: [],
    });
    await client.close();
  });
});
