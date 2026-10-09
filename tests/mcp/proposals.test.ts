import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findBySource,
  parseProposalText,
  projectIndex,
  renameMarking,
  serialize,
  setMarkingLocked,
  type Change,
  type Proposal,
} from '../../src/model';
import { encodePng, quadrants } from './images';
import {
  applyAcceptedOnDisk,
  errorOf,
  hashOf,
  ok,
  propose,
  readProject,
  readProposal,
  reviewDecide,
  reviewNote,
  acceptAllAndApply,
  type Proposed,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Propostas pelo dist-mcp/mapping-mcp.js, por stdio (etapa 4.2): importação inteira, revisão
// simulada (editando decisões e notas no arquivo, como a app faz), nova proposta com
// `supersedes` e a garantia de que o agente nunca altera o `mapping.json`.

let root: string;
let mcp: Connection;
const dir = () => join(root, 'loja');
const mappingPath = () => join(dir(), 'mapping.json');

/** O SDUI de exemplo em v3, com origens no Button (tipo, campo de texto e campo enum). */
function sduiV3(): string {
  const spec = JSON.parse(readFileSync('examples/specs/sdui.json', 'utf8')) as {
    formatVersion: number;
    layers: {
      annotationTypes: {
        sources?: unknown;
        fields: { sources?: unknown }[];
      }[];
    }[];
  };
  spec.formatVersion = 3;
  const button = spec.layers[0]!.annotationTypes[0]!;
  button.sources = [
    { system: 'figma', id: '3f2a9c', name: 'DS/Button' },
    { system: 'figma', name: 'DS/Button (legado)' },
  ];
  button.fields[1]!.sources = [{ system: 'figma', name: 'Label' }];
  button.fields[2]!.sources = [
    {
      system: 'figma',
      name: 'Style',
      values: { Primary: 'primary', Secondary: 'secondary' },
    },
  ];
  return `${JSON.stringify(spec, null, 2)}\n`;
}

const figma = (id: string) => ({
  system: 'figma',
  id,
  url: `https://figma.example/${id}`,
});

/** A importação inteira de duas telas, com origem em tudo, como um agente de importação faria. */
const IMPORT_OPERATIONS = [
  { op: 'apply_specialization', file: 'fontes/sdui.json' },
  {
    op: 'add_image',
    as: '$t1',
    file: 'fontes/tela1.png',
    name: 'Checkout',
    source: figma('1:10'),
  },
  {
    op: 'add_image',
    as: '$t2',
    file: 'fontes/tela2.png',
    name: 'Pagamento',
    source: figma('1:20'),
  },
  {
    op: 'create_marking',
    as: '$titulo',
    image: '$t1',
    name: 'Título',
    rect: { x: 20, y: 20, width: 400, height: 60 },
    source: figma('1:11'),
  },
  {
    op: 'create_marking',
    as: '$botao',
    image: '$t1',
    name: 'Botão Pagar',
    rect: { x: 20, y: 600, width: 300, height: 80 },
    source: figma('1:12'),
  },
  {
    op: 'create_marking',
    as: '$cartao',
    image: '$t2',
    name: 'Campo cartão',
    rect: { x: 20, y: 100, width: 500, height: 70 },
    source: figma('2:21'),
  },
  {
    op: 'create_annotation',
    as: '$btn',
    marking: '$botao',
    type: 'button',
    values: { id: 'btn_pagar', texto: 'Pagar' },
  },
  {
    op: 'create_annotation',
    marking: '$botao',
    type: 'onClick',
    owner: '$btn',
    values: { acao: 'submit' },
  },
  {
    op: 'create_annotation',
    marking: '$titulo',
    type: 'text',
    values: { id: 'titulo', conteudo: 'Checkout' },
  },
  {
    op: 'create_annotation',
    marking: '$cartao',
    layer: 'Camada 1',
    entries: [{ key: 'máscara', value: '0000 0000 0000 0000' }],
  },
];

interface Row {
  ref: string;
  id: string;
  status: string;
  title: string;
  supersedes: string | null;
  supersededBy?: string[];
  progress: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    applied: number;
    complete: boolean;
  };
  conflicts: number;
}
interface Listed {
  total: number;
  proposals: Row[];
  broken?: { id: string; error: string }[];
}
interface ChangeRow {
  id: string;
  state: string;
  kind: string;
  entity: string;
  target: string;
  field?: string;
  from?: unknown;
  to?: unknown;
  conflict?: { current: unknown; missing?: boolean };
  locked?: boolean;
  via?: string;
  notes?: { text: string }[];
}
interface Got {
  proposal: Row & { supersedes: string | null; description: string | null };
  project: { revision: number; changedSinceProposal: boolean };
  progress: Row['progress'];
  conflicts: number;
  levels: {
    project?: { state: string; changes: number };
    images: { image: string; change: string; state: string; changes: number }[];
  };
  total: number;
  returned: number;
  truncated?: boolean;
  nextOffset?: number;
  changes: ChangeRow[];
  notes: { level: string; target?: string; text: string }[];
}
interface Reviewed {
  ready: boolean;
  progress: Row['progress'];
  rejected: ChangeRow[];
  notes: { level: string; target?: string; text: string }[];
  conflicts: { change: string; current?: unknown; field?: string }[];
  hint: string;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-prop-'));
  mkdirSync(join(root, 'fontes'), { recursive: true });
  writeFileSync(join(root, 'fontes', 'sdui.json'), sduiV3());
  writeFileSync(join(root, 'fontes', 'tela1.png'), await encodePng(quadrants(600, 800)));
  writeFileSync(join(root, 'fontes', 'tela2.png'), await encodePng(quadrants(600, 800)));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: 'loja', name: 'Loja' }));
});

