import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createArrow,
  createMarking,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { prepareBatch, sha256 } from '../../mcp/changes';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// Etapa #965, fase 2 (CRM-MCP2): defeitos low de `mcp/batch.ts` e `mcp/changes.ts` (achados 10 a
// 13 do CR do MCP). Cada caso falhou antes da correção.

// Conta as leituras de `mapping.json` (achado 13) sem mudar o resultado.
const mappingReads = vi.hoisted(() => ({ count: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = ((...args: Parameters<typeof original.readFile>) => {
    if (String(args[0]).endsWith('mapping.json')) mappingReads.count += 1;
    return original.readFile(...args);
  }) as typeof original.readFile;
  return { ...original, default: { ...original, readFile }, readFile };
});

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const CONTAINER = 'dddddddd-0000-4000-8000-000000000001';

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
        {
          id: 'modelo',
          name: 'Modelo',
          fields: [
            { key: 'titulo', type: 'string' },
            {
              key: 'campos',
              type: 'table',
              columns: [{ key: 'nome', type: 'string' }],
            },
          ],
        },
      ],
    },
  ],
};

let base: string;
let roots: Roots;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mapping-batchfixes-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(lib, { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`spec inválida: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: CONTAINER,
    file: 'images/foto.png',
    width: 400,
    height: 300,
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  writeFileSync(join(dir, 'images', 'foto.png'), Buffer.from([0]));
  roots = new Roots([dir]);
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

const io = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

async function run(operations: unknown[]) {
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
  return runBatch(loaded, operations as Operation[], io);
}

describe('achado 10: update_arrow na revisão', () => {
  const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
  const ARROW = 'eeeeeeee-0000-4000-8000-00000000000e';

  const withArrow = (p: Parameters<typeof createMarking>[0]) => {
    const rect = (x: number) => ({ x, y: 10, width: 50, height: 50 });
    let next = createMarking(p, { id: A, containerId: CONTAINER, rect: rect(10) });
    next = createMarking(next, { id: B, containerId: CONTAINER, rect: rect(100) });
    return createArrow(next, { id: ARROW, from: A, to: B });
  };

  it('seta criada pela própria proposta (a revisão parte do proposto) não avisa', async () => {
    const location = await findProject(roots, 'telas');
    const prepared = await prepareBatch(
      roots,
      location,
      [{ op: 'update_arrow', arrow: ARROW, name: 'explica' }] as Operation[],
      { now: () => Date.parse(NOW), startFrom: withArrow },
    );
    expect(prepared.result.errors).toEqual([]);
    expect(prepared.result.deprecations).toEqual([]);
  });

  it('seta que já está no projeto lido continua avisando', async () => {
    const dir = join(base, 'telas');
    const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
    const loaded = await loadProject(roots, await findProject(roots, 'telas'));
    writeFileSync(join(dir, 'mapping.json'), serialize(withArrow(loaded.project)));
    try {
      const prepared = await prepareBatch(
        roots,
        await findProject(roots, 'telas'),
        [{ op: 'update_arrow', arrow: ARROW, name: 'explica' }] as Operation[],
        { now: () => Date.parse(NOW) },
      );
      expect(prepared.result.deprecations).toEqual([
        expect.objectContaining({ code: 'ignored-argument', index: 0 }),
      ]);
    } finally {
      writeFileSync(join(dir, 'mapping.json'), text);
    }
  });
});

describe('achado 11: apelido da operação igual a um _as de linha', () => {
  const marking = (extra: object) => ({
    op: 'create_marking',
    container: '$tela',
    rect: { x: 10, y: 10, width: 50, height: 50 },
    annotation: {
      type: 'lib/modelo',
      values: { titulo: 'M', campos: [{ _as: '$r1', nome: 'cpf' }] },
    },
    ...extra,
  });
  const screen = {
    op: 'add_container',
    as: '$tela',
    width: 400,
    height: 300,
    background: '#FFFFFF',
  };

  it('o as da operação repetido num _as da mesma operação dá duplicate-alias', async () => {
    const result = await run([screen, marking({ as: '$r1' })]);
    expect(result.errors.map((e) => e.code)).toEqual(['duplicate-alias']);
    expect(result.errors[0]!.index).toBe(1);
  });

  it('o annotationAs igual a um _as também', async () => {
    const result = await run([screen, marking({ annotationAs: '$r1' })]);
    expect(result.errors.map((e) => e.code)).toEqual(['duplicate-alias']);
  });

  it('apelidos diferentes seguem funcionando', async () => {
    const result = await run([screen, marking({ as: '$m', annotationAs: '$a' })]);
    expect(result.errors).toEqual([]);
    expect([...result.aliases.keys()].sort()).toEqual(['$a', '$m', '$r1', '$tela']);
  });
});

describe('achado 13: mapping.json lido uma vez por chamada', () => {
  beforeEach(() => {
    mappingReads.count = 0;
  });

  it('prepareBatch lê o mapping.json uma só vez e o hash é do texto usado', async () => {
    const location = await findProject(roots, 'telas');
    mappingReads.count = 0;
    const prepared = await prepareBatch(roots, location, [], {
      now: () => Date.parse(NOW),
    });
    expect(mappingReads.count).toBe(1);
    const text = readFileSync(join(base, 'telas', 'mapping.json'), 'utf8');
    expect(prepared.baseHash).toBe(sha256(text));
  });
});

describe('mapping.json grande demais', () => {
  it('prepareBatch recusa com file-too-large antes de ler o arquivo', async () => {
    const big = join(base, 'grande');
    mkdirSync(big);
    writeFileSync(join(big, 'mapping.json'), '{}');
    truncateSync(join(big, 'mapping.json'), 64 * 1024 * 1024 + 1);
    const both = new Roots([join(base, 'telas'), big]);
    const location = { ...(await findProject(roots, 'telas')), dir: big };
    await expect(
      prepareBatch(both, location, [], { now: () => Date.parse(NOW) }),
    ).rejects.toMatchObject({ code: 'file-too-large' });
  });
});
