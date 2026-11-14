import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  proposalFilePath,
  serializeProposal,
  type Change,
  type Proposal,
} from '../../src/model';
import { encodePng, quadrants } from './images';
import {
  acceptAllAndApply,
  applyAcceptedOnDisk,
  errorOf,
  hashOf,
  ok,
  propose,
  readProject,
  readProposal,
  reviewDecide,
  reviewNote,
  type Failure,
  type Proposed,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// `revise_proposal` over stdio in the real bundle (stage #644, CP2): fixes the open proposal in
// the same proposal. Each case failed before the tool existed (the tool was not registered). The
// concurrency cases use the disk hook (`fsHooks.mjs`), which runs inside the server.

let base: string;
let root: string;
let hooks: string;
let mcp: Connection;
const dir = () => join(root, 'loja');
const mappingPath = () => join(dir(), 'mapping.json');
const proposalPath = (id: string) => join(dir(), proposalFilePath(id));
const proposalFolder = (id: string) => join(dir(), 'proposals', id);
const imagesOf = (id: string) =>
  existsSync(join(proposalFolder(id), 'images'))
    ? readdirSync(join(proposalFolder(id), 'images')).sort()
    : [];

interface Hooks {
  afterRead?: {
    match: string;
    nth?: number;
    append?: { file: string; text: string };
    copy?: { from: string; to: string };
  }[];
  fail?: { fn: string; match: string; code: string }[];
}
const arm = (config: Hooks) => writeFileSync(hooks, JSON.stringify(config));
const disarm = () => rmSync(hooks, { force: true });

interface Item {
  id: string;
  summary: string;
}
interface Revised {
  revised: boolean;
  dryRun?: true;
  proposal: { ref: string; id: string; title: string; status: string };
  revision: number;
  counts: { changed: number; added: number; dropped: number };
  changed: Item[];
  added: Item[];
  dropped: Item[];
  created: { kind: string; ref?: string }[];
  warnings?: { code: string }[];
  hint: string;
}

const revise = (ref: string, args: Record<string, unknown>) =>
  mcp.call<Revised>('revise_proposal', { project: 'loja', ref, ...args });

const markingRef = (name: string) => {
  const m = readProject(dir()).markings.find((x) => x.name === name);
  if (!m) throw new Error(`no marking ${name}`);
  return `m/${m.id.replaceAll('-', '').slice(0, 8)}`;
};
const markingId = (name: string) =>
  readProject(dir()).markings.find((x) => x.name === name)!.id;

function changeOf(p: Proposal, name: string, field: string | null): Change {
  const c = p.changes.find((x) => {
    if (x.entity !== 'marking') return false;
    if (field === null)
      return x.kind === 'create' && (x.to as { name?: string }).name === name;
    return x.kind === 'update' && x.field === field && x.entityId === markingId(name);
  });
  if (!c) throw new Error(`no change ${name}.${field}`);
  return c;
}

const rename = (name: string, to: string) => ({
  op: 'update_marking',
  marking: markingRef(name),
  name: to,
});

/** The test proposal: two renamed names and a new marking (one change id per effect). */
async function open(extra: unknown[] = []) {
  const proposed = await propose(
    mcp,
    'loja',
    [
      rename('Title', 'New title'),
      rename('Button', 'New button'),
      {
        op: 'create_marking',
        container: 'Screen',
        name: 'Extra',
        rect: { x: 50, y: 50, width: 100, height: 40 },
      },
      ...extra,
    ],
    { title: 'Fixable' },
  );
  const p = readProposal(dir(), proposed.proposal.id);
  return {
    proposed,
    id: proposed.proposal.id,
    ref: proposed.proposal.ref,
    p,
    title: changeOf(p, 'Title', 'name').id,
    button: changeOf(p, 'Button', 'name').id,
    extra: changeOf(p, 'Extra', null).id,
  };
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-revise-'));
  root = join(base, 'raiz');
  hooks = join(base, 'ganchos.json');
  for (const folder of ['fontes', 'fontes2'])
    mkdirSync(join(root, folder), { recursive: true });
  const png = await encodePng(quadrants(600, 800));
  for (const name of ['tela', 'a', 'b', 'c']) {
    for (const folder of ['fontes', 'fontes2']) {
      writeFileSync(join(root, folder, `${name}.png`), png);
    }
  }
  cpSync('tests/fixtures/material3', join(root, 'lib', 'material3'), { recursive: true });
  mcp = await connect([root], { fsHooks: hooks });
  ok(await mcp.call('create_project', { path: 'loja', name: 'Shop' }));
  const rect = (x: number) => ({ x, y: 10, width: 80, height: 40 });
  const seed = await propose(mcp, 'loja', [
    { op: 'add_container', as: '$t', file: 'fontes/tela.png', name: 'Screen' },
    ...['Title', 'Button', 'Applicable', 'Removable', 'Freezable'].map((name, i) => ({
      op: 'create_marking',
      container: '$t',
      name,
      rect: rect(10 + i * 100),
    })),
  ]);
  acceptAllAndApply(dir(), seed.proposal.id);
});

