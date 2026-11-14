import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Bug #677 (etapa #678, VC1): a célula de coluna `ref` de uma tabela aceita o mesmo valor do
// campo `ref` (`annotation` com `entry`, `key` ou `row`, inclusive apelidos do mesmo lote) e
// continua aceitando o formato gravado (`annotationId` …).

interface Planned {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 10,
  id: 'rc',
  name: 'Ref em coluna',
  version: 1,
  platforms: [{ id: 'web', name: 'Web' }],
  layers: [
    {
      id: 'dados',
      name: 'Dados',
      color: '#2E7D32',
      annotationTypes: [
        {
          id: 'modelo',
          name: 'Modelo',
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
      name: 'Telas',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'lista',
          name: 'Lista',
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
const project = 'celula';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-tableref-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'rc.json'), JSON.stringify(SPEC));
  dir = join(root, 'projetos', project);
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  const proposed = await propose(mcp, project, [
    { op: 'apply_specialization', file: 'fontes/rc.json' },
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

/** Propõe o lote, aplica tudo e devolve o projeto gravado. */
async function apply(operations: unknown[]): Promise<Project> {
  const proposed = await propose(mcp, project, operations);
  expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  return readProject(dir);
}

/** A última anotação com o título (outros testes do arquivo repetem títulos no mesmo projeto). */
const byTitle = (p: Project, title: string): Annotation =>
  p.annotations.filter((a) => a.values?.titulo === title).at(-1)!;
const cells = (a: Annotation) =>
  (a.values!.alvos as { _id: string; alvo: unknown; nota?: string }[]).map((r) => r.alvo);

/** O alvo do lote: um modelo com duas linhas, `$p1` (anotação) e `$r1` (linha). */
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

describe('célula ref com o valor do campo ref', () => {
  it('alvo e célula no mesmo lote: o apelido vira o formato gravado', async () => {
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

  it('entry: par de anotação livre', async () => {
    const operations = [
      { op: 'create_layer', as: '$livres', name: 'Livres' },
      { op: 'create_marking', as: '$m3', rect },
      {
        op: 'create_annotation',
        as: '$livre',
        marking: '$m3',
        layer: '$livres',
        name: 'Glossário',
        entries: [{ key: 'termo', value: 'v' }],
      },
      list('Com par', [{ alvo: { annotation: '$livre', entry: 'termo' } }]),
    ];
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);
    const p = await apply(operations);
    const free = p.annotations.find((a) => a.name === 'Glossário')!;
    expect(cells(byTitle(p, 'Com par'))).toEqual([
      { annotationId: free.id, entryId: free.entries[0]!.id },
    ]);
  });

  it('row: linha de outra tabela por apelido e por id', async () => {
    const first = await apply([model('Modelo B')]);
    const target = byTitle(first, 'Modelo B');
    const rowId = (target.values!.campos as { _id: string }[])[0]!._id;
    const byId = {
      annotation: `mapping://${project}/a/${codeOf(target.id)}`,
      key: 'campos',
      row: rowId,
    };
    const p = await apply([model('Modelo C'), list('Com linhas', [{ alvo: byId }])]);
    expect(cells(byTitle(p, 'Com linhas'))).toEqual([
      { annotationId: target.id, key: 'campos', rowId },
    ]);
    // por apelido: a linha foi criada num passo anterior do lote
    const aliased = await apply([
      model('Modelo D'),
      list('Por apelido', [{ alvo: { annotation: '$p1', key: 'campos', row: '$r1' } }]),
    ]);
    const modelD = byTitle(aliased, 'Modelo D');
    const rowD = (modelD.values!.campos as { _id: string }[])[0]!._id;
    expect(cells(byTitle(aliased, 'Por apelido'))).toEqual([
      { annotationId: modelD.id, key: 'campos', rowId: rowD },
    ]);
  });

  it('o formato gravado continua aceito', async () => {
    const first = await apply([model('Modelo E')]);
    const target = byTitle(first, 'Modelo E');
    const stored = { annotationId: target.id, key: 'chave' };
    const p = await apply([
      list('Gravado', [{ alvo: { annotationId: target.id, key: 'chave' } }]),
    ]);
    expect(cells(byTitle(p, 'Gravado'))).toEqual([stored]);
  });

  it('alvo que a coluna não aceita: ref-not-accepted na operação certa', async () => {
    const planned = await plan([
      model('Cliente'),
      list('Ruim', [{ alvo: { annotation: '$p1', key: 'solto' } }]),
    ]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 1, code: 'ref-not-accepted' });
  });

  it('valor que não é um alvo: invalid-ref-value, como no campo', async () => {
    const planned = await plan([list('Ruim', [{ alvo: 'texto solto' }])]);
    expect(planned.valid).toBe(false);
    expect(planned.errors![0]).toMatchObject({ index: 0, code: 'invalid-ref-value' });
  });

  it('update_annotation mantém a linha por _id e troca só a célula ref', async () => {
    const first = await apply([
      model('Modelo F'),
      list('Trocar', [{ nota: 'fica', alvo: { annotation: '$p1', key: 'chave' } }]),
    ]);
    const lista = byTitle(first, 'Trocar');
    const row = (lista.values!.alvos as { _id: string }[])[0]!._id;
    const other = byTitle(first, 'Modelo F');
    const p = await apply([
      {
        op: 'update_annotation',
        annotation: `mapping://${project}/a/${codeOf(lista.id)}`,
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
    const after = byTitle(p, 'Trocar').values!.alvos as {
      _id: string;
      nota: string;
      alvo: unknown;
    }[];
    expect(after).toHaveLength(1);
    expect(after[0]!._id).toBe(row);
    expect(after[0]!.nota).toBe('fica');
    expect(after[0]!.alvo).toMatchObject({ annotationId: other.id, key: 'campos' });
  });
});

describe('o exemplo do AGENT-GUIDE', () => {
  it('o lote do guia (célula ref com linha por apelido) é válido e grava o formato esperado', async () => {
    const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    const block = /same value applies, cell by cell[^]*?```json\n([^]*?)```/.exec(guide);
    expect(block, 'bloco json do guia').not.toBeNull();
    const operations = JSON.parse(block![1]!) as unknown[];
    const p = await apply(operations);
    const cliente = byTitle(p, 'Cliente');
    const rowId = (cliente.values!.campos as { _id: string }[])[0]!._id;
    expect(cells(byTitle(p, 'Tela'))).toEqual([
      { annotationId: cliente.id, key: 'campos', rowId },
    ]);
  });
});
