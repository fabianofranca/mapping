import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOTES_FILES } from '../../libraries/notas';
import { deserialize } from '../../src/model';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// A biblioteca de notas embutida (ME3) pelo `create_project`: aplicada por padrão, com a pasta
// `specs/notas/` gravada antes do `mapping.json`; `notes: false` cria o projeto como antes.

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-notes-'));
  root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('create_project com a biblioteca de notas', () => {
  it('padrão: camada Notas, especialização aplicada e specs/notas/ idêntica ao pacote', async () => {
    const created = ok(
      await mcp.call<{ counts: { layers: number } }>('create_project', {
        path: 'com-notas',
        name: 'Com notas',
      }),
    );
    expect(created.counts.layers).toBe(2);
    const dir = join(root, 'com-notas');
    for (const [path, text] of NOTES_FILES) {
      const onDisk = readFileSync(
        join(dir, 'specs', 'notas', ...path.split('/')),
        'utf8',
      );
      // O JSON da especialização é regravado pela serialização do modelo; o resto é o pacote.
      if (path === 'notas.spec.json') {
        expect(JSON.parse(onDisk)).toEqual(JSON.parse(text));
      } else {
        expect(onDisk, path).toBe(text);
      }
    }
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.specializations).toEqual([
      expect.objectContaining({ id: 'notas', file: 'specs/notas/notas.spec.json' }),
    ]);
    expect(parsed.project.layers.map((l) => [l.name, l.spec])).toEqual([
      ['Camada 1', null],
      ['Notas', { specId: 'notas', layerId: 'notas' }],
    ]);
  });

  it('get_project lê o projeto criado: especialização notas disponível e camada Notas', async () => {
    const project = ok(
      await mcp.call<{
        layers: { name: string; spec: unknown; annotations: number }[];
        specializations: Record<string, unknown>[];
        issues: { total: number };
      }>('get_project', { project: 'com-notas' }),
    );
    expect(project.specializations).toEqual([
      expect.objectContaining({
        id: 'notas',
        name: 'Notas',
        available: true,
        annotations: 0,
      }),
    ]);
    expect(project.specializations[0]).not.toHaveProperty('problem');
    expect(project.layers.map((l) => l.name)).toEqual(['Camada 1', 'Notas']);
    expect(project.issues.total).toBe(0);
  });

  it('get_specialization devolve a notas: formatVersion 7, tipo nota flutuante', async () => {
    const data = ok(
      await mcp.call<{
        id: string;
        file: string;
        spec: {
          formatVersion: number;
          layers: {
            id: string;
            annotationTypes: { id: string; floating?: boolean; component?: string }[];
          }[];
        };
      }>('get_specialization', { project: 'com-notas', specId: 'notas' }),
    );
    expect(data).toMatchObject({ id: 'notas', file: 'specs/notas/notas.spec.json' });
    expect(data.spec.formatVersion).toBe(7);
    const types = data.spec.layers.flatMap((l) => l.annotationTypes);
    expect(types.map((t) => t.id)).toEqual(['nota', 'tabela']);
    expect(types[0]).toMatchObject({
      floating: true,
      component: 'components/nota.json',
    });
  });

  it('notes: false cria só a "Camada 1", sem specs/', async () => {
    const created = ok(
      await mcp.call<{ counts: { layers: number } }>('create_project', {
        path: 'sem-notas',
        name: 'Sem notas',
        notes: false,
      }),
    );
    expect(created.counts.layers).toBe(1);
    const dir = join(root, 'sem-notas');
    expect(existsSync(join(dir, 'specs'))).toBe(false);
    expect(existsSync(join(dir, 'mapping.json'))).toBe(true);
    const parsed = deserialize(readFileSync(join(dir, 'mapping.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.layers.map((l) => l.name)).toEqual(['Camada 1']);
    expect(parsed.project.specializations).toEqual([]);

    const project = ok(
      await mcp.call<{ specializations: unknown[] }>('get_project', {
        project: 'sem-notas',
      }),
    );
    expect(project.specializations).toEqual([]);
    expect(
      errorOf(
        await mcp.call('get_specialization', { project: 'sem-notas', specId: 'notas' }),
      ).code,
    ).toBe('not-found');
  });
});