afterAll(async () => {
  disarm();
  await mcp?.close();
});

describe('revise_proposal: swap, withdrawal and what stays the same', () => {
  it('swaps one value and withdraws another change: same id, formatVersion 5, revision + 1', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'rejected');
    reviewNote(dir(), t.id, { level: 'change', id: t.title }, 'Not that name.');
    reviewDecide(dir(), t.id, { level: 'change', id: t.button }, 'accepted');
    reviewDecide(dir(), t.id, { level: 'change', id: t.extra }, 'rejected');
    const before = readProposal(dir(), t.id);
    const mappingHash = hashOf(mappingPath());

    const result = ok(
      await revise(t.ref, {
        operations: [rename('Title', 'Right title')],
        drop: [t.extra],
      }),
    );

    expect(result).toMatchObject({
      revised: true,
      proposal: { ref: t.ref, id: t.id, status: 'open' },
      revision: before.revision + 1,
      counts: { changed: 1, added: 0, dropped: 1 },
    });
    expect(result.changed.map((c) => c.id)).toEqual([t.title]);
    expect(result.dropped.map((c) => c.id)).toEqual([t.extra]);
    expect(result.changed[0]!.summary).toContain('Right title');

    const after = readProposal(dir(), t.id);
    expect(after.id).toBe(t.id);
    expect(after.formatVersion).toBe(5);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.changes.map((c) => c.id)).toEqual([t.title, t.button]);
    expect(after.changes[0]).toMatchObject({ id: t.title, to: 'Right title' });
    // The swapped one goes back to undecided and keeps the note; the untouched one keeps its decision.
    expect(after.decisions[t.title]).toBeUndefined();
    expect(after.decisions[t.button]).toEqual(before.decisions[t.button]);
    expect(after.notes).toEqual(before.notes);
    expect(after.revisions).toHaveLength(1);
    expect(after.revisions![0]).toMatchObject({
      changed: { [t.title]: { to: 'New title', state: 'rejected' } },
      added: [],
    });
    expect(after.revisions![0]!.dropped.map((d) => d.change.id)).toEqual([t.extra]);
    // The agent never writes the project.
    expect(hashOf(mappingPath())).toBe(mappingHash);
  });

  it('adds a new change with a never-used id and no decision', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.extra }, 'rejected');
    ok(await revise(t.ref, { drop: [t.extra] }));
    const second = ok(
      await revise(t.ref, {
        operations: [rename('Freezable', 'Another name')],
      }),
    );
    expect(second.counts).toEqual({ changed: 0, added: 1, dropped: 0 });
    const p = readProposal(dir(), t.id);
    const id = second.added[0]!.id;
    expect(id).not.toBe(t.extra);
    expect(p.changes.some((c) => c.id === id)).toBe(true);
    expect(p.decisions[id]).toBeUndefined();
    expect(p.revisions).toHaveLength(2);
  });

  it('dryRun: the same response, without writing anything', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'rejected');
    const hash = hashOf(proposalPath(t.id));
    const args = { operations: [rename('Title', 'Preview only')], drop: [t.extra] };
    const preview = ok(await revise(t.ref, { ...args, dryRun: true }));
    expect(hashOf(proposalPath(t.id))).toBe(hash);
    expect(preview).toMatchObject({ revised: false, dryRun: true });
    const real = ok(await revise(t.ref, args));
    expect({ ...preview, revised: true, dryRun: undefined }).toEqual({
      ...real,
      dryRun: undefined,
    });
  });
});

