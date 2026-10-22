import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Setas e `near` no MCP (ME4): `create_arrow`, `update_arrow`, `delete_arrow` no lote e na
// proposta, `near` em `create_marking`, `arrows` em `get_marking`, a seta lida e anotada pelo id
// e `get_marking_image` recusando a seta (`arrow`).

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created: { op: number; alias?: string; kind: string; ref?: string }[];
  warnings?: { code: string; op: number; message: string }[];
}

interface ArrowRow {
  ref: string;
  id: string;
  from?: { ref: string; name: string | null; path: string[] };
  to?: { ref: string; name: string | null; path: string[] };
  name: string | null;
  style: string;
  locked: boolean;
}

interface MarkingData {
  ref: string;
  kind?: string;
  name: string | null;
  rect: { x: number; y: number; width: number; height: number };
  arrows?: { outgoing: ArrowRow[]; incoming: ArrowRow[] };
  from?: { name: string | null };
  to?: { name: string | null };
  style?: string;
  layers: { annotations: { name: string | null }[] }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'setas';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-arrows-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const build = [
  {
    op: 'add_container',
    as: '$tela',
    name: 'Tela',
    width: 400,
    height: 400,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    as: '$botao',
    container: '$tela',
    rect: { x: 10, y: 10, width: 100, height: 60 },
    name: 'Botão',
  },
  {
    op: 'create_marking',
    as: '$nota',
    annotationAs: '$nota-a',
    near: '$botao',
    annotation: { type: 'notas/nota' },
    name: 'Nota do botão',
  },
  { op: 'create_arrow', as: '$seta', from: '$botao', to: '$nota', style: 'elbow' },
];

describe('create_marking com near', () => {
  it('a nota flutuante nasce na margem do container, à direita da tela', async () => {
    const result = await plan(build);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.changes).toMatchObject({
      markings: { created: 2 },
      arrows: { created: 1 },
    });
    expect(result.created.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['container', 'marking', 'arrow']),
    );
  });

  it('numa proposta aplicada: a nota é flutuante, fora do container, e a seta liga as duas', async () => {
    const proposed = await propose(mcp, project, build);
    expect(proposed.valid).toBe(true);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    const nota = saved.markings.find((m) => m.name === 'Nota do botão');
    const tela = saved.containers[0]!;
    expect(nota).toMatchObject({ floating: true, containerId: null });
    // À direita do container (margem de 24 unidades), na altura da marcação.
    const width = tela.width * tela.placement.scale;
    expect(nota!.rect.x).toBe(tela.placement.x + width + 24);
    expect(nota!.rect.y).toBe(tela.placement.y + 10 * tela.placement.scale);
    expect(saved.arrows).toHaveLength(1);
    expect(saved.arrows[0]).toMatchObject({ style: 'elbow', points: [] });
    expect(readProject(dir).arrows).toHaveLength(1);
  });

  it('near com referência inexistente falha com not-found', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        as: '$outra',
        near: 'm/00000000',
        annotation: { type: 'notas/nota' },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.code).toBe('not-found');
  });

  it('near em marcação não flutuante é ignorado com aviso', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        container: readProject(dir).containers[0]!.id,
        near: readProject(dir).markings[0]!.id,
        rect: { x: 200, y: 200, width: 50, height: 50 },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'ignored-argument', op: 0 }),
    ]);
  });
});

