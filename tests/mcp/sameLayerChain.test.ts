import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #678, phase VC2 (MCP 0.24.0, formatVersion 13): the link in the same layer. An event
// can be the owner of other events (button Click -> event -> Success and Failure), each child
// in the role it links in; the cycle is still blocked. The chaining batch is the same as the one in
// `docs/AGENT-GUIDE.md` ("The "when" is a role, also between events").

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
          childRoles: [{ id: 'click', name: 'Click' }],
          allowedChildren: ['event'],
          code: { web: { symbol: 'Button' } },
        },
        {
          id: 'event',
          name: 'Event',
          labelField: 'nome',
          fields: [{ key: 'nome', type: 'string' }],
          childRoles: [
            { id: 'success', name: 'Success' },
            { id: 'failure', name: 'Failure' },
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
const project = 'chained';

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

/** The guide batch: the owner event hung from the button Click, with the children in Success and Failure. */
function guideChain(): unknown[] {
  const guide = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
  const block = /chaining by role[^]*?```json\n([^]*?)```/.exec(guide);
  expect(block, 'json block of the guide').not.toBeNull();
  return JSON.parse(block![1]!) as unknown[];
}

const byName = (p: Project, name: string): Annotation =>
  p.annotations.find((a) => a.values?.nome === name || a.values?.texto === name)!;

describe('link in the same layer through the MCP', () => {
  it('the guide batch (owner event on Click, children in Success and Failure) is valid and writes the chain', async () => {
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

    // get_code_hints: the two-level chain under the button, each child with its role.
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

  it('a cycle in the batch fails with invalid-annotation-parent and the new text', async () => {
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
