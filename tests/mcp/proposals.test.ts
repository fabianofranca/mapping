import {
  existsSync,
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

// Proposals through dist-mcp/mapping-mcp.js, over stdio (stage 4.2): whole import, simulated
// review (editing decisions and notes in the file, as the app does), new proposal with
// `supersedes` and the guarantee that the agent never changes the `mapping.json`.

let root: string;
let mcp: Connection;
const dir = () => join(root, 'store');

const mappingPath = () => join(dir(), 'mapping.json');
/** Files in the project's `images/` (the folder only exists after the first image is applied). */
const projectImages = () =>
  existsSync(join(dir(), 'images')) ? readdirSync(join(dir(), 'images')).sort() : [];

/** The example SDUI in v3, with origins on the Button (type, text field and enum field). */
function sduiV3(): string {
  const spec = JSON.parse(readFileSync('tests/fixtures/sdui-v2.json', 'utf8')) as {
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

/** The whole import of two screens, with an origin on everything, as an import agent would do. */
const IMPORT_OPERATIONS = [
  { op: 'apply_specialization', file: 'fontes/sdui.json' },
  {
    op: 'add_container',
    as: '$t1',
    file: 'fontes/tela1.png',
    name: 'Checkout',
    source: figma('1:10'),
  },
  {
    op: 'add_container',
    as: '$t2',
    file: 'fontes/tela2.png',
    name: 'Payment',
    source: figma('1:20'),
  },
  {
    op: 'create_marking',
    as: '$titulo',
    container: '$t1',
    name: 'Title',
    rect: { x: 20, y: 20, width: 400, height: 60 },
    source: figma('1:11'),
  },
  {
    op: 'create_marking',
    as: '$botao',
    container: '$t1',
    name: 'Pay button',
    rect: { x: 20, y: 600, width: 300, height: 80 },
    source: figma('1:12'),
  },
  {
    op: 'create_marking',
    as: '$cartao',
    container: '$t2',
    name: 'Card field',
    rect: { x: 20, y: 100, width: 500, height: 70 },
    source: figma('2:21'),
  },
  {
    op: 'create_annotation',
    as: '$btn',
    marking: '$botao',
    type: 'button',
    values: { id: 'btn_pagar', texto: 'Pay' },
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
    entries: [{ key: 'mask', value: '0000 0000 0000 0000' }],
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
    containers: { container: string; change: string; state: string; changes: number }[];
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
  ok(await mcp.call('create_project', { path: 'store', name: 'Store' }));
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
  if (!change) throw new Error(`no creation of ${entity} "${name}"`);
  return change.entityId;
};

let first: Proposed;
let firstProposal: Proposal;

describe('whole import', () => {
  it('propose_changes writes the proposal; the mapping.json does not change', async () => {
    const before = hashOf(mappingPath());
    first = await propose(mcp, 'store', IMPORT_OPERATIONS, {
      title: 'Store from Figma',
      description: 'Checkout and Payment screens.',
      origin: 'Figma: Store v3 › Checkout',
      author: 'Test agent',
    });
    expect(first.proposed).toBe(true);
    expect(hashOf(mappingPath())).toBe(before);
    expect(first.proposal).toMatchObject({
      title: 'Store from Figma',
      status: 'open',
      baseRevision: 0,
      supersedes: null,
    });
    expect(first.proposal.ref).toMatch(/^mapping:\/\/store\/p\/[0-9a-f]{8}$/);

    // Folder, proposal file (valid for the model) and new images beside it.
    const proposalDir = join(dir(), 'proposals', first.proposal.id);
    expect(readdirSync(proposalDir).sort()).toEqual(['images', 'proposal.json']);
    expect(readdirSync(join(proposalDir, 'images')).sort()).toEqual([
      'tela1.webp',
      'tela2.webp',
    ]);
    expect(projectImages()).toEqual([]);
    const parsed = parseProposalText(
      readFileSync(join(proposalDir, 'proposal.json'), 'utf8'),
    );
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    firstProposal = readProposal(dir(), first.proposal.id);
    expect(firstProposal).toMatchObject({
      origin: 'Figma: Store v3 › Checkout',
      author: 'Test agent',
      revision: 0,
      decisions: {},
      notes: [],
      applied: {},
    });
    expect(firstProposal.operations).toHaveLength(IMPORT_OPERATIONS.length);
  });

  it('it is all creation: one change per entity, summarized by level', () => {
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
    expect(first.levels.containers).toEqual([
      expect.objectContaining({ change: 'new', items: 2 }),
      expect.objectContaining({ change: 'new', items: 1 }),
    ]);
    expect(first.files.images).toEqual([
      `proposals/${first.proposal.id}/images/tela1.webp`,
      `proposals/${first.proposal.id}/images/tela2.webp`,
    ]);
    // Each created item carries the final reference, with the alias.
    const aliases = first.created.filter((c) => c.alias).map((c) => c.alias);
    expect(aliases).toEqual(['$t1', '$t2', '$titulo', '$botao', '$cartao', '$btn']);
    expect(first.hint).toContain('Proposals window');
  });

  it('list_proposals and get_proposal show everything pending', async () => {
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'store' }));
    expect(listed.total).toBe(1);
    expect(listed.proposals[0]).toMatchObject({
      ref: first.proposal.ref,
      status: 'open',
      progress: { total: 13, pending: 13, accepted: 0, rejected: 0, complete: false },
      conflicts: 0,
    });
    expect(
      ok(
        await mcp.call<Listed>('list_proposals', { project: 'store', status: 'applied' }),
      ).total,
    ).toBe(0);

    const got = ok(await mcp.call<Got>('get_proposal', { ref: first.proposal.ref }));
    expect(got.proposal).toMatchObject({
      description: 'Checkout and Payment screens.',
      supersedes: null,
    });
    expect(got.total).toBe(13);
    expect(got.changes.every((c) => c.state === 'pending')).toBe(true);
    expect(got.changes[0]).toMatchObject({
      kind: 'create',
      entity: 'specialization',
      target: 'specialization sdui',
    });
    // The whole specialization does not go in the response.
    expect(JSON.stringify(got.changes[0])).not.toContain('"layers"');
    expect(got.levels.containers.map((i) => [i.change, i.state])).toEqual([
      ['new', 'undecided'],
      ['new', 'undecided'],
    ]);
    // The target of a created marking is the final reference, only the URL.
    expect(got.changes.find((c) => c.entity === 'marking')!.target).toMatch(
      /^mapping:\/\/store\/m\/[0-9a-f]{8}$/,
    );
  });

  it('get_proposal refuses the reference in the old format, with the hint and the new accepted', async () => {
    const code = first.proposal.ref.match(/\/p\/([0-9a-f]+)/)![1]!;
    for (const ref of [
      `mapping://store/p/${code} (Store from Figma)`,
      `mapping://Final Store/p/${code}`,
    ]) {
      const result = await mcp.call('get_proposal', { ref });
      expect(result.isError, ref).toBe(true);
      const error = (
        result.data as unknown as {
          error: { code: string; hint: string; accepted: string[] };
        }
      ).error;
      expect(error.code).toBe('invalid-ref');
      expect(error.hint).toContain('copy again from the app');
      expect(error.accepted).toContain('mapping://project/p/3f2a9c1e');
    }
  });

  it('get_proposal accepts the short code and the id, and filters by status, with pagination', async () => {
    const code = first.proposal.ref.match(/\/p\/([0-9a-f]+)/)![1]!;
    for (const ref of [`p/${code}`, first.proposal.id, `mapping://store/p/${code}`]) {
      const got = ok(await mcp.call<Got>('get_proposal', { ref, project: 'store' }));
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
      errorOf(await mcp.call('get_proposal', { ref: 'zzzz', project: 'store' })).code,
    ).toBe('proposal-not-found');
    expect(errorOf(await mcp.call('get_proposal', { ref: 'm/3f2a9c1e' })).code).toBe(
      'invalid-ref',
    );
    expect(
      errorOf(await mcp.call('get_proposal', { ref: 'mapping://other/p/abcd1234' })).code,
    ).toBe('project-not-found');
  });

  it('get_proposal_review before the review: nothing rejected and the review is not finished', async () => {
    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review).toMatchObject({
      ready: false,
      rejected: [],
      notes: [],
      conflicts: [],
    });
    expect(review.hint).toContain('13 undecided');
  });
});