describe('revise_proposal: recusas', () => {
  it('change-frozen: the accepted change is not swapped and the file does not change', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'accepted');
    const hash = hashOf(proposalPath(t.id));
    const error = errorOf(
      await revise(t.ref, { operations: [rename('Title', 'Not allowed')] }),
    );
    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toEqual([t.title]);
    expect(String(error.hint)).toContain('supersedes');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
    // Withdrawing the accepted one too.
    expect(errorOf(await revise(t.ref, { drop: [t.title] })).code).toBe('change-frozen');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });

  it('proposal-applied: with something applied the way is supersedes', async () => {
    const t = await open([rename('Applicable', 'Applied')]);
    const applyId = changeOf(t.p, 'Applicable', 'name').id;
    reviewDecide(dir(), t.id, { level: 'change', id: applyId }, 'accepted');
    applyAcceptedOnDisk(dir(), t.id);
    expect(readProposal(dir(), t.id).status).toBe('open');
    const error = errorOf(await revise(t.ref, { drop: [t.extra] }));
    expect(error.code).toBe('proposal-applied');
    expect(String(error.hint)).toContain('supersedes');
  });

  it('not-open: proposta retirada', async () => {
    const t = await open();
    ok(await mcp.call('withdraw_proposal', { project: 'loja', ref: t.ref }));
    expect(errorOf(await revise(t.ref, { drop: [t.extra] })).code).toBe('not-open');
  });

  it('change-not-found e invalid-arguments (nada a fazer)', async () => {
    const t = await open();
    const hash = hashOf(proposalPath(t.id));
    const missing = errorOf(await revise(t.ref, { drop: ['c999'] }));
    expect(missing.code).toBe('change-not-found');
    expect(missing.changeIds).toEqual(['c999']);
    expect(errorOf(await revise(t.ref, {})).code).toBe('invalid-arguments');
    expect(errorOf(await revise(t.ref, { drop: [], operations: [] })).code).toBe(
      'invalid-arguments',
    );
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });

  it('no-changes: the batch repeats what the proposal already has', async () => {
    const t = await open();
    const hash = hashOf(proposalPath(t.id));
    const error = errorOf(
      await revise(t.ref, { operations: [rename('Title', 'New title')] }),
    );
    expect(error.code).toBe('no-changes');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });

  it('a batch with an error writes nothing and brings the errors per operation', async () => {
    const t = await open();
    const hash = hashOf(proposalPath(t.id));
    const result = ok(
      await revise(t.ref, {
        operations: [{ op: 'update_marking', marking: 'm/00000000', name: 'X' }],
      }),
    );
    expect(result).toMatchObject({ revised: false });
    expect((result as unknown as { errors: unknown[] }).errors).toHaveLength(1);
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });

  it('read-only: mapping.json with a newer schema', async () => {
    const t = await open();
    const original = readFileSync(mappingPath(), 'utf8');
    const doc = JSON.parse(original) as { schemaVersion: number };
    writeFileSync(mappingPath(), JSON.stringify({ ...doc, schemaVersion: 99 }, null, 2));
    try {
      expect(errorOf(await revise(t.ref, { drop: [t.extra] })).code).toBe('read-only');
    } finally {
      writeFileSync(mappingPath(), original);
    }
  });

  it('revise-unsupported: new library package in a revision', async () => {
    const t = await open();
    const hash = hashOf(proposalPath(t.id));
    const error = errorOf(
      await revise(t.ref, {
        operations: [
          { op: 'apply_specialization', file: 'lib/material3/material3.spec.json' },
        ],
      }),
    );
    expect(error.code).toBe('revise-unsupported');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });

  it('proposal-not-applicable: the project lost the item of a change', async () => {
    const t = await open([rename('Removable', 'Renamed')]);
    const stale = changeOf(t.p, 'Removable', 'name').id;
    const removal = await propose(mcp, 'loja', [
      { op: 'delete_marking', marking: markingRef('Removable') },
    ]);
    acceptAllAndApply(dir(), removal.proposal.id);
    const hash = hashOf(proposalPath(t.id));
    const error = errorOf(await revise(t.ref, { drop: [t.extra] }));
    expect(error.code).toBe('proposal-not-applicable');
    expect(error.changeIds).toEqual([stale]);
    expect(String(error.hint)).toContain('drop');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
    // Withdrawing the involved change, the revision passes.
    ok(await revise(t.ref, { drop: [stale] }));
  });
});

