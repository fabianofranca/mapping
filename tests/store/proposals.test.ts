// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  deserialize,
  proposalFilePath,
  serialize,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';
import { loadProposals } from '../../src/storage/loadProposals';
import { createProposalStore } from '../../src/store/proposals';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import {
  NEW_IMAGE_PATH,
  diskProposal,
  openHarness,
  REVIEW_AT,
  type Harness,
  richScenario,
  writeOutside,
} from './proposalHarness';

afterEach(() => {
  clearReportedErrors();
  vi.restoreAllMocks();
});

const accept = (p: Proposal, changeId: string): Proposal => ({
  ...p,
  decisions: {
    ...p.decisions,
    [changeId]: { state: 'accepted', at: '2026-10-09T13:00:00.000Z' },
  },
});

// pt-BR kept: shared fixture data asserted by tests/components and tests/store (proposalHarness image path 'images/nova.webp' and proposal title 'Teste')
describe('ProposalStore: write with file check', () => {
  it('writes with revision + 1 and updates the list; the proposal keeps its object while it does not change', async () => {
    const { proposal, ids } = richScenario();
    const { root, session } = await openHarness({
      proposals: [{ ...proposal, revision: 4 }],
    });
    const before = session.proposals.list.value[0];

    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: 'done',
    }));
    expect(result).toMatchObject({ ok: true, value: 'done' });
    const disk = await diskProposal(root);
    expect(disk.revision).toBe(5);
    expect(disk.decisions[ids.name]?.state).toBe('accepted');
    expect(session.proposals.list.value[0]).toBe(result.ok ? result.proposal : null);
    expect(session.proposals.list.value[0]).not.toBe(before);

    // No change, nothing is written.
    const text = await root.read(proposalFilePath('P1'));
    const same = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: p,
      value: null,
    }));
    expect(same.ok).toBe(true);
    expect(await root.read(proposalFilePath('P1'))).toBe(text);
  });

  it('proposal that does not exist and error from the change function', async () => {
    const { session } = await openHarness({ proposals: [richScenario().proposal] });
    expect(
      await session.proposals.mutate('missing', (p) => ({
        ok: true,
        proposal: p,
        value: 1,
      })),
    ).toEqual({ ok: false, error: 'unknown-proposal' });
    expect(
      await session.proposals.mutate<number, 'refused'>('P1', () => ({
        ok: false,
        error: 'refused',
      })),
    ).toEqual({ ok: false, error: 'refused' });
  });

  it('if the file changed outside, starts from the disk version instead of overwriting it', async () => {
    const { proposal, ids } = richScenario();
    const { root, session } = await openHarness({ proposals: [proposal] });
    // The MCP rewrites the file (other title, revision 9) without the app knowing.
    writeOutside(root, { ...proposal, title: 'New title from the agent', revision: 9 });

    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: p.title,
    }));
    expect(result).toMatchObject({ ok: true, value: 'New title from the agent' });
    const disk = await diskProposal(root);
    expect(disk.title).toBe('New title from the agent');
    expect(disk.revision).toBe(10);
    expect(disk.decisions[ids.name]?.state).toBe('accepted');
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);
  });

  it('proposal deleted outside: "gone" error, leaves the list and warns', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.dirs.get('proposals')?.dirs.delete('P1');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'x' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'gone' });
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['removed']);
  });

  it('file that changed outside and became unreadable is not overwritten', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.put(proposalFilePath('P1'), '{ editing...');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'x' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'unreadable' });
    expect(await root.read(proposalFilePath('P1'))).toBe('{ editing...');
    expect(session.proposals.get('P1')?.title).toBe('Teste');
  });

  it('write failure: "write-failed" error and memory stays as it was', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    const dir = root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('no folder');
    dir.failWrites = new Error('disk full');
    const result = await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'new' },
      value: null,
    }));
    expect(result).toEqual({ ok: false, error: 'write-failed' });
    expect(session.proposals.get('P1')?.title).toBe('Teste');
  });

  it('writes run in a queue, each over the result of the previous one', async () => {
    const { proposal, ids } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    const bump = (changeId: string) =>
      session.proposals.mutate('P1', (p) => ({
        ok: true,
        proposal: accept(p, changeId),
        value: null,
      }));
    await Promise.all([bump(ids.name), bump(ids.rect), bump(ids.image)]);
    const disk = await diskProposal(root);
    expect(Object.keys(disk.decisions).sort()).toEqual(
      [ids.image, ids.name, ids.rect].sort(),
    );
    expect(disk.revision).toBe(3);
  });
});

