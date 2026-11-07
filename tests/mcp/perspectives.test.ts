import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  addLayer,
  buildPerspective,
  createMarking,
  createProject,
  serialize,
  type Project,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { hashOf, ok, errorOf } from './proposalSupport';
import { codeOf, connect, PNG_1X1, uuidFor, type Connection } from './workspace';

// Perspectivas pelo MCP (etapa #659, PE4): o servidor só lê. `get_project` traz o resumo e as
// marcas de chegada, `get_perspective` as raízes com a posição, `get_marking` e `get_container`
// dizem em que perspectivas a raiz aparece, e um projeto v15 é lido como v16 sem ser regravado.

const id = (name: string) => uuidFor(name, 'persp:');

interface PerspectiveSummary {
  id: string;
  name: string;
  roots: number;
  hiddenLayers: { id: string; name: string }[];
}
interface Arrival {
  root: string;
  name: string | null;
  from: string;
  fromName: string;
  perspectiveExists: boolean;
}
interface ProjectData {
  schemaVersion: number;
  migratedFrom?: number;
  perspectives: PerspectiveSummary[];
  arrivals: Arrival[];
}
interface PerspectiveData {
  id: string;
  name: string;
  hiddenLayers: { id: string; name: string }[];
  roots: {
    ref: string;
    kind: 'container' | 'marking';
    name: string | null;
    x: number;
    y: number;
  }[];
  missing: string[];
}
interface WherePerspectives {
  root: string;
  perspectives: { id: string; name: string; x: number; y: number }[];
}

let base: string;
let mcp: Connection;
let dir: string;
let mappingPath: string;

/** Dois containers e uma flutuante; "Analytics" mostra uma tela e a flutuante, esconde "Dados". */
function sample(): Project {
  let p = createProject({
    name: 'Perspectivas',
    now: NOW,
    firstLayer: { id: id('L1'), name: 'Camada 1', color: '#D32F2F' },
  });
  p = addLayer(p, { id: id('L2'), name: 'Dados', color: '#1976D2' });
  p = addContainer(p, { id: id('C1'), file: 'images/a.png', width: 100, height: 100 });
  p = addContainer(p, { id: id('C2'), file: 'images/b.png', width: 100, height: 100 });
  p = createMarking(p, {
    id: id('M1'),
    containerId: id('C1'),
    rect: { x: 5, y: 5, width: 20, height: 20 },
    name: 'Botão',
  });
  p = createMarking(p, {
    id: id('F1'),
    containerId: null,
    floating: true,
    rect: { x: 900, y: 40, width: 80, height: 30 },
    name: 'Tabela',
  });
  const withRoots = buildPerspective(p, {
    id: id('P1'),
    name: 'Analytics',
    startFrom: null,
    hiddenLayers: [id('L2')],
  });
  return {
    ...p,
    perspectives: [
      {
        ...withRoots,
        items: [
          { root: id('C1'), x: 1200, y: 40 },
          { root: id('F1'), x: 1480, y: 260 },
        ],
      },
    ],
    arrivals: [{ root: id('F1'), from: id('P1'), fromName: 'Analytics' }],
  };
}

function writeProject(target: string, text: string): void {
  mkdirSync(join(target, 'images'), { recursive: true });
  writeFileSync(join(target, 'mapping.json'), text);
  writeFileSync(join(target, 'images', 'a.png'), PNG_1X1);
  writeFileSync(join(target, 'images', 'b.png'), PNG_1X1);
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-perspectives-'));
  dir = join(base, 'persp');
  mappingPath = join(dir, 'mapping.json');
  writeProject(dir, serialize(sample()));

  // O mesmo projeto como a v15 o gravava: sem `project.id`, `perspectives` e `arrivals`.
  const old = JSON.parse(serialize(sample())) as Record<string, unknown>;
  old.schemaVersion = 15;
  delete old.perspectives;
  delete old.arrivals;
  delete (old.project as Record<string, unknown>).id;
  writeProject(join(base, 'v15'), `${JSON.stringify(old, null, 2)}\n`);

  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('get_project', () => {
  it('resume as perspectivas e traz as marcas de chegada', async () => {
    const data = ok(await mcp.call<ProjectData>('get_project', { project: 'persp' }));
    expect(data.schemaVersion).toBe(17);
    expect(data.perspectives).toEqual([
      {
        id: id('P1'),
        name: 'Analytics',
        roots: 2,
        hiddenLayers: [{ id: id('L2'), name: 'Dados' }],
      },
    ]);
    expect(data.arrivals).toEqual([
      {
        root: `mapping://persp/m/${codeOf(id('F1'))}`,
        name: 'Tabela',
        from: id('P1'),
        fromName: 'Analytics',
        perspectiveExists: true,
      },
    ]);
  });

  it('projeto v15 é lido como v16, sem listas e sem regravar o arquivo', async () => {
    const path = join(base, 'v15', 'mapping.json');
    const before = hashOf(path);
    const data = ok(await mcp.call<ProjectData>('get_project', { project: 'v15' }));
    expect(data).toMatchObject({ schemaVersion: 17, migratedFrom: 15 });
    expect(data.perspectives).toEqual([]);
    expect(data.arrivals).toEqual([]);
    expect(hashOf(path)).toBe(before);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ schemaVersion: 15 });
  });
});