afterAll(async () => {
  await mcp?.close();
});

const idOf = (p: Proposal, entity: Change['entity'], name: string): string => {
  const change = p.changes.find(
    (c) =>
      c.entity === entity &&
      c.kind === 'create' &&
      (c.to as { name?: string | null }).name === name,
  );
  if (!change) throw new Error(`sem criação de ${entity} "${name}"`);
  return change.entityId;
};

let first: Proposed;
let firstProposal: Proposal;

describe('importação inteira', () => {
  it('propose_changes grava a proposta; o mapping.json não muda', async () => {
    const before = hashOf(mappingPath());
    first = await propose(mcp, 'loja', IMPORT_OPERATIONS, {
      title: 'Loja a partir do Figma',
      description: 'Telas Checkout e Pagamento.',
      origin: 'Figma: Loja v3 › Checkout',
      author: 'Agente de teste',
    });
    expect(first.proposed).toBe(true);
    expect(hashOf(mappingPath())).toBe(before);
    expect(first.proposal).toMatchObject({
      title: 'Loja a partir do Figma',
      status: 'open',
      baseRevision: 0,
      supersedes: null,
    });
    expect(first.proposal.ref).toMatch(
      /^mapping:\/\/loja\/p\/[0-9a-f]{8} \(Loja a partir do Figma\)$/,
    );

    // Pasta, arquivo da proposta (válido pelo modelo) e imagens novas ao lado.
    const proposalDir = join(dir(), 'proposals', first.proposal.id);
    expect(readdirSync(proposalDir).sort()).toEqual(['images', 'proposal.json']);
    expect(readdirSync(join(proposalDir, 'images')).sort()).toEqual([
      'tela1.webp',
      'tela2.webp',
    ]);
    expect(readdirSync(join(dir(), 'images'))).toEqual([]);
    const parsed = parseProposalText(
      readFileSync(join(proposalDir, 'proposal.json'), 'utf8'),
    );
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    firstProposal = readProposal(dir(), first.proposal.id);
    expect(firstProposal).toMatchObject({
      origin: 'Figma: Loja v3 › Checkout',
      author: 'Agente de teste',
      revision: 0,
      decisions: {},
      notes: [],
      applied: {},
    });
    expect(firstProposal.operations).toHaveLength(IMPORT_OPERATIONS.length);
  });

  it('é tudo criação: uma mudança por entidade, resumida por nível', () => {
    const kinds = new Map<string, number>();
    for (const c of firstProposal.changes) {
      expect(c.kind).toBe('create');
      kinds.set(c.entity, (kinds.get(c.entity) ?? 0) + 1);
    }
    expect(Object.fromEntries(kinds)).toEqual({
      specialization: 1,
      layer: 3,
      image: 2,
      marking: 3,
      annotation: 4,
    });
    expect(first.reviewChanges).toEqual({ total: 13, create: 13, update: 0, remove: 0 });
    expect(first.levels.project).toMatchObject({ state: 'undecided', changes: 4 });
    expect(first.levels.images).toEqual([
      expect.objectContaining({ change: 'new', items: 2 }),
      expect.objectContaining({ change: 'new', items: 1 }),
    ]);
    expect(first.files.images).toEqual([
      `proposals/${first.proposal.id}/images/tela1.webp`,
      `proposals/${first.proposal.id}/images/tela2.webp`,
    ]);
    // Cada item criado traz a referência definitiva, com o apelido.
    const aliases = first.created.filter((c) => c.alias).map((c) => c.alias);
    expect(aliases).toEqual(['$t1', '$t2', '$titulo', '$botao', '$cartao', '$btn']);
    expect(first.hint).toContain('janela Propostas');
  });

  it('list_proposals e get_proposal mostram tudo pendente', async () => {
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'loja' }));
    expect(listed.total).toBe(1);
    expect(listed.proposals[0]).toMatchObject({
      ref: first.proposal.ref,
      status: 'open',
      progress: { total: 13, pending: 13, accepted: 0, rejected: 0, complete: false },
      conflicts: 0,
    });
    expect(
      ok(await mcp.call<Listed>('list_proposals', { project: 'loja', status: 'applied' }))
        .total,
    ).toBe(0);

    const got = ok(await mcp.call<Got>('get_proposal', { ref: first.proposal.ref }));
    expect(got.proposal).toMatchObject({
      description: 'Telas Checkout e Pagamento.',
      supersedes: null,
    });
    expect(got.total).toBe(13);
    expect(got.changes.every((c) => c.state === 'pending')).toBe(true);
    expect(got.changes[0]).toMatchObject({
      kind: 'create',
      entity: 'specialization',
      target: 'especialização sdui',
    });
    // A especialização inteira não entra na resposta.
    expect(JSON.stringify(got.changes[0])).not.toContain('"layers"');
    expect(got.levels.images.map((i) => [i.change, i.state])).toEqual([
      ['new', 'undecided'],
      ['new', 'undecided'],
    ]);
    // O alvo de uma marcação criada é a referência definitiva, com o caminho legível.
    expect(
      got.changes.find((c) => c.entity === 'marking' && c.target.includes('Botão Pagar'))!
        .target,
    ).toMatch(/^mapping:\/\/loja\/m\/[0-9a-f]{8} \(Checkout › Botão Pagar\)$/);
  });

  it('get_proposal aceita o código curto, o id e filtra por estado, com paginação', async () => {
    const code = first.proposal.ref.match(/\/p\/([0-9a-f]+)/)![1]!;
    for (const ref of [`p/${code}`, first.proposal.id, `mapping://loja/p/${code}`]) {
      const got = ok(await mcp.call<Got>('get_proposal', { ref, project: 'loja' }));
      expect(got.proposal.id).toBe(first.proposal.id);
    }
    const page = ok(await mcp.call<Got>('get_proposal', { ref: code, limit: 5 }));
    expect(page).toMatchObject({
      total: 13,
      returned: 5,
      truncated: true,
      nextOffset: 5,
    });
    const rest = ok(
      await mcp.call<Got>('get_proposal', { ref: code, offset: 10, limit: 5 }),
    );
    expect(rest.returned).toBe(3);
    expect(rest.truncated).toBeUndefined();
    expect(
      ok(await mcp.call<Got>('get_proposal', { ref: code, state: 'accepted' })).total,
    ).toBe(0);

    expect(
      errorOf(await mcp.call('get_proposal', { ref: 'zzzz', project: 'loja' })).code,
    ).toBe('proposal-not-found');
    expect(errorOf(await mcp.call('get_proposal', { ref: 'm/3f2a9c1e' })).code).toBe(
      'invalid-ref',
    );
    expect(
      errorOf(await mcp.call('get_proposal', { ref: 'mapping://outro/p/abcd1234' })).code,
    ).toBe('project-not-found');
  });

  it('get_proposal_review antes da revisão: nada rejeitado e a revisão não terminou', async () => {
    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review).toMatchObject({
      ready: false,
      rejected: [],
      notes: [],
      conflicts: [],
    });
    expect(review.hint).toContain('13 sem decisão');
  });
});