describe('ProposalStore: folder check', () => {
  it('notices the new, the changed and the deleted proposal; its own writes do not count', async () => {
    const { proposal, ids } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });

    // The app writes: the next check does not take it as an external change.
    await session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: accept(p, ids.name),
      value: 0,
    }));
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);

    // The agent sends a new proposal and withdraws the first one.
    const other = richScenario('P2').proposal;
    writeOutside(root, { ...other, title: 'Second' });
    expect(await session.proposals.scan()).toEqual({
      added: ['P2'],
      changed: [],
      removed: [],
    });
    expect(session.proposals.list.value.map((p) => p.id).sort()).toEqual(['P1', 'P2']);

    const current = session.proposals.get('P1');
    if (!current) throw new Error('no P1');
    writeOutside(root, {
      ...current,
      status: 'withdrawn',
      revision: current.revision + 1,
    });
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: ['P1'],
      removed: [],
    });
    expect(session.proposals.get('P1')?.status).toBe('withdrawn');

    root.dirs.get('proposals')?.dirs.delete('P2');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: ['P2'],
    });
    expect(session.proposals.notices.value.map((n) => `${n.kind}:${n.id}`)).toEqual([
      'added:P2',
      'changed:P1',
      'removed:P2',
    ]);
    expect(session.proposals.notices.value[0]?.title).toBe('Second');

    session.proposals.clearNotices();
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('invalid file becomes a problem (only once) and leaves the list; once fixed, it appears', async () => {
    const { session, root } = await openHarness();
    root.put(proposalFilePath('P7'), '{ not json');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.problems.value.map((p) => p.id)).toEqual(['P7']);

    writeOutside(root, richScenario('P7').proposal);
    expect(await session.proposals.scan()).toEqual({
      added: ['P7'],
      changed: [],
      removed: [],
    });
    expect(session.proposals.problems.value).toEqual([]);
  });

  it('problems republishes when the set changes without changing size (item 37)', async () => {
    const { session, root } = await openHarness();
    root.put(proposalFilePath('P7'), '{ not json');
    await session.proposals.scan();
    expect(session.proposals.problems.value.map((p) => p.id)).toEqual(['P7']);

    // P7 goes away and another file breaks: it is still one problem, but a different one.
    root.dirs.get('proposals')?.dirs.delete('P7');
    root.put(proposalFilePath('P8'), '{ also broken');
    await session.proposals.scan();
    expect(session.proposals.problems.value.map((p) => p.id)).toEqual(['P8']);

    // The same file stays broken, with another error.
    const before = session.proposals.problems.value[0]?.errors;
    root.put(proposalFilePath('P8'), '[1, 2]');
    await session.proposals.scan();
    expect(session.proposals.problems.value[0]?.errors).not.toEqual(before);
  });

  it('a known proposal that becomes unreadable for a moment (editor writing) is ignored', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    root.put(proposalFilePath('P1'), '{ editing');
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.get('P1')?.title).toBe('Teste');
    expect(session.proposals.problems.value).toEqual([]);
  });

  // Phase 8.2 (P4): a proposal's notice leaves the queue through a store action (whoever opens the
  // review calls it), of the given kind or all.
  it('dismissNotice removes a notices of a proposal from the queue, by kind or all', async () => {
    const { session, root } = await openHarness({ skipProposals: true });
    writeOutside(root, richScenario('P1').proposal);
    writeOutside(root, richScenario('P2').proposal);
    await session.proposals.scan();
    const kinds = () => session.proposals.notices.value.map((n) => `${n.kind}:${n.id}`);
    expect(kinds()).toEqual(['added:P1', 'added:P2']);
    const before = session.proposals.notices.value;
    session.proposals.dismissNotice('P3', 'added');
    expect(session.proposals.notices.value).toBe(before);
    session.proposals.dismissNotice('P1', 'changed');
    expect(session.proposals.notices.value).toBe(before);
    session.proposals.dismissNotice('P1', 'added');
    expect(kinds()).toEqual(['added:P2']);
    writeOutside(root, { ...richScenario('P2').proposal, title: 'Other' });
    await session.proposals.scan();
    expect(kinds()).toEqual(['added:P2', 'changed:P2']);
    session.proposals.dismissNotice('P2');
    expect(kinds()).toEqual([]);
  });

  it('session.sync() checks the proposals together with mapping.json', async () => {
    const { session, root } = await openHarness({ skipProposals: true });
    expect(session.proposals.list.value).toEqual([]);
    writeOutside(root, richScenario().proposal);
    expect(await session.sync()).toBe('unchanged');
    expect(session.proposals.list.value.map((p) => p.id)).toEqual(['P1']);
    expect(session.proposals.notices.value[0]).toMatchObject({ kind: 'added', id: 'P1' });
  });
});

