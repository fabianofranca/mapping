import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addLayer,
  buildProposal,
  createProject,
  parseProposalText,
  proposalFilePath,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { ToolError } from '../../mcp/errors';
import { Roots } from '../../mcp/paths';
import {
  listStored,
  newProposalReserve,
  newProposalReserveAt,
  reservedImages,
  reviseStored,
  updateStored,
  writeNewProposal,
} from '../../mcp/proposalStore';
import type { ProjectLocation } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// The `revision` check of the proposal file (like the mapping.json one): whoever updates
// rereads the file right before writing and writes `revision + 1`.

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mapping-store-'));
  const dir = join(root, 'p');
  mkdirSync(dir);
  const location: ProjectLocation = { name: 'p', dir, root, path: 'p' };
  const base = createProject({
    name: 'P',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Layer 1', color: '#D32F2F' },
  });
  const after = addLayer(base, { id: 'L2', name: 'New', color: '#112233' });
  const proposal = buildProposal(base, after, {
    id: 'prop-1',
    title: 'Test',
    createdAt: NOW,
  });
  return { roots: new Roots([root]), dir, location, proposal };
}

const read = (dir: string, id: string): Proposal => {
  const parsed = parseProposalText(readFileSync(join(dir, proposalFilePath(id)), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.proposal;
};

describe('writeNewProposal and listStored', () => {
  it('writes the folder, the images and the proposal.json; a repeated id is refused', async () => {
    const { roots, dir, location, proposal } = setup();
    const result = await writeNewProposal(
      roots,
      location,
      proposal,
      new Map([['images/a.webp', new Uint8Array([1, 2, 3])]]),
    );
    expect(result.written).toEqual(['proposals/prop-1/images/a.webp']);
    expect(readdirSync(join(dir, 'proposals', 'prop-1')).sort()).toEqual([
      'images',
      'proposal.json',
    ]);
    expect(read(dir, 'prop-1')).toEqual(proposal);
    await expect(
      writeNewProposal(roots, location, proposal, new Map()),
    ).rejects.toThrow();
    // The failure does not delete the proposal that already existed.
    expect(read(dir, 'prop-1').id).toBe('prop-1');

    const stored = await listStored(roots, location);
    expect(stored.proposals.map((s) => s.id)).toEqual(['prop-1']);
    expect(stored.broken).toEqual([]);
  });

  it('a folder whose id does not match the file one is listed as broken', async () => {
    const { roots, dir, location, proposal } = setup();
    mkdirSync(join(dir, 'proposals', 'outra'), { recursive: true });
    writeFileSync(
      join(dir, 'proposals', 'outra', 'proposal.json'),
      serializeProposal(proposal),
    );
    const stored = await listStored(roots, location);
    expect(stored.proposals).toEqual([]);
    expect(stored.broken).toEqual([
      { id: 'outra', error: expect.stringContaining("does not match the folder's") },
    ]);
  });
});

describe('updateStored', () => {
  it('writes with revision + 1 and does not write if nothing changed', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const same = await updateStored(roots, location, 'prop-1', (p) => p);
    expect(same.revision).toBe(0);
    const updated = await updateStored(roots, location, 'prop-1', (p) => ({
      ...p,
      status: 'withdrawn',
    }));
    expect(updated).toMatchObject({ status: 'withdrawn', revision: 1 });
    expect(read(dir, 'prop-1')).toMatchObject({ status: 'withdrawn', revision: 1 });
  });

  it('if the app writes in between, rereads and tries again, without losing its decision', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const change = proposal.changes[0]!;
    let attempts = 0;
    const updated = await updateStored(roots, location, 'prop-1', (p) => {
      attempts++;
      if (attempts === 1) {
        // The app writes a decision (revision 1) between the server read and the server write.
        const decided: Proposal = {
          ...p,
          revision: 1,
          decisions: { [change.id]: { state: 'accepted', at: NOW } },
        };
        writeFileSync(join(dir, proposalFilePath('prop-1')), serializeProposal(decided));
      }
      return { ...p, status: 'superseded' };
    });
    expect(attempts).toBe(2);
    expect(updated).toMatchObject({ status: 'superseded', revision: 2 });
    expect(read(dir, 'prop-1').decisions[change.id]).toMatchObject({ state: 'accepted' });
  });

  it('refuses with revision-conflict if the file keeps changing', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    let revision = 0;
    const result = updateStored(roots, location, 'prop-1', (p) => {
      revision++;
      writeFileSync(
        join(dir, proposalFilePath('prop-1')),
        serializeProposal({ ...p, revision }),
      );
      return { ...p, status: 'withdrawn' };
    });
    await expect(result).rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(result).rejects.toBeInstanceOf(ToolError);
    // Nothing from the server was written over the external change.
    expect(read(dir, 'prop-1').status).toBe('open');
  });

  it('nonexistent proposal', async () => {
    const { roots, location } = setup();
    await expect(
      updateStored(roots, location, 'nao-existe', (p) => p),
    ).rejects.toMatchObject({ code: 'proposal-not-found' });
  });
});

