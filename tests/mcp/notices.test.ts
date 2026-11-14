import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Avisos da especialização no MCP (etapa #486, AV4, decisão 11): `get_specialization` devolve
// os `notices`; `plan_changes` e `propose_changes` trazem a chave `notices` ao lado de `issues`,
// com os avisos que o lote cria. Aviso só informa: nada é bloqueado.

interface NoticeEntry {
  annotation: string;
  type: string;
  kind: string;
  message: string;
  key?: string;
  column?: string;
}
interface Planned {
  valid: boolean;
  issues: { new: unknown[] };
  notices?: { new: NoticeEntry[] };
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 10,
  id: 'avisos',
  name: 'Avisos',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'old',
          name: 'Old',
          notices: [{ kind: 'removed', message: 'Saiu do contrato.' }],
          fields: [{ key: 'a', type: 'string' }],
        },
        {
          id: 'box',
          name: 'Box',
          notices: [{ kind: 'pending', message: 'Falta no SDK.' }],
          fields: [
            {
              key: 'style',
              type: 'string',
              notices: [{ kind: 'deprecated', message: 'Use variant.' }],
            },
            {
              key: 'rows',
              type: 'table',
              columns: [
                {
                  key: 'c',
                  type: 'string',
                  notices: [{ kind: 'diverges', message: 'Fontes discordam.' }],
                },
                { key: 'd', type: 'string' },
              ],
            },
            { key: 'free', type: 'string' },
          ],
        },
        { id: 'plain', name: 'Plain', fields: [{ key: 'x', type: 'string' }] },
      ],
    },
  ],
};

let root: string;
let mcp: Connection;
const project = 'avisos';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-notices-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'avisos.json'), JSON.stringify(SPEC));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  const proposed = await propose(mcp, project, [
    { op: 'apply_specialization', file: 'fontes/avisos.json' },
  ]);
  expect(proposed.valid).toBe(true);
  acceptAllAndApply(join(root, 'projetos', project), proposed.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const marking = (annotation: Record<string, unknown>) => [
  {
    op: 'create_marking',
    as: '$m',
    rect: { x: 0, y: 0, width: 100, height: 50 },
    annotationAs: '$a',
    annotation,
  },
];

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

describe('get_specialization', () => {
  it('devolve os notices de tipo, campo e coluna', async () => {
    const view = ok(
      await mcp.call<{
        spec: {
          layers: {
            annotationTypes: {
              id: string;
              notices?: unknown[];
              fields: {
                key: string;
                notices?: unknown[];
                columns?: { notices?: unknown[] }[];
              }[];
            }[];
          }[];
        };
      }>('get_specialization', { project, specId: 'avisos' }),
    );
    const types = view.spec.layers[0]!.annotationTypes;
    const box = types.find((t) => t.id === 'box')!;
    expect(types.find((t) => t.id === 'old')!.notices).toEqual([
      { kind: 'removed', message: 'Saiu do contrato.' },
    ]);
    expect(box.notices).toEqual([{ kind: 'pending', message: 'Falta no SDK.' }]);
    expect(box.fields.find((f) => f.key === 'style')!.notices).toEqual([
      { kind: 'deprecated', message: 'Use variant.' },
    ]);
    expect(box.fields.find((f) => f.key === 'rows')!.columns![0]!.notices).toEqual([
      { kind: 'diverges', message: 'Fontes discordam.' },
    ]);
  });
});

describe('plan_changes: a chave notices', () => {
  it('anotação de tipo com aviso: um aviso do tipo', async () => {
    const result = await plan(marking({ type: 'avisos/old' }));
    expect(result.valid).toBe(true);
    expect(result.notices?.new).toEqual([
      expect.objectContaining({
        type: 'old',
        kind: 'removed',
        message: 'Saiu do contrato.',
      }),
    ]);
    expect(result.notices!.new[0]!.annotation).toMatch(/^mapping:\/\/avisos\/a\//);
    expect(result.notices!.new[0]).not.toHaveProperty('key');
  });

  it('valor num campo com aviso: o do tipo e o do campo, do mais grave ao menos', async () => {
    const result = await plan(
      marking({ type: 'avisos/box', values: { style: 'legacy' } }),
    );
    expect(result.notices?.new.map((n) => [n.kind, n.key])).toEqual([
      ['deprecated', 'style'],
      ['pending', undefined],
    ]);
  });

  it('valor numa coluna com aviso: traz key e column', async () => {
    const result = await plan(
      marking({ type: 'avisos/box', values: { rows: [{ c: '1' }] } }),
    );
    const column = result.notices!.new.find((n) => n.kind === 'diverges')!;
    expect(column).toMatchObject({
      type: 'box',
      key: 'rows',
      column: 'c',
      message: 'Fontes discordam.',
    });
  });

  it('lote que não toca em nada com aviso: new vazio, issues intacto', async () => {
    const result = await plan(marking({ type: 'avisos/plain', values: { x: 'ok' } }));
    expect(result.valid).toBe(true);
    expect(result.notices).toEqual({ new: [] });
    expect(result.issues.new).toEqual([]);
  });
});

describe('propose_changes: a mesma chave', () => {
  it('devolve notices e a proposta continua gravada e aceitável', async () => {
    const proposed = await propose(mcp, project, marking({ type: 'avisos/old' }));
    expect(proposed.valid).toBe(true);
    const notices = (proposed as unknown as Planned).notices;
    expect(notices?.new.map((n) => n.kind)).toEqual(['removed']);
  });
});

describe('validate_specialization e a formatVersion 10', () => {
  interface Validated {
    valid: boolean;
    errors: string[];
  }
  const validate = async (formatVersion: number) =>
    ok(
      await mcp.call<Validated>('validate_specialization', {
        text: JSON.stringify({ ...SPEC, formatVersion }),
      }),
    );

  it('aceita notices na v10', async () => {
    const result = await validate(10);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('recusa notices na v9 com o caminho exato', async () => {
    const result = await validate(9);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'layers[0].annotationTypes[0].notices: only allowed with formatVersion 10',
        'layers[0].annotationTypes[1].fields[1].columns[0].notices: only allowed with formatVersion 10',
      ]),
    );
  });
});