describe('revisão simulada (decisões e notas gravadas no arquivo, como a app)', () => {
  let cartaoId: string;
  let imageIds: { checkout: string; pagamento: string };

  it('aceita a tela 1 e o projeto; na tela 2 rejeita um item, com nota', async () => {
    imageIds = {
      checkout: idOf(firstProposal, 'image', 'Checkout'),
      pagamento: idOf(firstProposal, 'image', 'Pagamento'),
    };
    cartaoId = idOf(firstProposal, 'marking', 'Campo cartão');
    reviewDecide(dir(), first.proposal.id, { level: 'project', id: null }, 'accepted');
    reviewDecide(
      dir(),
      first.proposal.id,
      { level: 'image', id: imageIds.checkout },
      'accepted',
    );
    reviewDecide(
      dir(),
      first.proposal.id,
      { level: 'image', id: imageIds.pagamento },
      'accepted',
    );
    // Rejeitar o item rejeita a anotação dele junto (dependência).
    reviewDecide(dir(), first.proposal.id, { level: 'item', id: cartaoId }, 'rejected');
    reviewNote(
      dir(),
      first.proposal.id,
      { level: 'item', id: cartaoId },
      'O campo é mais largo e fica em y 90.',
    );
    reviewNote(
      dir(),
      first.proposal.id,
      { level: 'proposal', id: null },
      'Faltou a tela de erro.',
    );

    const got = ok(await mcp.call<Got>('get_proposal', { ref: first.proposal.ref }));
    expect(got.progress).toEqual({
      total: 13,
      pending: 0,
      accepted: 11,
      rejected: 2,
      applied: 0,
      complete: false,
    });
    expect(got.levels.images.map((i) => i.state)).toEqual(['accepted', 'partial']);
    expect(got.notes.map((n) => [n.level, n.text])).toEqual([
      ['item', 'O campo é mais largo e fica em y 90.'],
      ['proposal', 'Faltou a tela de erro.'],
    ]);
  });

  it('a revisão só termina quando as aceitas são aplicadas', async () => {
    let review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review.ready).toBe(false);
    expect(review.hint).toContain('0 sem decisão, 11 aceita(s) sem aplicar');

    // "Aplicar aceitas": o modelo que a app usa aplica a proposta que o MCP gerou.
    const project = applyAcceptedOnDisk(dir(), first.proposal.id);
    expect(project.revision).toBe(1);
    expect(project.images.map((i) => i.name)).toEqual(['Checkout', 'Pagamento']);
    expect(project.markings.map((m) => m.name)).toEqual(['Título', 'Botão Pagar']);
    expect(project.annotations).toHaveLength(3);
    expect(readProposal(dir(), first.proposal.id)).toMatchObject({
      status: 'applied',
      revision: expect.any(Number),
    });

    review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review.ready).toBe(true);
    expect(review.progress).toMatchObject({
      pending: 0,
      accepted: 0,
      rejected: 2,
      applied: 11,
    });
    expect(review.hint).toContain('corrija só o que foi rejeitado');
  });

  it('get_proposal_review traz só a rejeição, a anotação rejeitada junto e as notas', async () => {
    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review.rejected.map((c) => [c.entity, c.kind, c.state])).toEqual([
      ['marking', 'create', 'rejected'],
      ['annotation', 'create', 'rejected'],
    ]);
    const [marking, annotation] = review.rejected;
    expect(marking!.target).toContain('Campo cartão');
    expect(marking!.via).toBeUndefined();
    // A anotação foi rejeitada por depender da criação da marcação.
    expect(annotation!.via).toBe(marking!.id);
    // Notas gerais (item e proposta) vêm à parte, com o alvo legível.
    expect(review.notes.map((n) => [n.level, n.text])).toEqual([
      ['item', 'O campo é mais largo e fica em y 90.'],
      ['proposal', 'Faltou a tela de erro.'],
    ]);
    expect(review.notes[0]!.target).toContain('Campo cartão');
    expect(review.conflicts).toEqual([]);
  });

  it('o projeto aplicado é lido pelo próprio servidor, e find_by_source acha a origem', async () => {
    const found = ok(
      await mcp.call<{
        total: number;
        matches: { kind: string; ref: string; source: { system: string; id: string } }[];
        proposed?: unknown[];
      }>('find_by_source', { project: 'loja', system: 'figma', id: '1:12' }),
    );
    expect(found.total).toBe(1);
    expect(found.matches[0]).toMatchObject({
      kind: 'marking',
      source: { system: 'figma', id: '1:12', url: 'https://figma.example/1:12' },
    });
    expect(found.proposed).toBeUndefined();
    const marking = ok(
      await mcp.call<{ lock: unknown }>('get_marking', { ref: found.matches[0]!.ref }),
    );
    expect(marking).toBeDefined();
    // O que foi rejeitado não existe no projeto.
    expect(
      ok(
        await mcp.call<{ total: number }>('find_by_source', {
          system: 'figma',
          id: '2:21',
        }),
      ).total,
    ).toBe(0);
    // Funciona no modelo (a app usa a mesma função) e o `source` foi gravado no mapping.json.
    const project = readProject(dir());
    expect(findBySource(project, 'figma', '1:12')).toHaveLength(1);
    expect(findBySource(project, 'figma', '1:10')[0]).toMatchObject({ kind: 'image' });
  });
});