describe('simulated review (decisions and notes written in the file, as the app does)', () => {
  let cartaoId: string;
  let imageIds: { checkout: string; pagamento: string };

  it('accepts screen 1 and the project; on screen 2 rejects an item, with a note', async () => {
    imageIds = {
      checkout: idOf(firstProposal, 'image', 'Checkout'),
      pagamento: idOf(firstProposal, 'image', 'Payment'),
    };
    cartaoId = idOf(firstProposal, 'marking', 'Card field');
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
    // Rejecting the item rejects its annotation along with it (dependency).
    reviewDecide(dir(), first.proposal.id, { level: 'item', id: cartaoId }, 'rejected');
    reviewNote(
      dir(),
      first.proposal.id,
      { level: 'item', id: cartaoId },
      'The field is wider and sits at y 90.',
    );
    reviewNote(
      dir(),
      first.proposal.id,
      { level: 'proposal', id: null },
      'The error screen is missing.',
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
    expect(got.levels.containers.map((i) => i.state)).toEqual(['accepted', 'partial']);
    expect(got.notes.map((n) => [n.level, n.text])).toEqual([
      ['item', 'The field is wider and sits at y 90.'],
      ['proposal', 'The error screen is missing.'],
    ]);
  });

  it('the review only finishes when the accepted ones are applied', async () => {
    let review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review.ready).toBe(false);
    expect(review.hint).toContain('0 undecided, 11 accepted without being applied');

    // "Apply accepted": the model the app uses applies the proposal the MCP generated.
    const project = applyAcceptedOnDisk(dir(), first.proposal.id);
    expect(project.revision).toBe(1);
    expect(project.containers.map((i) => i.name)).toEqual(['Checkout', 'Payment']);
    expect(project.markings.map((m) => m.name)).toEqual(['Title', 'Pay button']);
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
    expect(review.hint).toContain('correct only what was rejected');
  });

  it('get_proposal_review brings only the rejection, the rejected annotation along with it and the notes', async () => {
    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: first.proposal.ref }),
    );
    expect(review.rejected.map((c) => [c.entity, c.kind, c.state])).toEqual([
      ['marking', 'create', 'rejected'],
      ['annotation', 'create', 'rejected'],
    ]);
    const [marking, annotation] = review.rejected;
    expect(marking!.target).toMatch(/^mapping:\/\/store\/m\/[0-9a-f]{8}$/);
    expect(marking!.via).toBeUndefined();
    // The annotation was rejected because it depends on the marking's creation.
    expect(annotation!.via).toBe(marking!.id);
    // General notes (item and proposal) come separately, with a readable target.
    expect(review.notes.map((n) => [n.level, n.text])).toEqual([
      ['item', 'The field is wider and sits at y 90.'],
      ['proposal', 'The error screen is missing.'],
    ]);
    expect(review.notes[0]!.target).toBe(marking!.target);
    expect(review.conflicts).toEqual([]);
  });

  it('the applied project is read by the server itself, and find_by_source finds the origin', async () => {
    const found = ok(
      await mcp.call<{
        total: number;
        matches: { kind: string; ref: string; source: { system: string; id: string } }[];
        proposed?: unknown[];
      }>('find_by_source', { project: 'store', system: 'figma', id: '1:12' }),
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
    // What was rejected does not exist in the project.
    expect(
      ok(
        await mcp.call<{ total: number }>('find_by_source', {
          system: 'figma',
          id: '2:21',
        }),
      ).total,
    ).toBe(0);
    // Works in the model (the app uses the same function) and the `source` was written in the mapping.json.
    const project = readProject(dir());
    expect(findBySource(project, 'figma', '1:12')).toHaveLength(1);
    expect(findBySource(project, 'figma', '1:10')[0]).toMatchObject({ kind: 'image' });
  });
});