// Stage #1777 (decision 8): the cycle check does not re-read the final proposals (`applied` and
// `withdrawn`) already read with a known stamp; the full one (focus, return to the page, "Check the
// folder now") looks at all of them.
describe('ProposalStore: cycle and full check (stage #1777)', () => {
  const cycle = { full: false } as const;
  const none = { added: [], changed: [], removed: [] };

  async function withFinal(status: 'applied' | 'withdrawn' | 'superseded') {
    const { proposal } = richScenario();
    const final: Proposal = { ...proposal, status };
    const harness = await openHarness({ proposals: [final] });
    return { ...harness, final };
  }

  it.each(['applied', 'withdrawn'] as const)(
    'a %s rewritten outside is only re-read in the full check',
    async (status) => {
      const { session, root, final } = await withFinal(status);
      expect(await session.proposals.scan(cycle)).toEqual(none);
      writeOutside(root, {
        ...final,
        title: 'Rewritten outside',
        revision: final.revision + 1,
      });
      expect(await session.proposals.scan(cycle)).toEqual(none);
      expect(session.proposals.get('P1')?.title).toBe(final.title);
      expect(await session.proposals.scan({ full: true })).toEqual({
        ...none,
        changed: ['P1'],
      });
      expect(session.proposals.get('P1')?.title).toBe('Rewritten outside');
    },
  );

  it('without an option, the check is the full one (like "Check the folder now")', async () => {
    const { session, root, final } = await withFinal('applied');
    writeOutside(root, { ...final, title: 'Another', revision: final.revision + 1 });
    expect(await session.proposals.scan()).toEqual({ ...none, changed: ['P1'] });
  });

  it('a new folder in proposals/ appears in the cycle, next to the skipped final ones', async () => {
    const { session, root } = await withFinal('applied');
    writeOutside(root, { ...richScenario('P2').proposal, title: 'New' });
    expect(await session.proposals.scan(cycle)).toEqual({ ...none, added: ['P2'] });
    expect(session.proposals.list.value.map((p) => p.id).sort()).toEqual(['P1', 'P2']);
  });

  it('the `superseded` one (still with accepted changes to apply) is checked in every cycle', async () => {
    const { session, root, final } = await withFinal('superseded');
    writeOutside(root, { ...final, title: 'Changed', revision: final.revision + 1 });
    expect(await session.proposals.scan(cycle)).toEqual({ ...none, changed: ['P1'] });
  });

  it('the `open` one is checked in every cycle, and the one that becomes final stops being', async () => {
    const { proposal } = richScenario();
    const { session, root } = await openHarness({ proposals: [proposal] });
    writeOutside(root, {
      ...proposal,
      title: 'Changed',
      revision: proposal.revision + 1,
    });
    expect(await session.proposals.scan(cycle)).toEqual({ ...none, changed: ['P1'] });
    // Now `applied` outside: the cycle still sees it change (it was open); afterwards, no more.
    const applied: Proposal = {
      ...proposal,
      status: 'applied',
      revision: proposal.revision + 2,
    };
    writeOutside(root, applied);
    expect(await session.proposals.scan(cycle)).toEqual({ ...none, changed: ['P1'] });
    writeOutside(root, {
      ...applied,
      title: 'After applied',
      revision: applied.revision + 1,
    });
    expect(await session.proposals.scan(cycle)).toEqual(none);
  });

  it('a skipped final one whose folder was deleted outside disappears right in the cycle', async () => {
    const { session, root } = await withFinal('applied');
    root.dirs.get('proposals')?.dirs.delete('P1');
    expect(await session.proposals.scan(cycle)).toEqual({ ...none, removed: ['P1'] });
  });

  it('without `stampProposals` (storage that only lists and stamps), the result is the same', async () => {
    const { storage, final, root } = await withFinal('applied');
    const bare = { ...storage, stampProposals: undefined };
    const store = createProposalStore({
      storage: bare,
      initial: await loadProposals(bare),
      now: () => REVIEW_AT,
    });
    expect(await store.scan(cycle)).toEqual(none);
    writeOutside(root, { ...final, title: 'Outside', revision: final.revision + 1 });
    expect(await store.scan({ full: true })).toEqual({ ...none, changed: ['P1'] });
    writeOutside(root, { ...richScenario('P2').proposal });
    expect(await store.scan(cycle)).toEqual({ ...none, added: ['P2'] });
  });

  it('session.sync() only checks the final ones in the full check (with `images`)', async () => {
    const { session, root, final } = await withFinal('applied');
    writeOutside(root, { ...final, title: 'Rewritten', revision: final.revision + 1 });
    await session.sync();
    expect(session.proposals.get('P1')?.title).toBe(final.title);
    await session.sync({ images: true });
    expect(session.proposals.get('P1')?.title).toBe('Rewritten');
  });
});

