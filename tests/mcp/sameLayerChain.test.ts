import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Etapa #678, fase VC2 (MCP 0.24.0, formatVersion 13): o vínculo na mesma camada. Um evento
// pode ser dono de outros eventos (Clique do botão -> evento -> Sucesso e Falha), cada filho
// no papel em que se liga; o ciclo continua barrado. O lote de encadeamento é o mesmo do
// `docs/AGENT-GUIDE.md` ("O 'quando' é papel, também entre eventos").

interface Planned {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
}
interface HintAnnotation {
  type: string;
  parentRole?: string;
  linked?: HintAnnotation[];
}
interface HintNode {
  annotations?: HintAnnotation[];
  children?: HintNode[];
}

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 13,
  id: 'app',
  name: 'App',
  version: 1,
  platforms: [{ id: 'web', name: 'Web' }],
  layers: [
    {
      id: 'ui',
      name: 'Interface',
      color: '#1565C0',
      annotationTypes: [
        {
          id: 'button',
          name: 'Button',
          labelField: 'texto',
          fields: [{ key: 'texto', type: 'string' }],
          childRoles: [{ id: 'click', name: 'Clique' }],
          allowedChildren: ['event'],
          code: { web: { symbol: 'Button' } },
        },
        {
          id: 'event',
          name: 'Evento',
          labelField: 'nome',
          fields: [{ key: 'nome', type: 'string' }],
          childRoles: [
            { id: 'success', name: 'Sucesso' },
            { id: 'failure', name: 'Falha' },
          ],
          allowedChildren: ['event'],
          code: { web: { symbol: 'Event' } },
        },
      ],
    },
  ],
};

let root: string;
let dir: string;
let mcp: Connection;
const project = 'encadeado';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-chain-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'app.json'), JSON.stringify(SPEC));
  dir = join(root, 'projetos', project);
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  const proposed = await propose(mcp, project, [
    { op: 'apply_specialization', file: 'fontes/app.json' },
  ]);
  expect(proposed.valid, JSON.stringify(proposed)).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Planned>('plan_changes', { project, operations }));

/** O lote do guia: o evento dono pendurado no Clique do botão, com os filhos em Sucesso e Falha. */
function guideChain(): unknown[] {
  const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
  const block = /chaining by role[^]*?```json\n([^]*?)```/.exec(guide);
  expect(block, 'bloco json do guia').not.toBeNull();
  return JSON.parse(block![1]!) as unknown[];
}

const byName = (p: Project, name: string): Annotation =>
  p.annotations.find((a) => a.values?.nome === name || a.values?.texto === name)!;

describe('vínculo na mesma camada pelo MCP', () => {
  it('o lote do guia (evento dono em Clique, filhos em Sucesso e Falha) é válido e grava a cadeia', async () => {
    const operations = guideChain();
    const planned = await plan(operations);
    expect(planned.valid, JSON.stringify(planned.errors)).toBe(true);

    const proposed = await propose(mcp, project, operations);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    acceptAllAndApply(dir, proposed.proposal.id);
    const p = readProject(dir);

    const button = byName(p, 'Salvar');
    const click = byName(p, 'Ao clicar');
    const ok1 = byName(p, 'Salvou');
    const fail = byName(p, 'Falhou');
    expect(click).toMatchObject({ parentAnnotationId: button.id, parentRole: 'click' });
    expect(ok1).toMatchObject({ parentAnnotationId: click.id, parentRole: 'success' });
    expect(fail).toMatchObject({ parentAnnotationId: click.id, parentRole: 'failure' });
    expect(new Set([button, click, ok1, fail].map((a) => a.layerId)).size).toBe(1);

    // get_code_hints: a cadeia de dois níveis sob o botão, cada filho com o papel.
    const hints = ok(
      await mcp.call<{ tree: HintNode }>('get_code_hints', {
        ref: p.markings.find((m) => m.id === button.markingId)!.id,
        project,
        platform: 'web',
      }),
    );
    const root = hints.tree.annotations![0]!;
    expect(root.type).toBe('app/button');
    const level1 = root.linked!;
    expect(level1.map((a) => [a.type, a.parentRole])).toEqual([['app/event', 'click']]);
    expect(level1[0]!.linked!.map((a) => a.parentRole)).toEqual(['success', 'failure']);
  });

  it('um ciclo no lote falha com invalid-annotation-parent e o texto novo', async () => {
    const operations = [
      ...guideChain(),
      {
        op: 'update_annotation',
        annotation: '$clique',
        owner: '$sucesso',
        role: 'success',
      },
    ];
    const planned = await plan(operations);
    expect(planned.valid).toBe(false);
    const error = planned.errors!.at(-1)!;
    expect(error.code).toBe('invalid-annotation-parent');
    expect(error.message).toContain(
      'for a typed annotation, of a type that accepts this link',
    );
    expect(error.message).toContain('including in the same layer');
  });
});