describe('new proposal with supersedes (only the corrections)', () => {
  let second: Proposed;
  let pagamentoRef: string;

  it('recreates only what was rejected and the previous one (already applied) stays applied', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'store',
        system: 'figma',
        id: '1:20',
      }),
    );
    pagamentoRef = found.matches[0]!.ref;
    const before = hashOf(mappingPath());
    const firstBefore = readProposal(dir(), first.proposal.id);
    second = await propose(
      mcp,
      'store',
      [
        {
          op: 'create_marking',
          as: '$cartao',
          container: pagamentoRef,
          name: 'Card field',
          rect: { x: 20, y: 90, width: 560, height: 70 },
          source: figma('2:21'),
        },
        {
          op: 'create_annotation',
          marking: '$cartao',
          layer: 'Camada 1',
          entries: [{ key: 'mask', value: '0000 0000 0000 0000' }],
        },
      ],
      { title: 'Card field fix', supersedes: first.proposal.ref },
    );
    expect(hashOf(mappingPath())).toBe(before);
    expect(second.proposal).toMatchObject({
      supersedes: first.proposal.ref,
      baseRevision: 1,
    });
    expect(second.reviewChanges).toMatchObject({ total: 2, create: 2 });
    // The previous review was complete: no warning, and it stays `applied`.
    expect(second.warnings ?? []).toEqual([]);
    expect(second.superseded).toMatchObject({
      ref: first.proposal.ref,
      status: 'applied',
    });
    // Finding 13: the applied one is history and does not change; the response explains why (and what the app
    // shows), instead of leaving the agent waiting for `superseded`.
    expect(second.superseded).toEqual({
      ref: first.proposal.ref,
      status: 'applied',
      revision: firstBefore.revision,
      note: expect.stringMatching(/applied.*superseded by/s),
    });
    expect(readProposal(dir(), first.proposal.id)).toEqual(firstBefore);
    expect(readProposal(dir(), first.proposal.id).decisions).toEqual(firstDecisions());
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'store' }));
    const row = listed.proposals.find((r) => r.id === first.proposal.id)!;
    expect(row.supersededBy).toEqual([second.proposal.ref]);
    expect(listed.proposals.find((r) => r.id === second.proposal.id)!.supersedes).toBe(
      first.proposal.ref,
    );
  });

  it('accepts and applies the fix: the project now has the field, with the origin', () => {
    const project = acceptAllAndApply(dir(), second.proposal.id);
    expect(project.revision).toBe(2);
    const found = findBySource(project, 'figma', '2:21');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ marking: { rect: { y: 90, width: 560 } } });
  });

  it('replacing before the review finishes warns what was left behind', async () => {
    const markingRef = (
      ok(
        await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
          project: 'store',
          system: 'figma',
          id: '1:12',
        }),
      ).matches[0] as { ref: string }
    ).ref;
    const third = await propose(
      mcp,
      'store',
      [
        { op: 'update_marking', marking: markingRef, name: 'Pay now' },
        { op: 'update_marking', marking: markingRef, move: { dx: 0, dy: 10 } },
      ],
      { title: 'Button tweaks' },
    );
    expect(third.reviewChanges).toMatchObject({ total: 2, update: 2 });
    // The user accepts a name and leaves the rest undecided.
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
      'store',
      [
        { op: 'update_marking', marking: markingRef, name: 'Pay now' },
        { op: 'update_marking', marking: markingRef, move: { dx: 0, dy: 20 } },
      ],
      { title: 'Button tweaks (2)', supersedes: third.proposal.ref },
    );
    expect(fourth.warnings ?? []).toEqual([
      expect.objectContaining({
        code: 'superseded-incomplete',
        proposal: third.proposal.ref,
        undecided: 1,
        acceptedNotApplied: 1,
        // The name is the same in the new one; the position changed value.
        inNewProposal: { same: 1, different: 1, missing: 0 },
      }),
    ]);
    expect(fourth.superseded).toMatchObject({ status: 'superseded' });
    // The replaced one keeps the decisions and gained a revision (app decision + the replacement).
    const old = readProposal(dir(), third.proposal.id);
    expect(old.status).toBe('superseded');
    expect(old.revision).toBe(2);
    expect(old.decisions[nameChange.id]).toMatchObject({ state: 'accepted' });

    const got = ok(await mcp.call<Got>('get_proposal', { ref: third.proposal.ref }));
    expect(got.proposal.status).toBe('superseded');
    expect(got.progress).toMatchObject({ pending: 1, accepted: 1 });
  });

  it('superseded-incomplete counts as present the creations without source that the new one repeats (finding 15)', async () => {
    const operations = (input: Record<string, unknown>) => [
      {
        op: 'create_marking',
        as: '$senha',
        container: pagamentoRef,
        name: 'Senha',
        rect: { x: 20, y: 200, width: 500, height: 70 },
        source: figma('2:30'),
      },
      { op: 'create_annotation', marking: '$senha', type: 'input', values: input },
      {
        op: 'create_annotation',
        marking: '$senha',
        type: 'button',
        values: { id: 'btn_ver_senha', texto: 'Show' },
      },
    ];
    const fifth = await propose(mcp, 'store', operations({ id: 'input_senha' }), {
      title: 'Senha',
    });
    expect(fifth.reviewChanges).toMatchObject({ total: 3, create: 3 });
    const sixth = await propose(
      mcp,
      'store',
      operations({ id: 'input_senha', placeholder: 'Sua senha' }),
      { title: 'Senha (2)', supersedes: fifth.proposal.ref },
    );
    expect(sixth.warnings ?? []).toEqual([
      expect.objectContaining({
        code: 'superseded-incomplete',
        undecided: 3,
        // The marking (matched by origin) and the Button are equal; the Input gained the placeholder.
        inNewProposal: { same: 2, different: 1, missing: 0 },
      }),
    ]);
    expect(sixth.superseded).toMatchObject({ status: 'superseded' });
    expect(sixth.superseded).not.toHaveProperty('note');
    ok(await mcp.call('withdraw_proposal', { ref: sixth.proposal.ref }));
  });

  it('a nonexistent supersedes, or one from another project, is refused, without writing anything', async () => {
    const before = readdirSync(join(dir(), 'proposals')).length;
    const result = await mcp.call('propose_changes', {
      project: 'store',
      title: 'x',
      supersedes: 'p/00000000',
      operations: [{ op: 'create_layer', name: 'Outra' }],
    });
    expect(errorOf(result).code).toBe('proposal-not-found');
    expect(readdirSync(join(dir(), 'proposals')).length).toBe(before);
  });
});

