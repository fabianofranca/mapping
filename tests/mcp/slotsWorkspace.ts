import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createProject,
  loadSpecComponents,
  parseSpecText,
  serialize,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// A project folder on disk with the `tests/fixtures/slots` library applied and a few component markings, served
// by an in-memory MCP server (stage #1080, SL4).

export const FIXTURE = 'tests/fixtures/slots';
export const SPEC_ID = 'slots';
export const SCREEN = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const COMPONENTS = ['bar', 'pin', 'rounded-bar'];

export interface Workspace {
  base: string;
  dir: string;
  client: Client;
}

export type Placer = (
  id: string,
  typeId: string,
  extra?: Partial<NewComponentArgs>,
) => void;

/** The empty project with the library applied; `fill` adds the markings (ids `mk-<id>`, annotations `an-<id>`). */
export function slotsProject(fill: (add: Placer) => void): Project {
  const parsed = parseSpecText(readFileSync(join(FIXTURE, 'slots.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  const texts = new Map(
    COMPONENTS.map((id) => [
      `specs/slots/components/${id}.json`,
      readFileSync(join(FIXTURE, 'components', `${id}.json`), 'utf8'),
    ]),
  );
  const catalog = new Map([
    [
      SPEC_ID,
      loadSpecComponents(parsed.spec, 'specs/slots/slots.spec.json', 1, (path) =>
        texts.get(path),
      ),
    ],
  ]);
  let p = createProject({
    name: 'Slots',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: SCREEN,
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'slots.spec.json' });
  const add = (id: string, typeId: string, extra: Partial<NewComponentArgs> = {}) => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: `mk-${id}`,
        annotationId: `an-${id}`,
        containerId: SCREEN,
        parentId: null,
        specId: SPEC_ID,
        typeId,
        ...extra,
      },
      approximateMeasurer,
    );
  };
  fill(add);
  return p;
}

export async function slotsWorkspace(fill: (add: Placer) => void): Promise<Workspace> {
  const base = mkdtempSync(join(tmpdir(), 'mapping-drawing-issues-'));
  const dir = join(base, 'slots');
  const lib = join(dir, 'specs', 'slots');
  mkdirSync(join(lib, 'components'), { recursive: true });
  cpSync(join(FIXTURE, 'slots.spec.json'), join(lib, 'slots.spec.json'));
  for (const id of COMPONENTS) {
    cpSync(
      join(FIXTURE, 'components', `${id}.json`),
      join(lib, 'components', `${id}.json`),
    );
  }
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'screen.png'), Buffer.from([0]));
  writeFileSync(join(dir, 'mapping.json'), serialize(slotsProject(fill)));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { base, dir, client };
}
