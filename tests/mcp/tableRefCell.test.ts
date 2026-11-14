import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Bug #677 (stage #678, VC1): the `ref` column cell of a table accepts the same value as the
// `ref` field (`annotation` with `entry`, `key` or `row`, including aliases from the same batch) and
// keeps accepting the stored format (`annotationId` …).
// The SPEC ids and the titles `Cliente` and `Tela` mirror the example of docs/AGENT-GUIDE.md, which the last test reads.

interface Planned {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 10,
  id: 'rc',
  name: 'Ref in column',
  version: 1,
  platforms: [{ id: 'web', name: 'Web' }],
  layers: [
    {
      id: 'dados',
      name: 'Data',
      color: '#2E7D32',
      annotationTypes: [
        {
          id: 'modelo',
          name: 'Model',
          labelField: 'titulo',
          fields: [
            { key: 'titulo', type: 'string' },
            {
              key: 'campos',
              type: 'table',
              tags: ['data-field'],
              rowLabel: 'nome',
              columns: [{ key: 'nome', type: 'string' }],
            },
            { key: 'chave', type: 'string', tags: ['data-field'] },
            { key: 'solto', type: 'string', tags: ['outro'] },
          ],
        },
      ],
    },
    {
      id: 'telas',
      name: 'Screens',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'lista',
          name: 'List',
          labelField: 'titulo',
          fields: [
            { key: 'titulo', type: 'string' },
            {
              key: 'alvos',
              type: 'table',
              columns: [
                { key: 'nota', type: 'string' },
                {
                  key: 'alvo',
                  type: 'ref',
                  accepts: { tags: ['data-field'], free: true },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

let root: string;
let dir: string;
let mcp: Connection;
const project = 'cell';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-tableref-'));
  mkdirSync(join(root, 'sources'), { recursive: true });
  writeFileSync(join(root, 'sources', 'rc.json'), JSON.stringify(SPEC));
  dir = join(root, 'projetos', project);
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  const proposed = await propose(mcp, project, [
    { op: 'apply_specialization', file: 'sources/rc.json' },
  ]);
  expect(proposed.valid).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const rect = { x: 0, y: 0, width: 100, height: 50 };
const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

/** Proposes the batch, applies everything and returns the stored project. */
async function apply(operations: unknown[]): Promise<Project> {
  const proposed = await propose(mcp, project, operations);
  expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  return readProject(dir);
}

/** The last annotation with the title (other tests in the file repeat titles in the same project). */
const byTitle = (p: Project, title: string): Annotation =>
  p.annotations.filter((a) => a.values?.titulo === title).at(-1)!;
const cells = (a: Annotation) =>
  (a.values!.alvos as { _id: string; alvo: unknown; nota?: string }[]).map((r) => r.alvo);

/** The batch target: a model with two rows, `$p1` (annotation) and `$r1` (row). */
const model = (title: string) => ({
  op: 'create_marking',
  as: '$m1',
  rect,
  annotationAs: '$p1',
  annotation: {
    type: 'rc/modelo',
    values: {
      titulo: title,
      campos: [{ _as: '$r1', nome: 'cpf' }, { nome: 'nome' }],
    },
  },
});
const list = (title: string, alvos: unknown[]) => ({
  op: 'create_marking',
  as: '$m2',
  rect: { x: 200, y: 0, width: 100, height: 50 },
  annotationAs: '$l1',
  annotation: { type: 'rc/lista', values: { titulo: title, alvos } },
});

describe('ref cell with the value of the ref field', () => {
  it('target and cell in the same batch: the alias becomes the stored format', async () => {
    const operations = [
      model('Cliente'),
      list('Tela', [{ nota: 'a', alvo: { annotation: '$p1', key: 'chave' } }]),
    ];
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    const p = await apply(operations);
    expect(cells(byTitle(p, 'Tela'))).toEqual([
      { annotationId: byTitle(p, 'Cliente').id, key: 'chave' },
    ]);
  });

  it('entry: pair of a free-form annotation', async () => {
    const operations = [
      { op: 'create_layer', as: '$free', name: 'Free' },
      { op: 'create_marking', as: '$m3', rect },
      {
        op: 'create_annotation',
        as: '$freeAnn',
        marking: '$m3',
        layer: '$free',
        name: 'Glossary',
        entries: [{ key: 'term', value: 'v' }],
      },
      list('With pair', [{ alvo: { annotation: '$freeAnn', entry: 'term' } }]),
    ];
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    const p = await apply(operations);
    const free = p.annotations.find((a) => a.name === 'Glossary')!;
    expect(cells(byTitle(p, 'With pair'))).toEqual([
      { annotationId: free.id, entryId: free.entries[0]!.id },
    ]);
  });

  it('row: row of another table by alias and by id', async () => {
    const first = await apply([model('Model B')]);
    const target = byTitle(first, 'Model B');
    const rowId = (target.values!.campos as { _id: string }[])[0]!._id;
    const byId = {
      annotation: `mapping://${project}/a/${codeOf(target.id)}`,
      key: 'campos',
      row: rowId,
    };
    const p = await apply([model('Model C'), list('With rows', [{ alvo: byId }])]);
    expect(cells(byTitle(p, 'With rows'))).toEqual([
      { annotationId: target.id, key: 'campos', rowId },
    ]);
    // by alias: the row was created in an earlier step of the batch
    const aliased = await apply([
      model('Model D'),
      list('By alias', [{ alvo: { annotation: '$p1', key: 'campos', row: '$r1' } }]),
    ]);
    const modelD = byTitle(aliased, 'Model D');
    const rowD = (modelD.values!.campos as { _id: string }[])[0]!._id;
    expect(cells(byTitle(aliased, 'By alias'))).toEqual([
      { annotationId: modelD.id, key: 'campos', rowId: rowD },
    ]);
  });

  it('the stored format is still accepted', async () => {
    const first = await apply([model('Model E')]);
    const target = byTitle(first, 'Model E');
    const stored = { annotationId: target.id, key: 'chave' };
    const p = await apply([
      list('Stored', [{ alvo: { annotationId: target.id, key: 'chave' } }]),
    ]);
    expect(cells(byTitle(p, 'Stored'))).toEqual([stored]);
  });

  it('target the column does not accept: ref-not-accepted on the right operation', async () => {
    const planned = await plan([
      model('Cliente'),
      list('Bad', [{ alvo: { annotation: '$p1', key: 'solto' } }]),
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'ref-not-accepted' });
  });

  it('value that is not a target: invalid-ref-value, as in the field', async () => {
    const planned = await plan([list('Bad', [{ alvo: 'loose text' }])]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 0, code: 'invalid-ref-value' });
  });

  it('update_annotation keeps the row by _id and changes only the ref cell', async () => {
    const first = await apply([
      model('Model F'),
      list('Swap', [{ nota: 'stays', alvo: { annotation: '$p1', key: 'chave' } }]),
    ]);
    const listAnn = byTitle(first, 'Swap');
    const row = (listAnn.values!.alvos as { _id: string }[])[0]!._id;
    const other = byTitle(first, 'Model F');
    const p = await apply([
      {
        op: 'update_annotation',
        annotation: `mapping://${project}/a/${codeOf(listAnn.id)}`,
        values: {
          alvos: [
            {
              _id: row,
              alvo: {
                annotation: `mapping://${project}/a/${codeOf(other.id)}`,
                key: 'campos',
                row: 0,
              },
            },
          ],
        },
      },
    ]);
    const after = byTitle(p, 'Swap').values!.alvos as {
      _id: string;
      nota: string;
      alvo: unknown;
    }[];
    expect(after).toHaveLength(1);
    expect(after[0]!._id).toBe(row);
    expect(after[0]!.nota).toBe('stays');
    expect(after[0]!.alvo).toMatchObject({ annotationId: other.id, key: 'campos' });
  });
});

describe('the AGENT-GUIDE example', () => {
  it('the guide batch (ref cell with a row by alias) is valid and stores the expected format', async () => {
    const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    const block = /same value applies, cell by cell[^]*?```json\n([^]*?)```/.exec(guide);
    expect(block, 'json block of the guide').not.toBeNull();
    const operations = JSON.parse(block![1]!) as unknown[];
    const p = await apply(operations);
    const customer = byTitle(p, 'Cliente');
    const rowId = (customer.values!.campos as { _id: string }[])[0]!._id;
    expect(cells(byTitle(p, 'Tela'))).toEqual([
      { annotationId: customer.id, key: 'campos', rowId },
    ]);
  });
});
