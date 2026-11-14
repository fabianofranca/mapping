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

// Stage #965, phase 2 (CRM-MCP2): low defects of `mcp/batch.ts` and `mcp/changes.ts` (findings 10 to
// 13 of the MCP CR). Each case failed before the fix.

// Counts the reads of `mapping.json` (finding 13) without changing the result.
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
  const dir = join(base, 'screens');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(lib, { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(spec));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
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
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

async function run(operations: unknown[]) {
  const loaded = await loadProject(roots, await findProject(roots, 'screens'));
  return runBatch(loaded, operations as Operation[], io);
}

describe('finding 10: update_arrow in the review', () => {
  const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
  const ARROW = 'eeeeeeee-0000-4000-8000-00000000000e';

  const withArrow = (p: Parameters<typeof createMarking>[0]) => {
    const rect = (x: number) => ({ x, y: 10, width: 50, height: 50 });
    let next = createMarking(p, { id: A, containerId: CONTAINER, rect: rect(10) });
    next = createMarking(next, { id: B, containerId: CONTAINER, rect: rect(100) });
    return createArrow(next, { id: ARROW, from: A, to: B });
  };

  it('an arrow created by the proposal itself (the review starts from the proposed) does not warn', async () => {
    const location = await findProject(roots, 'screens');
    const prepared = await prepareBatch(
      roots,
      location,
      [{ op: 'update_arrow', arrow: ARROW, name: 'explica' }] as Operation[],
      { now: () => Date.parse(NOW), startFrom: withArrow },
    );
    expect(prepared.result.errors).toEqual([]);
    expect(prepared.result.deprecations).toEqual([]);
  });

  it('an arrow that is already in the read project still warns', async () => {
    const dir = join(base, 'screens');
    const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
    const loaded = await loadProject(roots, await findProject(roots, 'screens'));
    writeFileSync(join(dir, 'mapping.json'), serialize(withArrow(loaded.project)));
    try {
      const prepared = await prepareBatch(
        roots,
        await findProject(roots, 'screens'),
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

describe('finding 11: operation alias equal to a row _as', () => {
  const marking = (extra: object) => ({
    op: 'create_marking',
    container: '$screen',
    rect: { x: 10, y: 10, width: 50, height: 50 },
    annotation: {
      type: 'lib/modelo',
      values: { titulo: 'M', campos: [{ _as: '$r1', nome: 'cpf' }] },
    },
    ...extra,
  });
  const screen = {
    op: 'add_container',
    as: '$screen',
    width: 400,
    height: 300,
    background: '#FFFFFF',
  };

  it('the operation as repeated in an _as of the same operation gives duplicate-alias', async () => {
    const result = await run([screen, marking({ as: '$r1' })]);
    expect(result.errors.map((e) => e.code)).toEqual(['duplicate-alias']);
    expect(result.errors[0]!.index).toBe(1);
  });

  it('the annotationAs equal to an _as too', async () => {
    const result = await run([screen, marking({ annotationAs: '$r1' })]);
    expect(result.errors.map((e) => e.code)).toEqual(['duplicate-alias']);
  });

  it('apelidos diferentes seguem funcionando', async () => {
    const result = await run([screen, marking({ as: '$m', annotationAs: '$a' })]);
    expect(result.errors).toEqual([]);
    expect([...result.aliases.keys()].sort()).toEqual(['$a', '$m', '$r1', '$screen']);
  });
});

describe('finding 13: mapping.json read once per call', () => {
  beforeEach(() => {
    mappingReads.count = 0;
  });

  it('prepareBatch reads the mapping.json only once and the hash is of the text used', async () => {
    const location = await findProject(roots, 'screens');
    mappingReads.count = 0;
    const prepared = await prepareBatch(roots, location, [], {
      now: () => Date.parse(NOW),
    });
    expect(mappingReads.count).toBe(1);
    const text = readFileSync(join(base, 'screens', 'mapping.json'), 'utf8');
    expect(prepared.baseHash).toBe(sha256(text));
  });
});

describe('mapping.json grande demais', () => {
  it('prepareBatch refuses with file-too-large before reading the file', async () => {
    const big = join(base, 'grande');
    mkdirSync(big);
    writeFileSync(join(big, 'mapping.json'), '{}');
    truncateSync(join(big, 'mapping.json'), 64 * 1024 * 1024 + 1);
    const both = new Roots([join(base, 'screens'), big]);
    const location = { ...(await findProject(roots, 'screens')), dir: big };
    await expect(
      prepareBatch(both, location, [], { now: () => Date.parse(NOW) }),
    ).rejects.toMatchObject({ code: 'file-too-large' });
  });
});