describe('nova proposta com supersedes (só as correções)', () => {
  let second: Proposed;
  let pagamentoRef: string;

  it('recria só o que foi rejeitado e a anterior (já aplicada) continua applied', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'loja',
        system: 'figma',
        id: '1:20',
      }),
    );
    pagamentoRef = found.matches[0]!.ref;
    const before = hashOf(mappingPath());
    second = await propose(
      mcp,
      'loja',
      [
        {
          op: 'create_marking',
          as: '$cartao',
          image: pagamentoRef,
          name: 'Campo cartão',
          rect: { x: 20, y: 90, width: 560, height: 70 },
          source: figma('2:21'),
        },
        {
          op: 'create_annotation',
          marking: '$cartao',
          layer: 'Camada 1',
          entries: [{ key: 'máscara', value: '0000 0000 0000 0000' }],
        },
      ],
      { title: 'Correção do campo cartão', supersedes: first.proposal.ref },
    );
    expect(hashOf(mappingPath())).toBe(before);
    expect(second.proposal).toMatchObject({
      supersedes: first.proposal.ref,
      baseRevision: 1,
    });
    expect(second.reviewChanges).toMatchObject({ total: 2, create: 2 });
    // A revisão anterior estava completa: sem aviso, e ela continua `applied`.
    expect(second.warnings).toBeUndefined();
    expect(second.superseded).toMatchObject({
      ref: first.proposal.ref,
      status: 'applied',
    });
    expect(readProposal(dir(), first.proposal.id).decisions).toEqual(firstDecisions());
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'loja' }));
    const row = listed.proposals.find((r) => r.id === first.proposal.id)!;
    expect(row.supersededBy).toEqual([second.proposal.ref]);
    expect(listed.proposals.find((r) => r.id === second.proposal.id)!.supersedes).toBe(
      first.proposal.ref,
    );
  });

  it('aceita e aplica a correção: o projeto passa a ter o campo, com a origem', () => {
    const project = acceptAllAndApply(dir(), second.proposal.id);
    expect(project.revision).toBe(2);
    const found = findBySource(project, 'figma', '2:21');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ marking: { rect: { y: 90, width: 560 } } });
  });

  it('substituir antes de terminar a revisão avisa o que ficou para trás', async () => {
    const markingRef = (
      ok(
        await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
          project: 'loja',
          system: 'figma',
          id: '1:12',
        }),
      ).matches[0] as { ref: string }
    ).ref;
    const third = await propose(
      mcp,
      'loja',
      [
        { op: 'update_marking', marking: markingRef, name: 'Pagar agora' },
        { op: 'update_marking', marking: markingRef, move: { dx: 0, dy: 10 } },
      ],
      { title: 'Ajustes no botão' },
    );
    expect(third.reviewChanges).toMatchObject({ total: 2, update: 2 });
    // O usuário aceita um nome e deixa o resto sem decisão.
    const proposal = readProposal(dir(), third.proposal.id);
    const nameChange = proposal.changes.find((c) => c.field === 'name')!;
    reviewDecide(
      dir(),
      third.proposal.id,
      { level: 'change', id: nameChange.id },
      'accepted',
    );

    const fourth = await propose(
      mcp,
      'loja',
      [
        { op: 'update_marking', marking: markingRef, name: 'Pagar agora' },
        { op: 'update_marking', marking: markingRef, move: { dx: 0, dy: 20 } },
      ],
      { title: 'Ajustes no botão (2)', supersedes: third.proposal.ref },
    );
    expect(fourth.warnings).toEqual([
      expect.objectContaining({
        code: 'superseded-incomplete',
        proposal: third.proposal.ref,
        undecided: 1,
        acceptedNotApplied: 1,
        // O nome é igual na nova; a posição mudou de valor.
        inNewProposal: { same: 1, different: 1, missing: 0 },
      }),
    ]);
    expect(fourth.superseded).toMatchObject({ status: 'superseded' });
    // A substituída guarda as decisões e ganhou uma revisão (decisão da app + a substituição).
    const old = readProposal(dir(), third.proposal.id);
    expect(old.status).toBe('superseded');
    expect(old.revision).toBe(2);
    expect(old.decisions[nameChange.id]).toMatchObject({ state: 'accepted' });

    const got = ok(await mcp.call<Got>('get_proposal', { ref: third.proposal.ref }));
    expect(got.proposal.status).toBe('superseded');
    expect(got.progress).toMatchObject({ pending: 1, accepted: 1 });
  });

  it('supersedes inexistente ou de outro projeto é recusado, sem gravar nada', async () => {
    const before = readdirSync(join(dir(), 'proposals')).length;
    const result = await mcp.call('propose_changes', {
      project: 'loja',
      title: 'x',
      supersedes: 'p/00000000',
      operations: [{ op: 'create_layer', name: 'Outra' }],
    });
    expect(errorOf(result).code).toBe('proposal-not-found');
    expect(readdirSync(join(dir(), 'proposals')).length).toBe(before);
  });
});

