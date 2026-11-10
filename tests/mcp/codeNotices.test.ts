import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  serialize,
  setFieldValue,
  specFiles,
  type Project,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';
import { ok } from './proposalSupport';
import {
  PNG_1X1,
  allIds,
  codeOf,
  connect,
  uuidFor,
  withUuids,
  type Connection,
} from './workspace';

// Etapa #1084 (F2): `notices` em `types[...]` do `get_code_hints` — avisos do tipo, dos campos
// e das colunas, ordenados por gravidade, com o lugar; só nos tipos com `code` na plataforma.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const code = (symbol: string) => ({ compose: { symbol, path: `${symbol}.kt` } });

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 10,
  id: 'av',
  name: 'Avisos',
  version: 1,
  platforms: [
    {
      id: 'compose',
      name: 'Compose',
      language: 'kotlin',
      repo: { url: 'https://example.com/r', ref: 'v1' },
    },
  ],
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'cartao',
          name: 'Cartão',
          fields: [
            {
              key: 'estilo',
              type: 'string',
              notices: [{ kind: 'deprecated', message: 'compose: use variante.' }],
            },
            {
              key: 'rascunho',
              type: 'string',
              notices: [{ kind: 'removed', message: 'Campo fora do contrato.' }],
            },
            {
              key: 'itens',
              type: 'table',
              columns: [
                {
                  key: 'rotulo',
                  type: 'string',
                  notices: [{ kind: 'pending', message: 'Coluna sem equivalente.' }],
                },
              ],
            },
          ],
          notices: [
            {
              kind: 'pending',
              message: 'Falta o slot.',
              since: '2026-11-04',
              ref: 'docs/cartao.md',
            },
            { kind: 'diverges', message: 'compose: sem weight.', ref: 'docs/cartao.md' },
          ],
          code: code('Cartao'),
        },
        {
          id: 'simples',
          name: 'Simples',
          fields: [{ key: 'titulo', type: 'string' }],
          code: code('Simples'),
        },
        {
          id: 'antigo',
          name: 'Antigo',
          fields: [{ key: 'titulo', type: 'string' }],
          notices: [{ kind: 'removed', message: 'Tipo fora do contrato.' }],
        },
      ],
    },
  ],
};

function build(spec: unknown): Project {
  const parsed = parseSpec(spec);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let p = applySpecialization(emptyProject(), parsed.spec, { newId: idGen('LV') });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 1000, height: 1000 });
  const layerId = layerOf(p, 'av', 'ui');
  const add = (id: string, typeId: string, x: number, values: Record<string, string>) => {
    p = createMarking(p, {
      id: `M${id}`,
      containerId: 'I1',
      rect: { x, y: 0, width: 50, height: 50 },
      name: id,
    });
    p = addTypedAnnotation(p, {
      id,
      markingId: `M${id}`,
      layerId,
      type: { specId: 'av', typeId },
    });
    for (const [k, v] of Object.entries(values)) p = setFieldValue(p, id, k, v);
  };
  add('CA', 'cartao', 0, { estilo: 'x' });
  add('SI', 'simples', 100, { titulo: 'S' });
  add('AN', 'antigo', 200, { titulo: 'A' });
  return p;
}

let root: string;
let mcp: Connection;
const ids: Record<string, string> = {};

function writeProject(name: string, spec: unknown): void {
  const source = build(spec);
  for (const id of allIds(source)) ids[`${name}:${id}`] = uuidFor(id);
  const dir = join(root, 'projetos', name);
  mkdirSync(join(dir, 'images'), { recursive: true });
  mkdirSync(join(dir, 'specs'), { recursive: true });
  writeFileSync(join(dir, 'images', 'a.png'), PNG_1X1);
  writeFileSync(
    join(dir, 'mapping.json'),
    withUuids(serialize(source), [...allIds(source)]),
  );
  for (const [file, content] of specFiles(source))
    writeFileSync(join(dir, file), content);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-mcp-notices-'));
  writeProject('avisos', SPEC);
  const semAvisos = JSON.parse(JSON.stringify(SPEC)) as Json;
  const types = semAvisos.layers[0].annotationTypes as Json[];
  delete types[0]!.notices;
  for (const f of types[0]!.fields as Json[]) {
    delete f.notices;
    for (const c of f.columns ?? []) delete c.notices;
  }
  delete types[2]!.notices;
  writeProject('limpo', semAvisos);
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
});

const hints = async (project: string, marking: string) =>
  ok(
    await mcp.call<Json>('get_code_hints', {
      ref: `mapping://${project}/m/${codeOf(uuidFor(marking))}`,
      platform: 'compose',
    }),
  );

describe('get_code_hints: notices do tipo', () => {
  it('traz os avisos do tipo, dos campos e das colunas, por gravidade, com o lugar', async () => {
    const h = await hints('avisos', 'MCA');
    expect(h.types['av/cartao'].notices).toEqual([
      { kind: 'removed', message: 'Campo fora do contrato.', key: 'rascunho' },
      { kind: 'deprecated', message: 'compose: use variante.', key: 'estilo' },
      { kind: 'diverges', message: 'compose: sem weight.', ref: 'docs/cartao.md' },
      {
        kind: 'pending',
        message: 'Falta o slot.',
        since: '2026-11-04',
        ref: 'docs/cartao.md',
      },
      {
        kind: 'pending',
        message: 'Coluna sem equivalente.',
        key: 'itens',
        column: 'rotulo',
      },
    ]);
  });

  it('o aviso do campo vem mesmo com o campo vazio', async () => {
    const h = await hints('avisos', 'MSI');
    expect(h.types['av/simples']).not.toHaveProperty('notices');
    const c = await hints('avisos', 'MCA');
    expect(c.types['av/cartao'].notices).toContainEqual({
      kind: 'removed',
      message: 'Campo fora do contrato.',
      key: 'rascunho',
    });
  });

  it('tipo sem code na plataforma fica em unmappedTypes, sem notices', async () => {
    const h = await hints('avisos', 'MAN');
    expect(h.unmappedTypes).toEqual(['av/antigo']);
    expect(h.types).toEqual({});
    expect(JSON.stringify(h)).not.toContain('Tipo fora do contrato');
  });

  it('sem avisos na especialização, a chave notices não existe', async () => {
    const h = await hints('limpo', 'MCA');
    expect(h.types['av/cartao']).not.toHaveProperty('notices');
  });
});
