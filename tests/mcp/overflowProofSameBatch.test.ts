import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addContainer, createProject, serialize } from '../../src/model';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// A prova de desenho usa o catálogo DEPOIS do lote: um componente aplicado no mesmo lote do
// plan_changes (apply_specialization) também avisa `component-overflow`, como em duas etapas.

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
        { id: 'chip', name: 'Chip', component: 'components/chip.json', fields: [] },
      ],
    },
  ],
};

const chipComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'chip',
  name: 'chip',
  size: { width: 87, height: 40 },
  template: {
    type: 'frame',
    name: 'chip',
    layout: { type: 'none' },
    children: [
      {
        type: 'frame',
        name: 'miolo',
        width: 'hug',
        height: 'hug',
        anchors: { centerX: true, centerY: true },
        layout: { type: 'row', padding: [0, 24] },
        children: [{ type: 'rect', name: 'barra', width: 39, height: 36 }],
      },
    ],
  },
};

let base: string;
let client: Client;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-overflow-batch-'));
  const dir = join(base, 'telas');
  const lib = join(base, 'biblioteca');
  mkdirSync(join(dir, 'images'), { recursive: true });
  mkdirSync(join(lib, 'components'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'chip.json'), JSON.stringify(chipComponent));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 400, height: 300 });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

async function plan(operations: unknown[]) {
  const result = await client.callTool({
    name: 'plan_changes',
    arguments: { project: 'telas', operations },
  });
  const text = (result.content as { text: string }[])[0]!.text;
  return JSON.parse(text) as {
    errors?: unknown;
    issues?: { new?: { issues: { code: string; node?: string }[] }[] };
  };
}

const overflowCodes = (reply: Awaited<ReturnType<typeof plan>>) =>
  (reply.issues?.new ?? []).flatMap((e) =>
    e.issues.filter((i) => i.code === 'component-overflow').map((i) => i.node),
  );

const APPLY = { op: 'apply_specialization', file: join('biblioteca') };
const SCREEN = {
  op: 'add_container',
  as: '$tela',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};
const chip = (width: number) => ({
  op: 'create_marking',
  as: '$m',
  container: '$tela',
  rect: { x: 10, y: 10, width, height: 40 },
  annotation: { type: 'lib/chip' },
});

describe('prova de desenho com a biblioteca aplicada no mesmo lote', () => {
  it('apply_specialization + chip 58×40 no mesmo lote avisa component-overflow', async () => {
    const reply = await plan([
      { ...APPLY, file: join(base, 'biblioteca') },
      SCREEN,
      chip(58),
    ]);
    expect(reply.errors).toBeUndefined();
    expect(overflowCodes(reply)).toEqual(['chip']);
  });

  it('o mesmo lote com 87×40 não avisa', async () => {
    const reply = await plan([
      { ...APPLY, file: join(base, 'biblioteca') },
      SCREEN,
      chip(87),
    ]);
    expect(reply.errors).toBeUndefined();
    expect(overflowCodes(reply)).toEqual([]);
  });
});