describe('ProposalStore.remove: delete a closed proposal (phase 9.2)', () => {
  const closed = (id: string, status: Proposal['status']): Proposal => ({
    ...richScenario(id).proposal,
    status,
  });

  it('deletes proposals/<id>/ from disk (file and images), removes it from the list and raises no "deleted outside" notice', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn'), closed('P2', 'superseded')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    const result = await session.proposals.remove('P1');
    expect(result).toMatchObject({ ok: true });
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.proposals.list.value.map((p) => p.id)).toEqual(['P2']);
    expect(session.proposals.notices.value).toEqual([]);

    // The next folder check warns nothing.
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
    expect(session.proposals.notices.value).toEqual([]);
    expect(session.proposals.get('P1')).toBeNull();
    // The other proposal stays intact.
    expect(await diskProposal(root, 'P2')).toMatchObject({ id: 'P2' });
  });

  it('the zip exported afterwards carries neither the deleted proposal nor its images', async () => {
    const { session } = await openHarness({
      proposals: [closed('P1', 'applied'), closed('P2', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP', 'proposals/P2/images/nova.webp': 'W2' },
    });
    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });
    const files = await session.collectFiles();
    expect([...files.proposals.keys()]).toEqual([proposalFilePath('P2')]);
    // The images only go out for the export if the proposal still waits for them.
    expect([...files.proposalImages.keys()]).not.toContain(NEW_IMAGE_PATH);
  });

  it('refuses the open proposal, without deleting anything', async () => {
    const { session, root } = await openHarness({ proposals: [richScenario().proposal] });
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await diskProposal(root)).toMatchObject({ id: 'P1', status: 'open' });
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('re-reads the file: if the agent reopened the proposal outside, refuses and adopts the disk version', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    expect(session.proposals.get('P1')?.status).toBe('withdrawn');
    // Outside the app, the file is open again (another revision).
    writeOutside(root, { ...richScenario().proposal, revision: 5 });

    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'not-removable',
    });
    expect(await diskProposal(root)).toMatchObject({ status: 'open', revision: 5 });
    expect(session.proposals.get('P1')).toMatchObject({ status: 'open', revision: 5 });
  });

  it('file that changed outside and became unreadable: refuses and does not delete', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    root.put(proposalFilePath('P1'), '{ editing...');
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'unreadable',
    });
    expect(await root.read(proposalFilePath('P1'))).toBe('{ editing...');
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(session.proposals.get('P1')).not.toBeNull();
  });

  it('unknown proposal: unknown-proposal', async () => {
    const { session } = await openHarness({ proposals: [closed('P1', 'withdrawn')] });
    expect(await session.proposals.remove('missing')).toEqual({
      ok: false,
      error: 'unknown-proposal',
    });
  });

  it('the file already disappeared outside: deletes what is left of the folder, with no notice', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    root.dirs.get('proposals')?.dirs.get('P1')?.files.delete('proposal.json');
    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });
    expect(await root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(session.proposals.list.value).toEqual([]);
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('delete failure: remove-failed, the proposal stays in the list and the error goes to Diagnostics', async () => {
    const { session, storage } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    vi.spyOn(storage, 'removeProposal').mockRejectedValue(new Error('permission denied'));
    expect(await session.proposals.remove('P1')).toEqual({
      ok: false,
      error: 'remove-failed',
    });
    expect(session.proposals.get('P1')).not.toBeNull();
    expect(reportedErrors.value.map((e) => e.context)).toContain('proposals.remove');
  });

  it('removes that notices of that proposal and calls onRemoved only after deleting', async () => {
    const { session, root } = await openHarness({
      proposals: [closed('P1', 'withdrawn')],
    });
    // Changed outside (still closed): the "changed" notice enters the queue.
    writeOutside(root, { ...closed('P1', 'withdrawn'), title: 'Touched', revision: 2 });
    await session.proposals.scan();
    expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);

    let existedWhenCalled: boolean | null = null;
    await session.proposals.remove('P1', () => {
      existedWhenCalled = root.dirs.get('proposals')?.dirs.has('P1') ?? false;
    });
    expect(existedWhenCalled).toBe(false);
    expect(session.proposals.notices.value).toEqual([]);
  });

  it('a new proposal with supersedes pointing to the deleted one stays listed, with no error', async () => {
    const old = closed('P1', 'superseded');
    const newer: Proposal = { ...richScenario('P2').proposal, supersedes: 'P1' };
    const { session, review } = await openHarness({ proposals: [old, newer] });
    expect(
      review.derived.rows.value.find((r) => r.proposal.id === 'P1')?.supersededBy,
    ).toMatchObject({ id: 'P2' });

    expect(await session.proposals.remove('P1')).toMatchObject({ ok: true });

    const rows = review.derived.rows.value;
    expect(rows.map((r) => r.proposal.id)).toEqual(['P2']);
    expect(rows[0]).toMatchObject({ supersededBy: null, leftBehind: null });
    // Opening the new one in the review does not depend on the deleted one.
    expect(review.open('P2')).toMatchObject({ ok: true });
    expect(review.derived.supersession.value).toBeNull();
    review.close();
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
  });

  it('goes into the queue: a write in progress finishes before deleting', async () => {
    const { session, root } = await openHarness({ proposals: [closed('P1', 'applied')] });
    const note = session.proposals.mutate('P1', (p) => ({
      ok: true,
      proposal: { ...p, title: 'With note' },
      value: null,
    }));
    const removal = session.proposals.remove('P1');
    expect(await note).toMatchObject({ ok: true });
    expect(await removal).toMatchObject({ ok: true });
    expect(root.dirs.get('proposals')?.dirs.has('P1')).toBe(false);
    // No proposal resurrected by the write.
    expect(await session.proposals.scan()).toEqual({
      added: [],
      changed: [],
      removed: [],
    });
  });
});