/** The decisions written by the simulated review of the first proposal (nothing changed when replacing it). */
function firstDecisions() {
  const p = readProposal(dir(), first.proposal.id);
  return p.decisions;
}

describe('re-export: match by source and propose only what changed', () => {
  it('the same export, without differences, generates no proposal', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'store',
        system: 'figma',
        id: '1:11',
      }),
    );
    const titulo = found.matches[0]!.ref;
    const result = await mcp.call('propose_changes', {
      project: 'store',
      title: 'Nothing new',
      operations: [
        { op: 'update_marking', marking: titulo, name: 'Title', source: figma('1:11') },
      ],
    });
    expect(errorOf(result).code).toBe('no-changes');
  });

  it('field-by-field changes; rejecting only one of them and reading the note', async () => {
    const found = ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'store',
        system: 'figma',
        id: '1:11',
      }),
    );
    const titulo = found.matches[0]!.ref;
    const proposed = await propose(
      mcp,
      'store',
      [
        {
          op: 'update_marking',
          marking: titulo,
          name: 'Screen title',
          rect: { x: 20, y: 30, width: 400, height: 60 },
        },
      ],
      { title: 'Checkout re-export' },
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
      'The old position was right.',
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
        notes: [expect.objectContaining({ text: 'The old position was right.' })],
      }),
    ]);
    expect(review.notes).toEqual([]);
    const project = readProject(dir());
    const marking = [...projectIndex(project).markings.values()].find(
      (m) => m.source?.id === '1:11',
    )!;
    expect(marking.name).toBe('Screen title');
    expect(marking.rect.y).toBe(20);
  });

  it('find_by_source lists what open proposals will still create (without duplicating)', async () => {
    const proposed = await propose(
      mcp,
      'store',
      [
        {
          op: 'add_container',
          as: '$t3',
          file: 'fontes/tela1.png',
          name: 'Error',
          source: figma('1:30'),
        },
      ],
      { title: 'Error screen' },
    );
    const found = ok(
      await mcp.call<{
        total: number;
        proposed?: { proposal: string; entity: string; state: string }[];
      }>('find_by_source', { project: 'store', system: 'figma', id: '1:30' }),
    );
    expect(found.total).toBe(0);
    expect(found.proposed).toEqual([
      expect.objectContaining({
        proposal: proposed.proposal.ref,
        entity: 'image',
        state: 'pending',
      }),
    ]);
    // The image file name does not collide with that of the other still-open proposals.
    const again = await propose(
      mcp,
      'store',
      [{ op: 'add_container', file: 'fontes/tela1.png', name: 'Error 2' }],
      { title: 'Another screen' },
    );
    expect(again.files.images[0]).not.toBe(proposed.files.images[0]);
    expect(proposed.files.images[0]).toMatch(/images\/tela1-?\d*\.webp$/);
    for (const p of [proposed, again]) {
      ok(await mcp.call('withdraw_proposal', { ref: p.proposal.ref }));
    }
  });
});