/** As decisões gravadas pela revisão simulada da primeira proposta (nada mudou ao substituí-la). */
function firstDecisions() {
  const p = readProposal(dir(), first.proposal.id);
  return p.decisions;
}

describe('reexportação: casar por source e propor só o que mudou', () => {
  it('a mesma exportação, sem diferenças, não gera proposta', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'loja',
        system: 'figma',
        id: '1:11',
      }),
    );
    const titulo = found.matches[0]!.ref;
    const result = await mcp.call('propose_changes', {
      project: 'loja',
      title: 'Nada novo',
      operations: [
        { op: 'update_marking', marking: titulo, name: 'Título', source: figma('1:11') },
      ],
    });
    expect(errorOf(result).code).toBe('no-changes');
  });

  it('mudanças campo a campo; rejeitar só uma delas e ler a nota', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'loja',
        system: 'figma',
        id: '1:11',
      }),
    );
    const titulo = found.matches[0]!.ref;
    const proposed = await propose(
      mcp,
      'loja',
      [
        {
          op: 'update_marking',
          marking: titulo,
          name: 'Título da tela',
          rect: { x: 20, y: 30, width: 400, height: 60 },
        },
      ],
      { title: 'Reexportação do Checkout' },
    );
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.changes.map((c) => [c.entity, c.kind, c.field])).toEqual([
      ['marking', 'update', 'name'],
      ['marking', 'update', 'rect'],
    ]);
    expect(proposal.changes[1]).toMatchObject({
      from: { x: 20, y: 20, width: 400, height: 60 },
      to: { x: 20, y: 30, width: 400, height: 60 },
    });
    const rect = proposal.changes[1]!;
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'rejected',
    );
    reviewNote(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'A posição antiga estava certa.',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: proposal.changes[0]!.id },
      'accepted',
    );
    applyAcceptedOnDisk(dir(), proposed.proposal.id);

    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: proposed.proposal.ref }),
    );
    expect(review.ready).toBe(true);
    expect(review.rejected).toEqual([
      expect.objectContaining({
        id: rect.id,
        field: 'rect',
        from: { x: 20, y: 20, width: 400, height: 60 },
        to: { x: 20, y: 30, width: 400, height: 60 },
        notes: [expect.objectContaining({ text: 'A posição antiga estava certa.' })],
      }),
    ]);
    expect(review.notes).toEqual([]);
    const project = readProject(dir());
    const marking = [...projectIndex(project).markings.values()].find(
      (m) => m.source?.id === '1:11',
    )!;
    expect(marking.name).toBe('Título da tela');
    expect(marking.rect.y).toBe(20);
  });

  it('find_by_source lista o que propostas abertas ainda vão criar (sem duplicar)', async () => {
    const proposed = await propose(
      mcp,
      'loja',
      [
        {
          op: 'add_image',
          as: '$t3',
          file: 'fontes/tela1.png',
          name: 'Erro',
          source: figma('1:30'),
        },
      ],
      { title: 'Tela de erro' },
    );
    const found = ok(
      await mcp.call<{
        total: number;
        proposed?: { proposal: string; entity: string; state: string }[];
      }>('find_by_source', { project: 'loja', system: 'figma', id: '1:30' }),
    );
    expect(found.total).toBe(0);
    expect(found.proposed).toEqual([
      expect.objectContaining({
        proposal: proposed.proposal.ref,
        entity: 'image',
        state: 'pending',
      }),
    ]);
    // O nome do arquivo de imagem não colide com o das outras propostas ainda abertas.
    const again = await propose(
      mcp,
      'loja',
      [{ op: 'add_image', file: 'fontes/tela1.png', name: 'Erro 2' }],
      { title: 'Outra tela' },
    );
    expect(again.files.images[0]).not.toBe(proposed.files.images[0]);
    expect(proposed.files.images[0]).toMatch(/images\/tela1-?\d*\.webp$/);
    for (const p of [proposed, again]) {
      ok(await mcp.call('withdraw_proposal', { ref: p.proposal.ref }));
    }
  });
});

