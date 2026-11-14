import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Specialization notices in the MCP (stage #486, AV4, decision 11): `get_specialization` returns
// the `notices`; `plan_changes` and `propose_changes` carry the `notices` key next to `issues`,
// with the notices the batch creates. A notice only informs: nothing is blocked.

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
  name: 'Notices',
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
          notices: [{ kind: 'removed', message: 'Left the contract.' }],
          fields: [{ key: 'a', type: 'string' }],
        },
        {
          id: 'box',
          name: 'Box',
          notices: [{ kind: 'pending', message: 'Missing in the SDK.' }],
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
                  notices: [{ kind: 'diverges', message: 'Sources disagree.' }],
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
  it('returns the notices of type, field and column', async () => {
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
      { kind: 'removed', message: 'Left the contract.' },
    ]);
    expect(box.notices).toEqual([{ kind: 'pending', message: 'Missing in the SDK.' }]);
    expect(box.fields.find((f) => f.key === 'style')!.notices).toEqual([
      { kind: 'deprecated', message: 'Use variant.' },
    ]);
    expect(box.fields.find((f) => f.key === 'rows')!.columns![0]!.notices).toEqual([
      { kind: 'diverges', message: 'Sources disagree.' },
    ]);
  });
});

describe('plan_changes: the notices key', () => {
  it('an annotation of a type with a notice: one notice of the type', async () => {
    const result = await plan(marking({ type: 'avisos/old' }));
    expect(result.valid).toBe(true);
    expect(result.notices?.new).toEqual([
      expect.objectContaining({
        type: 'old',
        kind: 'removed',
        message: 'Left the contract.',
      }),
    ]);
    expect(result.notices!.new[0]!.annotation).toMatch(/^mapping:\/\/avisos\/a\//);
    expect(result.notices!.new[0]).not.toHaveProperty('key');
  });

  it("a value in a field with a notice: the type's and the field's, from most to least severe", async () => {
    const result = await plan(
      marking({ type: 'avisos/box', values: { style: 'legacy' } }),
    );
    expect(result.notices?.new.map((n) => [n.kind, n.key])).toEqual([
      ['deprecated', 'style'],
      ['pending', undefined],
    ]);
  });

  it('a value in a column with a notice: carries key and column', async () => {
    const result = await plan(
      marking({ type: 'avisos/box', values: { rows: [{ c: '1' }] } }),
    );
    const column = result.notices!.new.find((n) => n.kind === 'diverges')!;
    expect(column).toMatchObject({
      type: 'box',
      key: 'rows',
      column: 'c',
      message: 'Sources disagree.',
    });
  });

  it('a batch that touches nothing with a notice: empty new, issues intact', async () => {
    const result = await plan(marking({ type: 'avisos/plain', values: { x: 'ok' } }));
    expect(result.valid).toBe(true);
    expect(result.notices).toEqual({ new: [] });
    expect(result.issues.new).toEqual([]);
  });
});

describe('propose_changes: the same key', () => {
  it('returns notices and the proposal stays written and acceptable', async () => {
    const proposed = await propose(mcp, project, marking({ type: 'avisos/old' }));
    expect(proposed.valid).toBe(true);
    const notices = (proposed as unknown as Planned).notices;
    expect(notices?.new.map((n) => n.kind)).toEqual(['removed']);
  });
});

describe('validate_specialization and formatVersion 10', () => {
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

  it('accepts notices in v10', async () => {
    const result = await validate(10);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('refuses notices in v9 with the exact path', async () => {
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
