import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serialize } from '../../src/model';
import { createServer } from '../../mcp/server';
import {
  A11Y_COMPONENTS,
  A11Y_FIXTURE,
  A11Y_SPEC_ID,
  a11yMcpProject,
  a11ySpecText,
  type A11yOptions,
  type A11yPlacer,
  type A11yPlainPlacer,
  type A11yRowsPlacer,
} from './a11yProject';

// A project folder on disk with the `tests/fixtures/accessibility` library applied and the markings a test places,
// served by an in-memory MCP server (stage #1128, A3). The project itself is `a11yProject.ts` (pure).

export { A11Y_SCREEN, A11Y_SPEC_ID, withAndroid } from './a11yProject';
export type { A11yOptions } from './a11yProject';

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface A11yWorkspace {
  base: string;
  dir: string;
  client: Client;
}

export async function a11yWorkspace(
  fill: (add: A11yPlacer, plain: A11yPlainPlacer, rows: A11yRowsPlacer) => void,
  options: A11yOptions = {},
): Promise<A11yWorkspace> {
  const base = mkdtempSync(join(tmpdir(), 'mapping-a11y-'));
  const dir = join(base, 'a11y');
  const lib = join(dir, 'specs', A11Y_SPEC_ID);
  mkdirSync(join(lib, 'components'), { recursive: true });
  writeFileSync(join(lib, 'accessibility.spec.json'), a11ySpecText(options));
  for (const id of A11Y_COMPONENTS) {
    const to = join(lib, 'components', `${id}.json`);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(A11Y_FIXTURE, 'components', `${id}.json`), to);
  }
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'screen.png'), Buffer.from([0]));
  writeFileSync(join(dir, 'mapping.json'), serialize(a11yMcpProject(fill, options)));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { base, dir, client };
}

/** Calls a tool and parses its JSON answer. */
export async function a11yCall(
  ws: A11yWorkspace,
  name: string,
  args: Record<string, unknown>,
): Promise<Doc> {
  const result = await ws.client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  return JSON.parse(text) as Doc;
}
