import { mkdirSync, mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serialize } from '../../src/model';
import { createServer } from '../../mcp/server';
import {
  COMPONENTS,
  FIXTURE,
  slotsProject,
  specText,
  type Placer,
  type SlotsOptions,
} from './slotsProject';

// A project folder on disk with the `tests/fixtures/slots` library applied and a few component markings, served
// by an in-memory MCP server (stage #1080, SL4).

export { FIXTURE, SCREEN, SPEC_ID, slotsProject, slotsLibrary } from './slotsProject';
export type { Placer, SlotsOptions } from './slotsProject';

export interface Workspace {
  base: string;
  dir: string;
  client: Client;
}

export async function slotsWorkspace(
  fill: (add: Placer) => void,
  options: SlotsOptions = {},
): Promise<Workspace> {
  const base = mkdtempSync(join(tmpdir(), 'mapping-drawing-issues-'));
  const dir = join(base, 'slots');
  const lib = join(dir, 'specs', 'slots');
  mkdirSync(join(lib, 'components'), { recursive: true });
  writeFileSync(join(lib, 'slots.spec.json'), specText(options));
  for (const [path, text] of Object.entries(options.files ?? {})) {
    mkdirSync(dirname(join(lib, path)), { recursive: true });
    writeFileSync(join(lib, path), text);
  }
  for (const id of COMPONENTS) {
    cpSync(
      join(FIXTURE, 'components', `${id}.json`),
      join(lib, 'components', `${id}.json`),
    );
  }
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'screen.png'), Buffer.from([0]));
  writeFileSync(join(dir, 'mapping.json'), serialize(slotsProject(fill, options)));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { base, dir, client };
}