describe('conflict and locked item, recomputed against the current project', () => {
  let proposed: Proposed;
  let markingId: string;

  it('the project edited after the proposal shows up as a conflict, with the current value', async () => {
    const project = readProject(dir());
    const marking = [...project.markings].find((m) => m.source?.id === '1:12')!;
    markingId = marking.id;
    proposed = await propose(
      mcp,
      'store',
      [
        {
          op: 'update_marking',
          marking: `m/${marking.id.replaceAll('-', '').slice(0, 8)}`,
          name: 'Pay it now',
          move: { dx: 0, dy: -10 },
        },
      ],
      { title: 'Button' },
    );
    // Someone (the app) edits the marking by hand and locks the item after the proposal.
    const edited = setMarkingLocked(
      renameMarking(project, marking.id, 'Pay!'),
      marking.id,
      true,
    );
    writeFileSync(mappingPath(), serialize({ ...edited, revision: edited.revision + 1 }));

    const got = ok(await mcp.call<Got>('get_proposal', { ref: proposed.proposal.ref }));
    expect(got.project.changedSinceProposal).toBe(true);
    expect(got.conflicts).toBe(1);
    const name = got.changes.find((c) => c.field === 'name')!;
    expect(name.conflict).toEqual({ current: 'Pay!' });
    expect(name).toMatchObject({ from: 'Pay button', to: 'Pay it now' });
    // A geometry change on a locked item brings the warning.
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
      await mcp.call<Listed>('list_proposals', { project: 'store', status: 'open' }),
    );
    expect(listed.proposals.find((r) => r.id === proposed.proposal.id)!.conflicts).toBe(
      1,
    );

    const review = ok(
      await mcp.call<Reviewed>('get_proposal_review', { ref: proposed.proposal.ref }),
    );
    expect(review.conflicts).toEqual([
      expect.objectContaining({ field: 'name', current: 'Pay!' }),
    ]);
  });

  it('withdrawing the proposal: only an open one, with the count of what is lost', async () => {
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
    // Withdrawing again, or withdrawing an already applied proposal, is refused.
    expect(
      errorOf(await mcp.call('withdraw_proposal', { ref: proposed.proposal.ref })),
    ).toMatchObject({ code: 'not-open', status: 'withdrawn' });
    expect(
      errorOf(await mcp.call('withdraw_proposal', { ref: first.proposal.ref })).code,
    ).toBe('not-open');
    // The item stays the way the app left it: the withdrawal does not touch the project.
    expect(projectIndex(readProject(dir())).markings.get(markingId)!.name).toBe('Pay!');
  });
});