// Proposal with four image creations: accepted, pending, rejected and applied.
function withImages(): Proposal {
  const base = createProject({
    name: 'P',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Layer 1', color: '#D32F2F' },
  });
  let after = base;
  for (const [id, file] of [
    ['I1', 'images/accepted.webp'],
    ['I2', 'images/pending.webp'],
    ['I3', 'images/rejected.webp'],
    ['I4', 'images/applied.webp'],
  ] as const) {
    after = addContainer(after, { id, file, width: 100, height: 100 });
  }
  const proposal = buildProposal(base, after, {
    id: 'prop-img',
    title: 'Images',
    createdAt: NOW,
  });
  const changeOf = (id: string) => proposal.changes.find((c) => c.entityId === id)!.id;
  return {
    ...proposal,
    decisions: {
      [changeOf('I1')]: { state: 'accepted', at: NOW },
      [changeOf('I3')]: { state: 'rejected', at: NOW },
      [changeOf('I4')]: { state: 'accepted', at: NOW },
    },
    applied: { [changeOf('I4')]: { at: NOW } },
  };
}

// Names in `images/` that a proposal still reserves (phase 8.5, M5): what can still be
// applied. In a `superseded` one, only the accepted ones (PROPOSAL-FORMAT.md, "States").
describe('reservedImages', () => {
  it('open: pending and accepted not applied', () => {
    expect(reservedImages(withImages()).sort()).toEqual([
      'images/accepted.webp',
      'images/pending.webp',
    ]);
  });

  it('superseded: only the accepted ones not applied (the pending ones can no longer be applied)', () => {
    const superseded = { ...withImages(), status: 'superseded' as const };
    expect(reservedImages(superseded)).toEqual(['images/accepted.webp']);
    // The previous one of a `supersedes`, still open on disk, goes in by the state it will have.
    expect(reservedImages(withImages(), 'superseded')).toEqual(['images/accepted.webp']);
  });

  it('applied, withdrawn or rejected: nothing', () => {
    // `rejected` (stage #2085): the review finished with nothing applied, so nothing is reserved.
    for (const status of ['applied', 'withdrawn', 'rejected'] as const) {
      expect(reservedImages({ ...withImages(), status })).toEqual([]);
    }
  });
});