describe('seta lida, anotada e recusada onde não cabe', () => {
  let arrowRef: string;
  let buttonRef: string;

  it('get_marking da marcação lista as setas que saem e chegam, com a outra ponta', async () => {
    const saved = readProject(dir);
    const botao = saved.markings.find((m) => m.name === 'Botão')!;
    const nota = saved.markings.find((m) => m.floating)!;
    const button = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: botao.id }),
    );
    buttonRef = button.ref;
    expect(button.arrows?.outgoing).toHaveLength(1);
    expect(button.arrows?.incoming).toEqual([]);
    const out = button.arrows!.outgoing[0]!;
    arrowRef = out.ref;
    expect(out).toMatchObject({ style: 'elbow', name: null, locked: false });
    expect(out.to?.name).toBe('Nota do botão');
    expect(out.to?.path.at(0)).toBe('Canvas');

    const note = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: nota.id }),
    );
    expect(note.arrows?.incoming).toHaveLength(1);
    expect(note.arrows?.incoming[0]?.from?.name).toBe('Botão');
  });

  it('get_marking com a referência da seta devolve kind arrow, pontas e estilo', async () => {
    const arrow = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: arrowRef }),
    );
    expect(arrow).toMatchObject({ kind: 'arrow', style: 'elbow' });
    expect(arrow.from?.name).toBe('Botão');
    expect(arrow.to?.name).toBe('Nota do botão');
    expect(arrow).not.toHaveProperty('points');
  });

  it('create_annotation aceita a seta como marcação e a anotação aparece em get_marking', async () => {
    const operations = [
      {
        op: 'create_annotation',
        marking: arrowRef,
        layer: 'Camada 1',
        name: 'Ao tocar',
        entries: [{ key: 'evento', value: 'click' }],
      },
    ];
    const result = await plan(operations);
    expect(result.errors).toBeUndefined();
    const proposed = await propose(mcp, project, operations);
    const saved = acceptAllAndApply(dir, proposed.proposal.id);
    expect(saved.annotations.some((a) => a.markingId === saved.arrows[0]!.id)).toBe(true);
    const arrow = ok(
      await mcp.call<MarkingData>('get_marking', { project, ref: arrowRef }),
    );
    expect(arrow.layers[0]?.annotations.map((a) => a.name)).toEqual(['Ao tocar']);
  });

  it('get_marking_image recusa a seta com o erro arrow e uma dica', async () => {
    const error = errorOf(
      await mcp.call('get_marking_image', { project, ref: arrowRef }),
    );
    expect(error.code).toBe('arrow');
    expect(String(error.hint)).toContain('get_marking');
  });

  it('create_arrow e update_arrow recusam points', async () => {
    const created = await plan([
      { op: 'create_arrow', from: buttonRef, to: arrowRef, points: [{ x: 1, y: 2 }] },
      { op: 'update_arrow', arrow: arrowRef, points: [] },
    ]);
    expect(created.valid).toBe(false);
    expect(created.errors?.map((e) => e.code)).toEqual([
      'invalid-arguments',
      'invalid-arguments',
    ]);
  });

  it('seta como ponta de seta: arrow-endpoint; mesma ponta: arrow-self', async () => {
    const result = await plan([
      { op: 'create_arrow', from: buttonRef, to: arrowRef },
      { op: 'create_arrow', from: buttonRef, to: buttonRef },
    ]);
    expect(result.errors?.map((e) => e.code)).toEqual(['arrow-endpoint', 'arrow-self']);
  });
});

describe('update_arrow e delete_arrow', () => {
  it('update de seta existente funciona na prévia e avisa que a proposta não o leva', async () => {
    const arrow = readProject(dir).arrows[0]!;
    const result = await plan([
      { op: 'update_arrow', arrow: arrow.id, name: 'explica', style: 'straight' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toContain('estilo straight');
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'ignored-argument', op: 0 }),
    ]);
  });

  it('update numa seta criada no mesmo lote vale: a criação leva nome, estilo e trava', async () => {
    const saved = readProject(dir);
    const [botao, nota] = [
      saved.markings.find((m) => m.name === 'Botão')!,
      saved.markings.find((m) => m.floating)!,
    ];
    const operations = [
      { op: 'create_arrow', as: '$s2', from: nota.id, to: botao.id },
      {
        op: 'update_arrow',
        arrow: '$s2',
        name: 'volta',
        style: 'straight',
        locked: true,
      },
    ];
    const result = await plan(operations);
    expect(result.warnings).toBeUndefined();
    const proposed = await propose(mcp, project, operations);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const created = after.arrows.find((a) => a.name === 'volta');
    expect(created).toMatchObject({ style: 'straight', locked: true, points: [] });
  });

  it('delete_arrow: trancada recusa (locked); destrancada sai com as anotações', async () => {
    const saved = readProject(dir);
    const locked = saved.arrows.find((a) => a.locked)!;
    const refused = await plan([{ op: 'delete_arrow', arrow: locked.id }]);
    expect(refused.errors?.[0]?.code).toBe('locked');

    const free = saved.arrows.find((a) => !a.locked)!;
    const operations = [{ op: 'delete_arrow', arrow: free.id }];
    const result = await plan(operations);
    expect(result.changes).toMatchObject({ arrows: { deleted: 1 } });
    const proposed = await propose(mcp, project, operations);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    expect(after.arrows.map((a) => a.id)).toEqual([locked.id]);
    expect(after.annotations.some((a) => a.markingId === free.id)).toBe(false);
  });

  it('delete_arrow numa marcação (não seta) falha com wrong-kind', async () => {
    const botao = readProject(dir).markings.find((m) => m.name === 'Botão')!;
    const result = await plan([{ op: 'delete_arrow', arrow: botao.id }]);
    expect(result.errors?.[0]?.code).toBe('wrong-kind');
  });
});