describe('conflito e item trancado, recalculados contra o projeto atual', () => {
  let proposed: Proposed;
  let markingId: string;

  it('o projeto editado depois da proposta aparece como conflito, com o valor atual', async () => {
    const project = readProject(dir());
    const marking = [...project.markings].find((m) => m.source?.id === '1:12')!;
    markingId = marking.id;
    proposed = await propose(
      mcp,
      'loja',
      [
        {
          op: 'update_marking',
          marking: `m/${marking.id.replaceAll('-', '').slice(0, 8)}`,
          name: 'Pagar já',
          move: { dx: 0, dy: -10 },
        },
      ],
      { title: 'Botão' },
    );
    // Alguém (a app) edita a marcação à mão e trava o item depois da proposta.
    const edited = setMarkingLocked(
      renameMarking(project, marking.id, 'Pagar!'),
      marking.id,
      true,
    );
    writeFileSync(mappingPath(), serialize({ ...edited, revision: edited.revision + 1 }));

    const got = ok(await mcp.call<Got>('get_proposal', { ref: proposed.proposal.ref }));
    expect(got.project.changedSinceProposal).toBe(true);
    expect(got.conflicts).toBe(1);
    const name = got.changes.find((c) => c.field === 'name')!;
    expect(name.conflict).toEqual({ current: 'Pagar!' });
    expect(name).toMatchObject({ from: 'Botão Pagar', to: 'Pagar já' });
    // A mudança de geometria num item trancado traz o aviso.
    const rect = got.changes.find((c) => c.field === 'rect')!;
    expect(rect.locked).toBe(true);
    expect(rect.conflict).toBeUndefined();

    const conflicts = ok(
      await mcp.call<Got>('get_proposal', {
        ref: proposed.proposal.ref,
        state: 'conflict',
      }),
    );
    expect(conflicts.changes.map((c) => c.field)).toEqual(['name']);
    const listed = ok(
      await mcp.call<Listed>('list_proposals', { project: 'loja', status: 'open' }),
    );
    expect(listed.proposals.find((r) => r.id === proposed.proposal.id)!.conflicts).toBe(
      1,
    );

    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: proposed.proposal.ref }),
    );
    expect(review.conflicts).toEqual([
      expect.objectContaining({ field: 'name', current: 'Pagar!' }),
    ]);
  });

  it('retirar a proposta: só uma aberta, com a contagem do que se perde', async () => {
    const proposal = readProposal(dir(), proposed.proposal.id);
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: proposal.changes[0]!.id },
      'accepted',
    );
    const result = ok(
      await mcp.call<{
        withdrawn: boolean;
        proposal: { status: string; revision: number };
        discarded: { undecided: number; acceptedNotApplied: number };
      }>('withdraw_proposal', { ref: proposed.proposal.ref }),
    );
    expect(result).toMatchObject({
      withdrawn: true,
      proposal: { status: 'withdrawn', revision: 2 },
      discarded: { undecided: 1, acceptedNotApplied: 1 },
    });
    expect(readProposal(dir(), proposed.proposal.id)).toMatchObject({
      status: 'withdrawn',
      revision: 2,
    });
    // Retirar de novo, ou retirar uma proposta já aplicada, é recusado.
    expect(
      errorOf(await mcp.call('withdraw_proposal', { ref: proposed.proposal.ref })),
    ).toMatchObject({ code: 'not-open', status: 'withdrawn' });
    expect(
      errorOf(await mcp.call('withdraw_proposal', { ref: first.proposal.ref })).code,
    ).toBe('not-open');
    // O item continua do jeito que a app deixou: a retirada não mexe no projeto.
    expect(projectIndex(readProject(dir())).markings.get(markingId)!.name).toBe('Pagar!');
  });
});