describe('export proposals', () => {
  it('collectFiles carries the proposals and the images awaiting acceptance', async () => {
    const { proposal } = richScenario();
    const { session } = await openHarness({
      proposals: [proposal],
      files: { [NEW_IMAGE_PATH]: 'WEBP' },
    });
    const files = await session.collectFiles();
    expect([...files.proposals.keys()]).toEqual([proposalFilePath('P1')]);
    expect(files.proposals.get(proposalFilePath('P1'))).toBe(serializeProposal(proposal));
    expect([...files.proposalImages.keys()]).toEqual([NEW_IMAGE_PATH]);
    expect(await files.proposalImages.get(NEW_IMAGE_PATH)?.text()).toBe('WEBP');
  });

  it('the invalid file also goes, so nothing is lost on export', async () => {
    const { session } = await openHarness({
      files: { [proposalFilePath('P9')]: '{ broken' },
    });
    const files = await session.collectFiles();
    expect(files.proposals.get(proposalFilePath('P9'))).toBe('{ broken');
  });
});

describe('apply accepted only completes if mapping.json was written (phase 5.2)', () => {
  const files = { [NEW_IMAGE_PATH]: 'WEBP' };

  /** Everything accepted, ready to apply. */
  async function readyToApply(): Promise<Harness> {
    const { proposal } = richScenario();
    const h = await openHarness({ proposals: [proposal], files });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(h.review.derived.canApply.value).toBe(true);
    return h;
  }

  /** Nothing changed: project without the changes, empty history, open proposal and images in place. */
  async function expectNothingApplied(h: Harness) {
    const { session, root, review } = h;
    expect(session.store.project.value?.containers.map((i) => i.id)).not.toContain('I3');
    expect(session.store.canUndo.value).toBe(false);
    expect(session.store.canRedo.value).toBe(false);
    await session.proposals.settled();
    const disk = await diskProposal(root);
    expect(disk.applied).toEqual({});
    expect(disk.status).toBe('open');
    expect(disk.revision).toBe(1);
    expect(Object.keys(disk.decisions)).toHaveLength(5);
    expect(await root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    expect(await root.read('images/nova.webp')).toBeNull();
    // The review stays open, with the decisions intact.
    expect(review.proposalId.value).toBe('P1');
    expect(review.derived.counts.value).toMatchObject({ applied: 0, acceptedPending: 5 });
  }

  it('mapping.json changed outside: save-failed, nothing applied and the conflict dialog opens', async () => {
    const h = await readyToApply();
    // The MCP writes mapping.json outside while the review is open.
    const base = sampleProject();
    const outside = serialize({
      ...base,
      project: { ...base.project, name: 'From the agent' },
      revision: 4,
    });
    h.root.put('mapping.json', outside);

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toEqual({ reloadFailed: false });
    expect(await h.root.read('mapping.json')).toBe(outside);

    // "Reload": the disk project; the proposal stays open and can be applied.
    await h.session.resolveConflict('reload');
    expect(h.session.conflict.value).toBeNull();
    expect(h.session.store.project.value?.project.name).toBe('From the agent');
    expect(h.review.derived.counts.value.acceptedPending).toBe(5);
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('storage error when writing mapping.json: save-failed and nothing applied', async () => {
    const h = await readyToApply();
    const save = vi
      .spyOn(h.storage, 'saveMapping')
      .mockRejectedValue(new Error('quota exceeded'));

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toBeNull();

    // The storage comes back: applying again completes.
    save.mockRestore();
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(await h.root.read(NEW_IMAGE_PATH)).toBeNull();
    expect(h.session.saveStatus.value).toBe('saved');
  });

  /** The `mapping.json` on disk, read again. */
  async function diskProject(h: Harness) {
    const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
    if (!parsed.ok) throw new Error('invalid mapping.json');
    return parsed.project;
  }

  // Third reading of stage 8 (audit, §6.1): a check adopts a mapping.json from
  // outside during the proposal.json failure. The outside file cites the copy; the rollback of
  // the compensation cannot delete it.
  it('proposal.json failing with mapping.json reloaded outside in the window: the copy cited by the disk stays', async () => {
    const h = await readyToApply();
    vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async () => {
      // The applied mapping.json already wrote and cites images/nova.webp. In that window, the MCP
      // re-reads it, edits the project name and writes revision + 1 (the file keeps citing the copy).
      const applied = await diskProject(h);
      expect(applied.containers.map((i) => i.file)).toContain('images/nova.webp');
      h.root.put(
        'mapping.json',
        serialize({
          ...applied,
          revision: applied.revision + 1,
          project: { ...applied.project, name: 'From the agent' },
        }),
      );
      // The useExternalChanges poll checks and reloads (no local pending change: 'reloaded').
      // We cannot wait for the whole sync promise here (the proposals scan stays
      // behind this same mutation): wait only for the session queue's work.
      void h.session.sync();
      await h.session.flush();
      expect(h.session.reloads.value).toBe(1);
      throw new Error('disk full');
    });

    expect(await h.review.apply()).toEqual({ ok: false, error: 'write-failed' });
    await h.session.proposals.settled();
    // The in-memory and on-disk projects are the outside one, and it cites the copy.
    expect(h.session.store.project.value?.project.name).toBe('From the agent');
    expect(h.session.store.project.value?.containers.map((i) => i.file)).toContain(
      'images/nova.webp',
    );
    expect((await diskProject(h)).containers.map((i) => i.file)).toContain(
      'images/nova.webp',
    );
    // The proposal stays without `applied` and the source is still there.
    expect((await diskProposal(h.root)).applied).toEqual({});
    expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    // The point of the question: the compensation rollback cannot delete a file that the disk cites.
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
  });

  // Phase 8.2 (P7): `mapping.json` wrote, but `proposal.json` failed. Without compensating, the
  // project kept the changes and the proposal without `applied` (reapplying gave a conflict,
  // duplicate images). Now the apply is undone as in `save-failed`: the undo entry
  // leaves, the previous project is rewritten and the copies leave `images/`.
  it('proposal.json failing after mapping.json wrote: write-failed, the project goes back to the previous one and applying again completes (P7)', async () => {
    const h = await readyToApply();
    const dir = h.root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('no proposal folder');
    dir.failWrites = new Error('disk full');

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'write-failed' });
    await expectNothingApplied(h);
    expect(h.session.conflict.value).toBeNull();
    // The disk has the previous project, rewritten over the applied one (two extra revisions).
    const disk = await diskProject(h);
    expect(disk.containers.map((i) => i.id)).not.toContain('I3');
    expect(disk.revision).toBe(5);
    expect(h.session.saveStatus.value).toBe('saved');

    // The proposal's disk comes back: applying again completes, with no conflict or duplicate.
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
    expect((await diskProposal(h.root)).status).toBe('applied');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(await h.root.read(NEW_IMAGE_PATH)).toBeNull();
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
    expect(h.session.store.canUndo.value).toBe(true);
  });

  it('proposal.json and then mapping.json failing: the copies stay until the write goes through (P7)', async () => {
    const h = await readyToApply();
    const dir = h.root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('no proposal folder');
    dir.failWrites = new Error('disk full');
    // The first write of mapping.json (the applied one) passes; the compensation one fails.
    const original = h.storage.saveMapping.bind(h.storage);
    let calls = 0;
    const save = vi.spyOn(h.storage, 'saveMapping').mockImplementation((text) => {
      calls++;
      return calls === 2 ? Promise.reject(new Error('quota')) : original(text);
    });

    expect(await h.review.apply()).toEqual({ ok: false, error: 'write-failed' });
    // In memory, the previous project; on disk, still the applied one, which cites the copy: it stays.
    expect(h.session.store.project.value?.containers.map((i) => i.id)).not.toContain(
      'I3',
    );
    expect(h.session.store.canUndo.value).toBe(false);
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBe('WEBP');
    expect(h.session.saveStatus.value).toBe('error');

    // "Try again": the previous project goes to disk and the cleanup removes the orphan copy.
    save.mockRestore();
    expect(await h.session.flush()).toEqual({ ok: true });
    expect((await diskProject(h)).containers.map((i) => i.id)).not.toContain('I3');
    expect(await h.root.read('images/nova.webp')).toBeNull();
    expect(await h.root.read(NEW_IMAGE_PATH)).toBe('WEBP');
    dir.failWrites = null;
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 5, files: 1 });
  });

  it('undoing the application with proposal.json failing: the step is reverted, the proposal stays applied on disk and the error stays visible', async () => {
    const h = await readyToApply();
    expect(await h.review.apply()).toMatchObject({ ok: true });
    const store = h.session.store;
    const applied = store.project.value;
    const dir = h.root.dirs.get('proposals')?.dirs.get('P1');
    if (!dir) throw new Error('no proposal folder');
    dir.failWrites = new Error('disk full');

    expect(store.undo()).toBe(true);
    // While the write does not finish, the history stays still.
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(false);
    expect(store.undo()).toBe(false);
    await h.session.proposals.settled();
    await vi.waitFor(() => expect(store.linkFailure.value).not.toBeNull());

    expect(store.linkFailure.value?.error).toBe('write-failed');
    expect(store.project.value).toBe(applied);
    expect(store.canUndo.value).toBe(true);
    expect(store.canRedo.value).toBe(false);
    dir.failWrites = null;
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  /**
   * Holds the next write of `proposal.json`: `reached` resolves when it starts (the
   * project was already applied and `mapping.json` written); `release()` lets it go on, or
   * fail with the given error.
   */
  function holdProposalWrite(h: Harness) {
    const original = h.storage.writeProposal.bind(h.storage);
    let release: (error?: Error) => void = () => undefined;
    const held = new Promise<Error | undefined>((resolve) => {
      release = resolve;
    });
    let reachedNow: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      reachedNow = resolve;
    });
    vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async (id, text) => {
      reachedNow();
      const error = await held;
      if (error) throw error;
      return original(id, text);
    });
    return { reached, release };
  }

  /** The review without warnings: valid set, no conflict, nothing "new". */
  function expectNoWarnings(h: Harness) {
    const d = h.review.derived;
    expect(d.validation.value?.ok).toBe(true);
    expect(d.validation.value?.issues).toEqual([]);
    expect([...d.conflictIds.value]).toEqual([]);
    expect([...h.review.newConflicts.value]).toEqual([]);
    expect([...d.situation.value.values()].some((s) => s.conflict)).toBe(false);
    expect(d.counts.value.conflicts).toBe(0);
  }

  // Gate return of 8.2 (finding 7): between `store.apply` and the publication of
  // `proposal.json` with `applied`, the review re-evaluated the accepted changes against a project that
  // already had them ("Apply blocked" and "The project changed since your last session").
  it('during the apply, with proposal.json still writing, the review shows no warning; afterwards, neither', async () => {
    const h = await readyToApply();
    expectNoWarnings(h);
    const hold = holdProposalWrite(h);
    const applying = h.review.apply();
    await hold.reached;
    // The project already has the changes and mapping.json already wrote; the proposal does not say so yet.
    expect(h.session.store.committed.value?.containers.map((i) => i.id)).toContain('I3');
    expect((await diskProject(h)).containers.map((i) => i.id)).toContain('I3');
    expect(h.review.derived.proposal.value?.applied).toEqual({});
    expectNoWarnings(h);

    hold.release();
    expect(await applying).toMatchObject({ ok: true, applied: 5, files: 1 });
    expectNoWarnings(h);
    expect(Object.keys(h.review.derived.proposal.value?.applied ?? {})).toHaveLength(5);
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('during the apply, proposal.json failing: after the compensation, the review goes back to the previous state', async () => {
    const h = await readyToApply();
    const hold = holdProposalWrite(h);
    const applying = h.review.apply();
    await hold.reached;
    expectNoWarnings(h);
    hold.release(new Error('disk full'));
    expect(await applying).toEqual({ ok: false, error: 'write-failed' });
    await expectNothingApplied(h);
    expectNoWarnings(h);
    expect(h.review.derived.canApply.value).toBe(true);
  });
});