describe('get_perspective', () => {
  it('traz as raízes com a posição e as camadas escondidas', async () => {
    const data = ok(
      await mcp.call<PerspectiveData>('get_perspective', {
        project: 'persp',
        id: id('P1'),
      }),
    );
    expect(data).toMatchObject({
      id: id('P1'),
      name: 'Analytics',
      hiddenLayers: [{ id: id('L2'), name: 'Dados' }],
    });
    expect(data.roots).toEqual([
      {
        ref: `mapping://persp/i/${codeOf(id('C1'))}`,
        kind: 'container',
        name: null,
        x: 1200,
        y: 40,
      },
      {
        ref: `mapping://persp/m/${codeOf(id('F1'))}`,
        kind: 'marking',
        name: 'Tabela',
        x: 1480,
        y: 260,
      },
    ]);
  });

  it('aceita o nome da perspectiva, sem diferença de caixa', async () => {
    const data = ok(
      await mcp.call<PerspectiveData>('get_perspective', {
        project: 'persp',
        id: 'analytics',
      }),
    );
    expect(data.id).toBe(id('P1'));
  });

  it('id que não existe falha com not-found e a dica das perspectivas', async () => {
    const error = errorOf(
      await mcp.call('get_perspective', { project: 'persp', id: 'nao-existe' }),
    );
    expect(error.code).toBe('not-found');
    expect(String((error as { hint?: string }).hint)).toContain('get_project');
  });
});

describe('get_marking e get_container', () => {
  it('a flutuante diz em que perspectivas a raiz dela aparece', async () => {
    const data = ok(
      await mcp.call<WherePerspectives>('get_marking', {
        ref: `mapping://persp/m/${codeOf(id('F1'))}`,
      }),
    );
    expect(data.perspectives).toEqual([
      { id: id('P1'), name: 'Analytics', x: 1480, y: 260 },
    ]);
  });

  it('uma marcação dentro do container segue a raiz do container', async () => {
    const data = ok(
      await mcp.call<WherePerspectives>('get_marking', {
        ref: `mapping://persp/m/${codeOf(id('M1'))}`,
      }),
    );
    expect(data.root).toBe(`mapping://persp/i/${codeOf(id('C1'))}`);
    expect(data.perspectives).toEqual([
      { id: id('P1'), name: 'Analytics', x: 1200, y: 40 },
    ]);
  });

  it('o container que nenhuma perspectiva mostra traz a lista vazia', async () => {
    const data = ok(
      await mcp.call<WherePerspectives>('get_container', {
        ref: `mapping://persp/i/${codeOf(id('C2'))}`,
      }),
    );
    expect(data.perspectives).toEqual([]);
  });

  it('o container diz a posição dele na perspectiva', async () => {
    const data = ok(
      await mcp.call<WherePerspectives>('get_container', {
        ref: `mapping://persp/i/${codeOf(id('C1'))}`,
      }),
    );
    expect(data.perspectives).toEqual([
      { id: id('P1'), name: 'Analytics', x: 1200, y: 40 },
    ]);
  });
});

describe('o MCP nunca grava perspectivas', () => {
  it('nenhuma leitura muda o mapping.json', async () => {
    const before = hashOf(mappingPath);
    for (const [name, args] of [
      ['get_project', { project: 'persp' }],
      ['get_perspective', { project: 'persp', id: id('P1') }],
      ['get_marking', { ref: `mapping://persp/m/${codeOf(id('F1'))}` }],
      ['get_container', { ref: `mapping://persp/i/${codeOf(id('C1'))}` }],
    ] as const) {
      expect((await mcp.call(name, args)).isError, name).toBe(false);
    }
    expect(hashOf(mappingPath)).toBe(before);
  });

  it('get_perspective é só leitura nas anotações da tool', async () => {
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((t) => t.name === 'get_perspective');
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });
});