describe('find_types_by_source (especialização v3 aplicada)', () => {
  const query = (args: Record<string, unknown>) =>
    mcp.call<{
      total: number;
      types: {
        type: string;
        by: string;
        layer: { name: string };
        fields: {
          key: string;
          sources: { name: string; values?: Record<string, string> }[];
        }[];
      }[];
    }>('find_types_by_source', { project: 'loja', system: 'figma', ...args });

  it('acha o tipo pelo id (mais forte) ou pelo nome, com as propriedades de origem', async () => {
    const byId = ok(await query({ id: '3f2a9c', name: 'Outro' }));
    expect(byId.total).toBe(1);
    expect(byId.types[0]).toMatchObject({
      type: 'sdui/button',
      by: 'id',
      layer: { name: 'Componentes' },
    });
    expect(byId.types[0]!.fields).toEqual([
      expect.objectContaining({ key: 'texto', sources: [{ name: 'Label' }] }),
      expect.objectContaining({
        key: 'estilo',
        options: expect.any(Array),
        sources: [
          {
            name: 'Style',
            values: { Primary: 'primary', Secondary: 'secondary' },
          },
        ],
      }),
    ]);
    const byName = ok(await query({ name: 'DS/Button (legado)' }));
    expect(byName.types.map((t) => [t.type, t.by])).toEqual([['sdui/button', 'name']]);
    expect(ok(await query({ name: 'Inexistente' })).total).toBe(0);
    expect(ok(await query({ id: '3f2a9c', system: 'sketch' } as never)).total).toBe(0);
  });

  it('exige id e/ou name', async () => {
    expect(errorOf(await query({})).code).toBe('missing-query');
  });
});