describe('apply: storage failures in before (items 39 and 40)', () => {
  /** A proposal with two new images, all accepted. */
  async function twoImages(): Promise<Harness> {
    const base = sampleProject();
    let after = addContainer(base, {
      id: 'I3',
      file: 'images/a.webp',
      width: 8,
      height: 6,
    });
    after = addContainer(after, { id: 'I4', file: 'images/b.webp', width: 8, height: 6 });
    const proposal = propose(base, after, { id: 'P1' });
    const h = await openHarness({
      proposals: [proposal],
      files: { 'proposals/P1/images/a.webp': 'A', 'proposals/P1/images/b.webp': 'B' },
    });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(h.review.derived.canApply.value).toBe(true);
    return h;
  }

  it('failure writing the second image: write-failed, the first copy leaves and the proposal stays open (39)', async () => {
    const h = await twoImages();
    const original = h.storage.writeImage.bind(h.storage);
    let calls = 0;
    vi.spyOn(h.storage, 'writeImage').mockImplementation((path, data) => {
      calls++;
      return calls === 2 ? Promise.reject(new Error('disk full')) : original(path, data);
    });

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'write-failed' });
    expect(await h.root.read('images/a.webp')).toBeNull();
    expect(await h.root.read('images/b.webp')).toBeNull();
    expect(await h.root.read('proposals/P1/images/a.webp')).toBe('A');
    expect(h.session.store.project.value?.containers.map((i) => i.id)).not.toContain(
      'I3',
    );
    expect((await diskProposal(h.root)).status).toBe('open');
  });

  it('save-failed with the project already changed (undo skipped): the copies stay, because the project cites them (40)', async () => {
    const h = await twoImages();
    vi.spyOn(h.storage, 'saveMapping').mockImplementation(async () => {
      // The project is swapped while writing (outside reload): it stops being the applied one.
      const current = h.session.store.project.peek();
      if (current)
        h.session.store.load({
          ...current,
          project: { ...current.project, name: 'Other' },
        });
      throw new Error('quota');
    });

    const result = await h.review.apply();
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    expect(h.session.store.project.value?.containers.map((i) => i.id)).toContain('I3');
    expect(await h.root.read('images/a.webp')).toBe('A');
    expect(await h.root.read('images/b.webp')).toBe('B');
  });
});