describe('revise_proposal: concurrency', () => {
  /** The file the app would write: the current proposal with the accepted change (`revision + 1`). */
  function stageAccepted(id: string, changeId: string): string {
    const p = readProposal(dir(), id);
    const staged = join(base, `aceita-${id}.json`);
    writeFileSync(
      staged,
      serializeProposal({
        ...p,
        revision: p.revision + 1,
        decisions: {
          ...p.decisions,
          [changeId]: { state: 'accepted', at: '2026-11-06T12:00:00.000Z' },
        },
      }),
    );
    return staged;
  }
  const armAppAccepts = (id: string, staged: string) =>
    arm({
      afterRead: [
        {
          match: proposalFilePath(id),
          nth: 2,
          copy: { from: staged, to: proposalPath(id) },
        },
      ],
    });

  it('the app accepts the change that would be swapped: recomputes and refuses with change-frozen', async () => {
    const t = await open();
    armAppAccepts(t.id, stageAccepted(t.id, t.title));
    let result;
    try {
      result = await revise(t.ref, { operations: [rename('Title', 'Race')] });
    } finally {
      disarm();
    }
    const error = errorOf(result);
    expect(error.code).toBe('change-frozen');
    expect(error.changeIds).toEqual([t.title]);
    const after = readProposal(dir(), t.id);
    expect(after.formatVersion).toBe(4);
    expect(after.decisions[t.title]?.state).toBe('accepted');
  });

  it('the app accepts another change: rereads, recomputes and writes without losing its decision', async () => {
    const t = await open();
    armAppAccepts(t.id, stageAccepted(t.id, t.button));
    let result;
    try {
      result = await revise(t.ref, { operations: [rename('Title', 'Race 2')] });
    } finally {
      disarm();
    }
    const done = ok(result);
    expect(done.counts.changed).toBe(1);
    const after = readProposal(dir(), t.id);
    expect(after.decisions[t.button]?.state).toBe('accepted');
    expect(after.changes.find((c) => c.id === t.title)?.to).toBe('Race 2');
    expect(after.revision).toBe(2);
  });

  it('the mapping.json changes during the computation: revision-conflict and nothing written', async () => {
    const t = await open();
    const hash = hashOf(proposalPath(t.id));
    arm({
      afterRead: [
        {
          match: join('fontes', 'c.png'),
          append: { file: mappingPath(), text: '\n' },
        },
      ],
    });
    let result;
    try {
      result = await revise(t.ref, {
        operations: [{ op: 'add_container', file: 'fontes/c.png', name: 'Outra' }],
      });
    } finally {
      disarm();
      writeFileSync(mappingPath(), readFileSync(mappingPath(), 'utf8').trimEnd() + '\n');
    }
    expect(errorOf(result).code).toBe('revision-conflict');
    expect(hashOf(proposalPath(t.id))).toBe(hash);
  });
});

describe('revise_proposal: imagens', () => {
  const swap = (file: string) => ({
    op: 'replace_container',
    container: 'Screen',
    file,
    confirmAspectChange: true,
  });

  it('the new file swap writes the image without overwriting; the image of the withdrawn swap goes away', async () => {
    const first = await propose(mcp, 'loja', [swap('fontes/a.png')], { title: 'Imagem' });
    const id = first.proposal.id;
    const before = imagesOf(id);
    expect(before).toHaveLength(1);
    const kept = Buffer.from(
      readFileSync(join(proposalFolder(id), 'images', before[0]!)),
    );

    const result = ok(
      await revise(first.proposal.ref, { operations: [swap('fontes2/a.png')] }),
    );
    expect(result.counts.changed).toBe(1);
    const after = imagesOf(id);
    // The new one has another name (the old one's was taken) and the old one left the folder.
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);
    expect(existsSync(join(proposalFolder(id), 'images', before[0]!))).toBe(false);
    expect(
      readFileSync(join(proposalFolder(id), 'images', after[0]!)).length,
    ).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    const p = readProposal(dir(), id);
    const file = (p.changes.find((c) => c.entity === 'image')!.to as { file?: string })
      .file;
    expect(file).toBe(`images/${after[0]}`);
  });

  it('withdrawing the file swap deletes the image; a failure to delete becomes a warning on stderr', async () => {
    const first = await propose(mcp, 'loja', [swap('fontes/b.png')], {
      title: 'Imagem 2',
    });
    const id = first.proposal.id;
    const [name] = imagesOf(id);
    const change = readProposal(dir(), id).changes.find((c) => c.entity === 'image')!;
    arm({ fail: [{ fn: 'rm', match: name!, code: 'EBUSY' }] });
    let result;
    try {
      result = await revise(first.proposal.ref, { drop: [change.id] });
    } finally {
      disarm();
    }
    // The revision holds even with the failure; the file stays and the warning goes to stderr.
    expect(ok(result).counts.dropped).toBeGreaterThan(0);
    expect(readProposal(dir(), id).changes.some((c) => c.entity === 'image')).toBe(false);
    expect(imagesOf(id)).toEqual([name]);
    expect(mcp.stderr()).toContain(name);

    // Without a failure, the next revision cleans up what was left.
    const third = ok(
      await revise(first.proposal.ref, { operations: [rename('Title', 'Clean')] }),
    );
    expect(third.revised).toBe(true);
    expect(imagesOf(id)).toEqual([]);
  });
});

