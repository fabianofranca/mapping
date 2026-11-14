import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// CL2 finding 5: the follower's drawing reads the target through `$anchor.*`; when only the TARGET changes in the batch,
// the follower enters the drawing proof (before it was left out and the `component-overflow` disappeared).

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';

const spec = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'arrow', name: 'Arrow', component: 'components/arrow.json', fields: [] },
      ],
    },
  ],
};

/** A bar with the anchor's width (30 without an anchor) in a row of 120: it overflows if the target is wide. */
const arrowComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'arrow',
  name: 'arrow',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    name: 'arrow',
    layout: { type: 'row' },
    children: [
      {
        type: 'rect',
        name: 'barra',
        width: { $field: '$anchor.width', default: 30 },
        height: 10,
        fill: '#000000',
      },
    ],
  },
};

let base: string;
let client: Client;
let targetId = '';

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-overflow-anchor-'));
  const dir = join(base, 'screens');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'arrow.json'), JSON.stringify(arrowComponent));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 800, height: 600 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
  const loaded = await loadProject(roots, await findProject(roots, 'screens'));
  const result = await runBatch(
    loaded,
    [
      {
        op: 'create_marking',
        as: '$alvo',
        container: PHOTO,
        rect: { x: 10, y: 10, width: 50, height: 40 },
      },
      {
        op: 'create_marking',
        as: '$arrow',
        container: PHOTO,
        rect: { x: 300, y: 300, width: 120, height: 40 },
        annotation: { type: 'lib/arrow' },
        anchor: { to: '$alvo' },
      },
    ],
    {
      readSource: () => Promise.reject(new Error('no files')),
      readSpecInput: () => Promise.reject(new Error('no files')),
      takenImageFiles: new Set<string>(),
      now: () => new Date(NOW),
    },
  );
  expect(result.errors).toEqual([]);
  targetId = result.project.markings.find((m) => m.anchor === undefined)?.id ?? '';
  expect(targetId).not.toBe('');
  writeFileSync(join(dir, 'mapping.json'), serialize(result.project));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

async function overflowsAfterResizingTarget(width: number): Promise<string[]> {
  const result = await client.callTool({
    name: 'plan_changes',
    arguments: {
      project: 'screens',
      operations: [
        {
          op: 'update_marking',
          marking: targetId,
          rect: { x: 10, y: 10, width, height: 40 },
        },
      ],
    },
  });
  const data = JSON.parse((result.content as { text: string }[])[0]!.text) as {
    errors?: unknown;
    issues?: { new?: { issues: { code: string }[] }[] };
  };
  expect(data.errors).toBeUndefined();
  return (data.issues?.new ?? []).flatMap((e) =>
    e.issues.filter((i) => i.code === 'component-overflow').map((i) => i.code),
  );
}

describe('drawing proof: only the anchor target changes', () => {
  it('widening the target to 300 makes the follower warn component-overflow', async () => {
    expect(await overflowsAfterResizingTarget(300)).toEqual(['component-overflow']);
  });

  it('a target of 60 does not make the follower overflow', async () => {
    expect(await overflowsAfterResizingTarget(60)).toEqual([]);
  });
});