// The reserve of a new proposal (stage #2523): what `propose_changes`, `plan_changes` and the
// batch-only preview keep free: the `images/` names and the canvas space of the proposals that
// can still be applied.
describe('newProposalReserve', () => {
  const stored = (proposal: Proposal) => ({ id: proposal.id, proposal, text: '' });
  const open = () => withImages();
  const ACCEPTED = 'images/accepted.webp';
  const PENDING = 'images/pending.webp';

  it('an open proposal reserves its pending and accepted files and creations', () => {
    const reserve = newProposalReserve([stored(open())], null);
    expect([...reserve.reservedImages].sort()).toEqual([ACCEPTED, PENDING]);
    expect(reserve.reservedContainers.map((c) => c.id).sort()).toEqual(['I1', 'I2']);
  });

  it('with its id as `supersededId`, only the accepted ones stay reserved', () => {
    const reserve = newProposalReserve([stored(open())], 'prop-img');
    expect([...reserve.reservedImages]).toEqual([ACCEPTED]);
    expect(reserve.reservedContainers.map((c) => c.id)).toEqual(['I1']);
  });

  it('another id as `supersededId` changes nothing', () => {
    const reserve = newProposalReserve([stored(open())], 'other');
    expect([...reserve.reservedImages].sort()).toEqual([ACCEPTED, PENDING]);
    expect(reserve.reservedContainers).toHaveLength(2);
  });

  it('a withdrawn or applied proposal reserves nothing, even when it is the superseded one', () => {
    for (const status of ['withdrawn', 'applied'] as const) {
      const done = stored({ ...open(), status });
      for (const supersededId of [null, 'prop-img']) {
        const reserve = newProposalReserve([done], supersededId);
        expect(reserve.reservedImages.size).toBe(0);
        expect(reserve.reservedContainers).toEqual([]);
      }
    }
  });

  it('a superseded proposal on disk keeps only its accepted ones', () => {
    const reserve = newProposalReserve(
      [stored({ ...open(), status: 'superseded' as const })],
      null,
    );
    expect([...reserve.reservedImages]).toEqual([ACCEPTED]);
    expect(reserve.reservedContainers.map((c) => c.id)).toEqual(['I1']);
  });

  it('gathers every proposal and no stored proposal gives an empty reserve', () => {
    const other = withImages();
    const second = {
      ...other,
      id: 'prop-2',
      changes: other.changes.map((c) =>
        c.entity === 'image' && c.kind === 'create'
          ? {
              ...c,
              to: {
                ...(c.to as object),
                file: `${String((c.to as { file: string }).file)}`.replace(
                  'images/',
                  'images/b-',
                ),
              },
            }
          : c,
      ),
    };
    const reserve = newProposalReserve([stored(open()), stored(second)], 'prop-img');
    expect(reserve.reservedImages.has(ACCEPTED)).toBe(true);
    expect(reserve.reservedImages.has(PENDING)).toBe(false);
    expect(reserve.reservedImages.has('images/b-pending.webp')).toBe(true);
    expect(newProposalReserve([], null)).toEqual({
      reservedImages: new Set(),
      reservedContainers: [],
    });
  });

  it('newProposalReserveAt reads the stored proposals of the project (a broken one reserves nothing)', async () => {
    const { roots, dir, location } = setup();
    const proposal = open();
    await writeNewProposal(roots, location, proposal, new Map());
    mkdirSync(join(dir, 'proposals', 'broken'), { recursive: true });
    writeFileSync(join(dir, 'proposals', 'broken', 'proposal.json'), '{ not json');
    const reserve = await newProposalReserveAt(roots, location);
    expect([...reserve.reservedImages].sort()).toEqual([ACCEPTED, PENDING]);
    expect(reserve.reservedContainers.map((c) => c.id).sort()).toEqual(['I1', 'I2']);
  });
});

describe('symbolic link in proposals/<id>/images and specs (stage #942, phase 2)', () => {
  it('reviseStored refuses the folder that points outside the roots and neither deletes nor writes in it', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const outside = mkdtempSync(join(tmpdir(), 'mapping-out-'));
    writeFileSync(join(outside, 'segredo.txt'), 'do not delete');
    symlinkSync(outside, join(dir, 'proposals', 'prop-1', 'images'), 'dir');
    await expect(
      reviseStored(roots, location, 'prop-1', true, async (p) => ({
        proposal: p,
        images: new Map([['images/new.webp', new Uint8Array([1])]]),
        check: async () => {},
        result: null,
      })),
    ).rejects.toMatchObject({ code: 'outside-roots' });
    expect(readdirSync(outside)).toEqual(['segredo.txt']);
  });

  it('the same for specs', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const outside = mkdtempSync(join(tmpdir(), 'mapping-out-'));
    writeFileSync(join(outside, 'segredo.txt'), 'do not delete');
    symlinkSync(outside, join(dir, 'proposals', 'prop-1', 'specs'), 'dir');
    await expect(
      reviseStored(roots, location, 'prop-1', true, async (p) => ({
        proposal: p,
        images: new Map(),
        check: async () => {},
        result: null,
      })),
    ).rejects.toMatchObject({ code: 'outside-roots' });
    expect(readdirSync(outside)).toEqual(['segredo.txt']);
  });
});

describe('tolerant listStored (stage #942, phase 2)', () => {
  it('a proposal.json that is too large goes to broken and the others carry on', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    mkdirSync(join(dir, 'proposals', 'grande'));
    const big = join(dir, 'proposals', 'grande', 'proposal.json');
    writeFileSync(big, '');
    truncateSync(big, 65 * 1024 * 1024);
    const listed = await listStored(roots, location);
    expect(listed.proposals.map((p) => p.id)).toEqual(['prop-1']);
    expect(listed.broken).toHaveLength(1);
    expect(listed.broken[0]).toMatchObject({ id: 'grande' });
    expect(listed.broken[0]!.error).toContain('file-too-large');
  });
});