describe('reads after the revision', () => {
  it('get_proposal, get_proposal_review e list_proposals show the revision', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'rejected');
    reviewNote(dir(), t.id, { level: 'change', id: t.title }, 'Nome errado.');
    reviewDecide(dir(), t.id, { level: 'change', id: t.extra }, 'rejected');
    reviewNote(dir(), t.id, { level: 'change', id: t.extra }, 'Not needed.');

    const beforeReview = ok(
      await mcp.call<Record<string, unknown>>('get_proposal_review', {
        project: 'loja',
        ref: t.ref,
      }),
    );
    expect(beforeReview).toMatchObject({ revisable: true, awaitingUser: [] });
    expect(String(beforeReview.hint)).toContain('revise_proposal');

    ok(
      await revise(t.ref, {
        operations: [rename('Title', 'Right title')],
        drop: [t.extra],
      }),
    );

    const got = ok(
      await mcp.call<{
        proposal: {
          revisions?: { count: number; last: { changed: number; dropped: number } };
        };
        changes: {
          id: string;
          revised?: { kind: string; previous?: { to: unknown; state: unknown } };
        }[];
      }>('get_proposal', { project: 'loja', ref: t.ref }),
    );
    expect(got.proposal.revisions).toMatchObject({
      count: 1,
      last: { changed: 1, added: 0, dropped: 1 },
    });
    const title = got.changes.find((c) => c.id === t.title)!;
    expect(title.revised).toMatchObject({
      kind: 'changed',
      previous: { to: 'New title', state: 'rejected' },
    });
    expect(got.changes.find((c) => c.id === t.button)!.revised).toBeUndefined();

    const review = ok(
      await mcp.call<{
        revisable: boolean;
        rejected: unknown[];
        awaitingUser: { change: string; revised: { kind: string } }[];
        notes: { text: string; fromDroppedChange?: { id: string } }[];
      }>('get_proposal_review', { project: 'loja', ref: t.ref }),
    );
    expect(review.revisable).toBe(true);
    expect(review.rejected).toEqual([]);
    expect(review.awaitingUser.map((a) => a.change)).toEqual([t.title]);
    const lifted = review.notes.find((n) => n.text === 'Not needed.');
    expect(lifted?.fromDroppedChange?.id).toBe(t.extra);

    const listed = ok(
      await mcp.call<{ proposals: { id: string; lastRevisedAt?: string }[] }>(
        'list_proposals',
        { project: 'loja' },
      ),
    );
    expect(listed.proposals.find((r) => r.id === t.id)?.lastRevisedAt).toBe(
      readProposal(dir(), t.id).revisions![0]!.at,
    );
    expect(
      listed.proposals.find((r) => r.id !== t.id && r.lastRevisedAt === undefined),
    ).toBeDefined();
  });

  it('get_proposal only shows revised on an undecided change (the same rule as the mark in the app)', async () => {
    const t = await open();
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'rejected');
    ok(await revise(t.ref, { operations: [rename('Title', 'Right title')] }));

    type Got = { changes: { id: string; revised?: unknown }[] };
    const read = async () =>
      ok(await mcp.call<Got>('get_proposal', { project: 'loja', ref: t.ref }));
    expect((await read()).changes.find((c) => c.id === t.title)!.revised).toBeDefined();

    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'accepted');
    expect((await read()).changes.find((c) => c.id === t.title)!.revised).toBeUndefined();
  });

  it('with something applied, the revision does not fit: revisable false and the hint points to supersedes', async () => {
    const t = await open([rename('Freezable', 'Applied')]);
    const applyId = changeOf(t.p, 'Freezable', 'name').id;
    reviewDecide(dir(), t.id, { level: 'change', id: applyId }, 'accepted');
    reviewDecide(dir(), t.id, { level: 'change', id: t.title }, 'rejected');
    applyAcceptedOnDisk(dir(), t.id);
    const review = ok(
      await mcp.call<{ revisable: boolean; hint: string }>('get_proposal_review', {
        project: 'loja',
        ref: t.ref,
      }),
    );
    expect(review.revisable).toBe(false);
    expect(review.hint).toContain('supersedes');
  });
});

export type { Failure, Proposed };
