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

// Achado 5 do CL2: o desenho do seguidor lê o alvo por `$anchor.*`; quando só o ALVO muda no lote,
// o seguidor entra na prova de desenho (antes ficava de fora e o `component-overflow` sumia).

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
        { id: 'seta', name: 'Seta', component: 'components/seta.json', fields: [] },
      ],
    },
  ],
};

/** Uma barra com a largura da âncora (30 sem âncora) numa fileira de 120: estoura se o alvo for largo. */
const setaComponent = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'seta',
  name: 'seta',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    name: 'seta',
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
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  writeFileSync(join(lib, 'components', 'seta.json'), JSON.stringify(setaComponent));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 800, height: 600 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
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
        as: '$seta',
        container: PHOTO,
        rect: { x: 300, y: 300, width: 120, height: 40 },
        annotation: { type: 'lib/seta' },
        anchor: { to: '$alvo' },
      },
    ],
    {
      readSource: () => Promise.reject(new Error('sem arquivos')),
      readSpecInput: () => Promise.reject(new Error('sem arquivos')),
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
      project: 'telas',
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

describe('prova de desenho: só o alvo da âncora muda', () => {
  it('alargar o alvo para 300 faz o seguidor avisar component-overflow', async () => {
    expect(await overflowsAfterResizingTarget(300)).toEqual(['component-overflow']);
  });

  it('o alvo de 60 não faz o seguidor estourar', async () => {
    expect(await overflowsAfterResizingTarget(60)).toEqual([]);
  });
});
