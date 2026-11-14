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

// Stage #1084 (F2): `notices` in `types[...]` of `get_code_hints` — notices of the type, the fields
// and the columns, ordered by severity, with the place; only on types with `code` on the platform.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const code = (symbol: string) => ({ compose: { symbol, path: `${symbol}.kt` } });

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 10,
  id: 'av',
  name: 'Notices',
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
          id: 'card',
          name: 'Card',
          fields: [
            {
              key: 'style',
              type: 'string',
              notices: [{ kind: 'deprecated', message: 'compose: use variant.' }],
            },
            {
              key: 'draft',
              type: 'string',
              notices: [{ kind: 'removed', message: 'Field outside the contract.' }],
            },
            {
              key: 'items',
              type: 'table',
              columns: [
                {
                  key: 'label',
                  type: 'string',
                  notices: [
                    { kind: 'pending', message: 'Column without an equivalent.' },
                  ],
                },
              ],
            },
          ],
          notices: [
            {
              kind: 'pending',
              message: 'Missing slot.',
              since: '2026-11-04',
              ref: 'docs/card.md',
            },
            { kind: 'diverges', message: 'compose: no weight.', ref: 'docs/card.md' },
          ],
          code: code('Card'),
        },
        {
          id: 'simple',
          name: 'Simple',
          fields: [{ key: 'title', type: 'string' }],
          code: code('Simple'),
        },
        {
          id: 'old',
          name: 'Old',
          fields: [{ key: 'title', type: 'string' }],
          notices: [{ kind: 'removed', message: 'Type outside the contract.' }],
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
  add('CA', 'card', 0, { style: 'x' });
  add('SI', 'simple', 100, { title: 'S' });
  add('AN', 'old', 200, { title: 'A' });
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
  writeProject('notices', SPEC);
  const withoutNotices = JSON.parse(JSON.stringify(SPEC)) as Json;
  const types = withoutNotices.layers[0].annotationTypes as Json[];
  delete types[0]!.notices;
  for (const f of types[0]!.fields as Json[]) {
    delete f.notices;
    for (const c of f.columns ?? []) delete c.notices;
  }
  delete types[2]!.notices;
  writeProject('clean', withoutNotices);
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

describe('get_code_hints: notices of the type', () => {
  it('brings the notices of the type, the fields and the columns, by severity, with the place', async () => {
    const h = await hints('notices', 'MCA');
    expect(h.types['av/card'].notices).toEqual([
      { kind: 'removed', message: 'Field outside the contract.', key: 'draft' },
      { kind: 'deprecated', message: 'compose: use variant.', key: 'style' },
      { kind: 'diverges', message: 'compose: no weight.', ref: 'docs/card.md' },
      {
        kind: 'pending',
        message: 'Missing slot.',
        since: '2026-11-04',
        ref: 'docs/card.md',
      },
      {
        kind: 'pending',
        message: 'Column without an equivalent.',
        key: 'items',
        column: 'label',
      },
    ]);
  });

  it('the field notice comes even with an empty field', async () => {
    const h = await hints('notices', 'MSI');
    expect(h.types['av/simple']).not.toHaveProperty('notices');
    const c = await hints('notices', 'MCA');
    expect(c.types['av/card'].notices).toContainEqual({
      kind: 'removed',
      message: 'Field outside the contract.',
      key: 'draft',
    });
  });

  it('a type without code on the platform goes to unmappedTypes, without notices', async () => {
    const h = await hints('notices', 'MAN');
    expect(h.unmappedTypes).toEqual(['av/old']);
    expect(h.types).toEqual({});
    expect(JSON.stringify(h)).not.toContain('Type outside the contract');
  });

  it('without notices in the specialization, the notices key does not exist', async () => {
    const h = await hints('clean', 'MCA');
    expect(h.types['av/card']).not.toHaveProperty('notices');
  });
});