describe('find_types_by_source (applied v3 specialization)', () => {
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
    }>('find_types_by_source', { project: 'store', system: 'figma', ...args });

  it('finds the type by id (stronger) or by name, with the origin properties', async () => {
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

  it('requires id and/or name', async () => {
    expect(errorOf(await query({})).code).toBe('missing-query');
  });
});

describe('add_container and the old add_blank_image', () => {
  const box = { name: 'Card', width: 300, height: 200, background: '#FFFFFF' };

  it('add_container plans without a warning and becomes a formatVersion 4 proposal', async () => {
    const operations = [{ op: 'add_container', ...box }];
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[]; warnings?: unknown[] }>(
        'plan_changes',
        { project: 'store', operations },
      ),
    );
    expect(plan.valid).toBe(true);
    expect(plan.summary[0]).toContain('container "Card"');
    expect(plan.warnings).toBeUndefined();

    const proposed = await propose(mcp, 'store', operations, { title: 'Container' });
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.formatVersion).toBe(4);
    expect(
      proposal.changes.some((c) => c.entity === 'image' && c.kind === 'create'),
    ).toBe(true);
  });

  it('add_blank_image still applies, with a deprecated-op warning', async () => {
    const plan = ok(
      await mcp.call<{ valid: boolean; warnings?: { code: string; op: number }[] }>(
        'plan_changes',
        { project: 'store', operations: [{ op: 'add_blank_image', ...box }] },
      ),
    );
    expect(plan.valid).toBe(true);
    expect(plan.warnings).toEqual([
      expect.objectContaining({ code: 'deprecated-op', op: 0 }),
    ]);
  });
});