describe('source nas operações de imagens e marcações', () => {
  const refBySource = async (id: string) =>
    ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'loja',
        system: 'figma',
        id,
      }),
    ).matches[0]!.ref;

  it('define, troca e limpa a origem; cada uma vira a mudança `source`', async () => {
    const titulo = await refBySource('1:11');
    const checkout = await refBySource('1:10');
    const operations = [
      { op: 'update_marking', marking: titulo, source: null },
      { op: 'update_image', image: checkout, source: figma('1:10-v2') },
      {
        op: 'create_marking',
        as: '$novo',
        image: checkout,
        rect: { x: 400, y: 400, width: 50, height: 50 },
        source: { system: 'sketch', id: 'abc' },
      },
    ];
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'loja',
        operations,
      }),
    );
    expect(plan.valid).toBe(true);
    expect(plan.summary[0]).toContain('sem origem');
    expect(plan.summary[1]).toContain('origem figma:1:10-v2');
    expect(plan.summary[2]).toContain('origem sketch:abc');

    const proposed = await propose(mcp, 'loja', operations, { title: 'Origens' });
    const proposal = readProposal(dir(), proposed.proposal.id);
    const bySource = proposal.changes.filter((c) => c.field === 'source');
    expect(bySource.map((c) => [c.entity, c.from, c.to])).toEqual([
      [
        'image',
        expect.objectContaining({ id: '1:10' }),
        expect.objectContaining({ id: '1:10-v2' }),
      ],
      ['marking', expect.objectContaining({ id: '1:11' }), null],
    ]);
    // A criação leva a origem dentro da entidade; url omitida vira null.
    const created = proposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!;
    expect((created.to as { source: unknown }).source).toEqual({
      system: 'sketch',
      id: 'abc',
      url: null,
    });
    // Enquanto a proposta espera a revisão, find_by_source avisa que ela vai criar esse elemento.
    const found = ok(
      await mcp.call<{ total: number; proposed?: { entity: string }[] }>(
        'find_by_source',
        {
          project: 'loja',
          system: 'sketch',
          id: 'abc',
        },
      ),
    );
    expect(found.total).toBe(0);
    expect(found.proposed).toEqual([expect.objectContaining({ entity: 'marking' })]);
    ok(await mcp.call('withdraw_proposal', { ref: proposed.proposal.ref }));
  });

  it('origem sem system ou id é recusada pelo modelo', async () => {
    const titulo = await refBySource('1:11');
    const plan = ok(
      await mcp.call<{ valid: boolean; errors?: { code: string }[] }>('plan_changes', {
        project: 'loja',
        operations: [
          { op: 'update_marking', marking: titulo, source: { system: ' ', id: 'x' } },
        ],
      }),
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors?.map((e) => e.code)).toEqual(['invalid-source']);
  });
});

describe('o agente nunca altera o mapping.json', () => {
  it('nenhuma tool de proposta mexe no mapping.json (nem nas cópias de specs/)', async () => {
    const files = [mappingPath(), join(dir(), 'specs', 'sdui.json')];
    const before = files.map((f) => hashOf(f));
    const imagesBefore = readdirSync(join(dir(), 'images')).sort();

    const a = await propose(
      mcp,
      'loja',
      [{ op: 'create_layer', name: 'Eventos de teste' }],
      {
        title: 'A',
      },
    );
    const b = await propose(mcp, 'loja', [{ op: 'create_layer', name: 'Outras' }], {
      title: 'B',
      supersedes: a.proposal.ref,
    });
    ok(
      await mcp.call('plan_changes', {
        project: 'loja',
        operations: [{ op: 'create_layer', name: 'C' }],
      }),
    );
    ok(await mcp.call('list_proposals', { project: 'loja' }));
    ok(await mcp.call('get_proposal', { ref: b.proposal.ref }));
    ok(await mcp.call('get_proposal_review', { ref: b.proposal.ref }));
    ok(await mcp.call('find_by_source', { system: 'figma', id: '1:12' }));
    ok(await mcp.call('withdraw_proposal', { ref: b.proposal.ref }));

    expect(files.map((f) => hashOf(f))).toEqual(before);
    expect(readdirSync(join(dir(), 'images')).sort()).toEqual(imagesBefore);
    // Também em lote inválido e em operações que o modelo recusa.
    const invalid = await mcp.call<Proposed>('propose_changes', {
      project: 'loja',
      title: 'Inválida',
      operations: [{ op: 'delete_image', image: 'i/00000000' }],
    });
    expect(invalid.data.valid).toBe(false);
    expect(files.map((f) => hashOf(f))).toEqual(before);
  });

  it('só o create_project e as propostas gravam no disco, e nenhum módulo de proposta cita o mapping.json', () => {
    const dirPath = join(process.cwd(), 'mcp');
    const sources = readdirSync(dirPath).filter((f) => f.endsWith('.ts'));
    const writers = sources.filter((f) =>
      /writeFileAtomic\(|writeFile\(|rename\(/.test(
        readFileSync(join(dirPath, f), 'utf8'),
      ),
    );
    expect(writers).toEqual(['createProject.ts', 'paths.ts', 'proposalStore.ts']);
    for (const file of [
      'proposalStore.ts',
      'proposals.ts',
      'proposalViews.ts',
      'proposalRefs.ts',
    ]) {
      const code = readFileSync(join(dirPath, file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
        .join('\n');
      expect(code, file).not.toMatch(/MAPPING_FILE|['"`]mapping\.json['"`]/);
    }
  });
});

describe('projeto com propostas ilegíveis', () => {
  it('uma pasta quebrada aparece em `broken` sem esconder as outras', async () => {
    mkdirSync(join(dir(), 'proposals', 'quebrada'), { recursive: true });
    writeFileSync(join(dir(), 'proposals', 'quebrada', 'proposal.json'), '{ nada');
    mkdirSync(join(dir(), 'proposals', 'vazia'));
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'loja' }));
    expect(listed.total).toBeGreaterThan(3);
    expect(listed.broken?.map((b) => b.id)).toEqual(['quebrada', 'vazia']);
    expect(listed.broken![0]!.error).toContain('JSON inválido');
    expect(listed.broken![1]!.error).toBe('sem proposal.json');
  });
});