describe('source in the image and marking operations', () => {
  const refBySource = async (id: string) =>
    ok(
      await mcp.call<{ matches: { ref: string }[] }>('find_by_source', {
        project: 'store',
        system: 'figma',
        id,
      }),
    ).matches[0]!.ref;

  it('sets, swaps and clears the origin; each becomes the `source` change', async () => {
    const titulo = await refBySource('1:11');
    const checkout = await refBySource('1:10');
    const operations = [
      { op: 'update_marking', marking: titulo, source: null },
      { op: 'update_container', container: checkout, source: figma('1:10-v2') },
      {
        op: 'create_marking',
        as: '$novo',
        container: checkout,
        rect: { x: 400, y: 400, width: 50, height: 50 },
        source: { system: 'sketch', id: 'abc' },
      },
    ];
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'store',
        operations,
      }),
    );
    expect(plan.valid).toBe(true);
    expect(plan.summary[0]).toContain('no source');
    expect(plan.summary[1]).toContain('source figma:1:10-v2');
    expect(plan.summary[2]).toContain('source sketch:abc');

    const proposed = await propose(mcp, 'store', operations, { title: 'Origins' });
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
    // The creation carries the origin inside the entity; an omitted url becomes null.
    const created = proposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!;
    expect((created.to as { source: unknown }).source).toEqual({
      system: 'sketch',
      id: 'abc',
      url: null,
    });
    // While the proposal awaits review, find_by_source warns that it will create that element.
    const found = ok(
      await mcp.call<{ total: number; proposed?: { entity: string }[] }>(
        'find_by_source',
        {
          project: 'store',
          system: 'sketch',
          id: 'abc',
        },
      ),
    );
    expect(found.total).toBe(0);
    expect(found.proposed).toEqual([expect.objectContaining({ entity: 'marking' })]);
    ok(await mcp.call('withdraw_proposal', { ref: proposed.proposal.ref }));
  });

  it('an origin without system or id is refused by the model', async () => {
    const titulo = await refBySource('1:11');
    const plan = ok(
      await mcp.call<{ valid: boolean; errors?: { code: string }[] }>('plan_changes', {
        project: 'store',
        operations: [
          { op: 'update_marking', marking: titulo, source: { system: ' ', id: 'x' } },
        ],
      }),
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors?.map((e) => e.code)).toEqual(['invalid-source']);
  });
});

describe('the agent never changes the mapping.json', () => {
  it('no proposal tool touches the mapping.json (nor the copies in specs/)', async () => {
    const files = [mappingPath(), join(dir(), 'specs', 'sdui.json')];
    const before = files.map((f) => hashOf(f));
    const imagesBefore = projectImages();

    const a = await propose(mcp, 'store', [{ op: 'create_layer', name: 'Test events' }], {
      title: 'A',
    });
    const b = await propose(mcp, 'store', [{ op: 'create_layer', name: 'Others' }], {
      title: 'B',
      supersedes: a.proposal.ref,
    });
    ok(
      await mcp.call('plan_changes', {
        project: 'store',
        operations: [{ op: 'create_layer', name: 'C' }],
      }),
    );
    ok(await mcp.call('list_proposals', { project: 'store' }));
    ok(await mcp.call('get_proposal', { ref: b.proposal.ref }));
    ok(await mcp.call('get_proposal_review', { ref: b.proposal.ref }));
    ok(await mcp.call('find_by_source', { system: 'figma', id: '1:12' }));
    ok(await mcp.call('withdraw_proposal', { ref: b.proposal.ref }));

    expect(files.map((f) => hashOf(f))).toEqual(before);
    expect(projectImages()).toEqual(imagesBefore);
    // Also on an invalid batch and on operations the model refuses.
    const invalid = await mcp.call<Proposed>('propose_changes', {
      project: 'store',
      title: 'Invalid',
      operations: [{ op: 'delete_container', container: 'i/00000000' }],
    });
    expect(invalid.data.valid).toBe(false);
    expect(files.map((f) => hashOf(f))).toEqual(before);
  });
  // The static guard of the writers (recursive) is in staticGuards.test.ts.
});

describe('project with unreadable proposals', () => {
  it('a broken folder shows up in `broken` without hiding the others', async () => {
    mkdirSync(join(dir(), 'proposals', 'quebrada'), { recursive: true });
    writeFileSync(join(dir(), 'proposals', 'quebrada', 'proposal.json'), '{ nada');
    mkdirSync(join(dir(), 'proposals', 'vazia'));
    const listed = ok(await mcp.call<Listed>('list_proposals', { project: 'store' }));
    expect(listed.total).toBeGreaterThan(3);
    expect(listed.broken?.map((b) => b.id)).toEqual(['quebrada', 'vazia']);
    expect(listed.broken![0]!.error).toContain('invalid JSON');
    expect(listed.broken![1]!.error).toBe('no proposal.json');
  });
});
