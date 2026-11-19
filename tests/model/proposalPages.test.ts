import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_ANCHOR_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  PROPOSAL_PAGES_FORMAT_VERSION,
  addContainer,
  applyAccepted,
  createArrow,
  createMarking,
  createPage,
  deletePage,
  movePage,
  moveRootsToPage,
  parseProposal,
  prepareRevision,
  renamePage,
  reviseProposal,
  serializeProposal,
  setContainerDirection,
  setMarkingAnchor,
  settleHierarchy,
  usesPages,
  validateAccepted,
  validateProject,
  proposalFormatVersionFor,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Pages in a proposal (v21, PG4): the `page` entity (create, remove, `name`, `position`), the
// composite `page` change on a root and its members (`{ pageId, position }`), `pageId` in the
// created or removed container and canvas marking, all in `formatVersion` 10, written only when the
// proposal uses pages (an earlier reader refuses 10 instead of dropping the `pageId`).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** PG1 with I1 › M1…M3 and I2 › M4 (sample); PG2 with I3 and the canvas marking K. */
function twoPages(): Project {
  let p = createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });
  p = addContainer(p, {
    id: 'I3',
    file: 'images/tras.jpg',
    width: 1000,
    height: 1000,
    pageId: 'PG2',
  });
  return createMarking(p, {
    id: 'K',
    containerId: null,
    rect: rect(5000, 5000, 400, 400),
    pageId: 'PG2',
  });
}

/** Accepts everything and applies; fails if blocked. */
function acceptAll(project: Project, proposal: Proposal): Project {
  const decision = decided(
    proposal,
    project,
    { level: 'proposal', id: null },
    'accepted',
  );
  const applied = applyAccepted(project, decision, AT);
  if (!applied.ok) {
    throw new Error(`blocked: ${applied.issues.map((i) => i.code).join(',')}`);
  }
  return applied.project;
}

describe('format version of a proposal with pages', () => {
  it('without pages the proposal keeps today versions (4, then 8 and 9 as they apply)', () => {
    const base = twoPages();
    const plain = propose(
      base,
      createMarking(base, { id: 'N', containerId: 'I1', rect: rect(10, 10, 20, 20) }),
    );
    expect(plain.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesPages(plain.changes)).toBe(false);
    const direction = propose(base, setContainerDirection(base, 'I1', 'rtl'));
    expect(direction.formatVersion).toBe(8);
    const anchored = propose(base, setMarkingAnchor(base, 'M2', { to: 'M1' }));
    expect(anchored.formatVersion).toBe(PROPOSAL_ANCHOR_FORMAT_VERSION);
    // A container and a canvas marking created on the first page do not carry a page.
    const first = propose(
      base,
      addContainer(base, { id: 'I9', file: 'images/x.jpg', width: 100, height: 100 }),
    );
    expect(first.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesPages(first.changes)).toBe(false);
  });

  it('10 is a readable version and anything that uses pages writes it', () => {
    expect(PROPOSAL_PAGES_FORMAT_VERSION).toBe(10);
    expect(PROPOSAL_FORMAT_VERSIONS).toContain(10);
    const base = twoPages();
    const proposal = propose(base, createPage(base, { id: 'PG3', name: 'Page 3' }));
    expect(usesPages(proposal.changes)).toBe(true);
    expect(proposal.formatVersion).toBe(10);
    expect(parseProposal(JSON.parse(serializeProposal(proposal))).ok).toBe(true);
  });

  it('the revision writes 10 when it brings pages, keeps a 10 and never goes down', () => {
    const base = twoPages();
    expect(proposalFormatVersionFor([], 5, 10)).toBe(10);
    const plain = propose(
      base,
      createMarking(base, { id: 'N', containerId: 'I1', rect: rect(10, 10, 20, 20) }),
    );
    const withPage = createPage(
      createMarking(base, { id: 'N', containerId: 'I1', rect: rect(10, 10, 20, 20) }),
      { id: 'PG3', name: 'Page 3' },
    );
    const prep = prepareRevision(base, plain, []);
    if (!prep.ok) throw new Error('prepare');
    const up = reviseProposal(base, plain, {
      at: AT,
      after: createPage(prep.proposed, { id: 'PG3', name: 'Page 3' }),
    });
    if (!up.ok) throw new Error(up.error.code);
    expect(up.proposal.formatVersion).toBe(10);
    expect(withPage.pages).toHaveLength(3);
    // Revising the 10 again, now without a page change in the new batch, stays 10.
    const prep10 = prepareRevision(base, up.proposal, []);
    if (!prep10.ok) throw new Error('prepare 10');
    const again = reviseProposal(base, up.proposal, {
      at: AT,
      after: renamePage(prep10.proposed, 'PG3', 'Third'),
    });
    if (!again.ok) throw new Error(again.error.code);
    expect(again.proposal.formatVersion).toBe(10);
  });
});

describe('changes of the page list', () => {
  it('create, rename, reorder and remove a page are page entity changes at the project level', () => {
    const base = createPage(twoPages(), { id: 'PG3', name: 'Page 3' });
    const created = propose(base, createPage(base, { id: 'PG4', name: 'Page 4' }));
    expect(created.changes).toMatchObject([
      {
        entity: 'page',
        kind: 'create',
        entityId: 'PG4',
        imageId: null,
        markingId: null,
        field: null,
        from: null,
        to: { id: 'PG4', name: 'Page 4' },
      },
    ]);
    const renamed = propose(base, renamePage(base, 'PG2', 'Cart'));
    expect(renamed.changes).toMatchObject([
      {
        entity: 'page',
        kind: 'update',
        entityId: 'PG2',
        field: 'name',
        from: 'Page 2',
        to: 'Cart',
      },
    ]);
    const moved = propose(base, movePage(base, 'PG3', 0));
    expect(moved.changes.map((c) => `${c.entityId}.${c.field}`)).toContain(
      'PG3.position',
    );
    const removed = propose(base, deletePage(base, 'PG3', { discard: true }));
    expect(removed.changes).toMatchObject([
      {
        entity: 'page',
        kind: 'remove',
        entityId: 'PG3',
        from: { id: 'PG3', name: 'Page 3' },
        to: null,
      },
    ]);
  });

  it('accepting applies them through the page list; a rejected one does not apply', () => {
    const base = createPage(twoPages(), { id: 'PG3', name: 'Page 3' });
    let after = createPage(base, { id: 'PG4', name: 'Page 4' });
    after = renamePage(after, 'PG2', 'Cart');
    after = movePage(after, 'PG3', 0);
    const proposal = propose(base, after);
    const applied = acceptAll(base, proposal);
    expect(applied.pages).toEqual(after.pages);

    const rename = changeOf(proposal, 'page', 'PG2', 'name');
    const partial = decided(
      decided(proposal, base, { level: 'proposal', id: null }, 'accepted'),
      base,
      { level: 'change', id: rename.id },
      'rejected',
    );
    const result = applyAccepted(base, partial, AT);
    if (!result.ok) throw new Error('blocked');
    expect(result.project.pages.map((g) => g.name)).toEqual([
      'Page 3',
      'Page 1',
      'Page 2',
      'Page 4',
    ]);
    expect(validateProject(result.project)).toEqual([]);
  });

  it('removing a page requires moving its content off it (the removal is accepted along)', () => {
    const base = twoPages();
    const proposal = propose(base, deletePage(base, 'PG2', { moveTo: 'PG1' }));
    const removal = changeOf(proposal, 'page', 'PG2');
    const moves = proposal.changes.filter((c) => c.field === 'page');
    expect(moves.map((c) => c.entityId).sort()).toEqual(['I3', 'K']);
    const only = decided(proposal, base, { level: 'change', id: removal.id }, 'accepted');
    for (const m of moves) expect(only.decisions[m.id]?.state).toBe('accepted');
    expect(validateAccepted(base, only).ok).toBe(true);
  });
});

describe('the composite page change', () => {
  it('a container that changes page is one page change { pageId, position } replacing placement', () => {
    const base = twoPages();
    const after = moveRootsToPage(base, ['I1'], 'PG2');
    const proposal = propose(base, after);
    expect(proposal.formatVersion).toBe(10);
    const change = changeOf(proposal, 'image', 'I1', 'page');
    const placement = after.containers.find((c) => c.id === 'I1')!.placement;
    expect(change).toMatchObject({
      imageId: 'I1',
      markingId: null,
      from: { pageId: 'PG1' },
      to: { pageId: 'PG2', position: placement },
    });
    expect(proposal.changes.some((c) => c.field === 'placement')).toBe(false);
    const applied = acceptAll(base, proposal);
    const moved = applied.containers.find((c) => c.id === 'I1')!;
    expect(moved.pageId).toBe('PG2');
    expect(moved.placement).toEqual(placement);
    expect(validateProject(applied)).toEqual([]);
  });

  it('a canvas marking that changes page carries { pageId, rect }', () => {
    const base = twoPages();
    const after = moveRootsToPage(base, ['K'], 'PG1');
    const proposal = propose(base, after);
    const change = changeOf(proposal, 'marking', 'K', 'page');
    const target = after.markings.find((m) => m.id === 'K')!;
    expect(change).toMatchObject({
      imageId: null,
      markingId: 'K',
      from: { pageId: 'PG2' },
      to: { pageId: 'PG1', position: target.rect },
    });
    expect(proposal.changes.some((c) => c.field === 'rect')).toBe(false);
    const applied = acceptAll(base, proposal);
    expect(applied.markings.find((m) => m.id === 'K')).toMatchObject({
      pageId: 'PG1',
      rect: target.rect,
    });
  });

  it('a rejected page change does not apply', () => {
    const base = twoPages();
    const proposal = propose(base, moveRootsToPage(base, ['I1'], 'PG2'));
    const change = changeOf(proposal, 'image', 'I1', 'page');
    const rejected = decided(
      proposal,
      base,
      { level: 'change', id: change.id },
      'rejected',
    );
    const result = applyAccepted(base, rejected, AT);
    if (!result.ok) throw new Error('blocked');
    expect(result.project.containers.find((c) => c.id === 'I1')?.pageId).toBe('PG1');
  });

  it('a page created in the proposal is required by the move onto it', () => {
    const base = twoPages();
    const withPage = createPage(base, { id: 'PG3', name: 'Page 3' });
    const proposal = propose(base, moveRootsToPage(withPage, ['I1'], 'PG3'));
    const move = changeOf(proposal, 'image', 'I1', 'page');
    const creation = changeOf(proposal, 'page', 'PG3');
    const only = decided(proposal, base, { level: 'change', id: move.id }, 'accepted');
    expect(only.decisions[creation.id]?.state).toBe('accepted');
  });
});

describe('pageId in created and removed values', () => {
  it('a container created on another page carries its pageId and 10; on the first page it does not', () => {
    const base = twoPages();
    const onPg2 = addContainer(base, {
      id: 'I9',
      file: 'images/n.jpg',
      width: 500,
      height: 500,
      pageId: 'PG2',
    });
    const proposal = propose(base, onPg2);
    expect(proposal.formatVersion).toBe(10);
    expect(changeOf(proposal, 'image', 'I9').to).toMatchObject({ pageId: 'PG2' });
    expect(acceptAll(base, proposal).containers.find((c) => c.id === 'I9')?.pageId).toBe(
      'PG2',
    );
  });

  it('a canvas marking created on another page carries its pageId; one inside a container does not', () => {
    const base = twoPages();
    const after = createMarking(
      createMarking(base, {
        id: 'N1',
        containerId: null,
        rect: rect(9000, 9000, 100, 100),
        pageId: 'PG2',
      }),
      { id: 'N2', containerId: 'I1', rect: rect(10, 10, 20, 20) },
    );
    const proposal = propose(base, after);
    expect(changeOf(proposal, 'marking', 'N1').to).toMatchObject({ pageId: 'PG2' });
    expect(changeOf(proposal, 'marking', 'N2').to).not.toHaveProperty('pageId');
    const applied = acceptAll(base, proposal);
    expect(applied.markings.find((m) => m.id === 'N1')?.pageId).toBe('PG2');
    expect(applied.markings.find((m) => m.id === 'N2')?.pageId).toBeNull();
  });

  it('an older proposal (no pageId in the created root) puts it on the first page', () => {
    const base = twoPages();
    const proposal = propose(
      base,
      addContainer(base, { id: 'I9', file: 'images/n.jpg', width: 500, height: 500 }),
    );
    expect(changeOf(proposal, 'image', 'I9').to).not.toHaveProperty('pageId');
    expect(acceptAll(base, proposal).containers.find((c) => c.id === 'I9')?.pageId).toBe(
      'PG1',
    );
  });

  it('a removed container on another page carries its pageId', () => {
    const base = twoPages();
    const after = deletePage(base, 'PG2', { discard: true });
    const proposal = propose(base, after);
    expect(changeOf(proposal, 'image', 'I3').from).toMatchObject({ pageId: 'PG2' });
    const applied = acceptAll(base, proposal);
    expect(applied.pages.map((g) => g.id)).toEqual(['PG1']);
    expect(validateProject(applied)).toEqual([]);
  });
});

describe('invalid set: part of a group that changes page', () => {
  /** Canvas markings A and B on PG1, joined by an arrow, and a second page. */
  function arrowBase(): Project {
    let p = createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });
    p = createMarking(p, { id: 'A', containerId: null, rect: rect(6000, 100, 300, 300) });
    p = createMarking(p, { id: 'B', containerId: null, rect: rect(6500, 100, 300, 300) });
    return createArrow(p, { id: 'AR', from: 'A', to: 'B' });
  }

  it('accepting only A move leaves the arrow between pages: blocked, with the two exits', () => {
    const base = arrowBase();
    const proposal = propose(base, moveRootsToPage(base, ['A', 'B'], 'PG2'));
    const a = changeOf(proposal, 'marking', 'A', 'page');
    const b = changeOf(proposal, 'marking', 'B', 'page');
    const onlyA = decided(proposal, base, { level: 'change', id: a.id }, 'accepted');
    const check = validateAccepted(base, onlyA);
    expect(check.ok).toBe(false);
    const issue = check.issues.find((i) => i.code === 'arrow-cross-page');
    expect(issue).toBeDefined();
    // Exit 1: reject this one (it is among the accepted changes involved).
    expect(issue?.changeIds).toEqual([a.id]);
    // Exit 2: accept the rest of the group (the undecided change of the other end).
    expect(issue?.related).toEqual([b.id]);
    expect(applyAccepted(base, onlyA, AT).ok).toBe(false);

    const rejectThis = decided(onlyA, base, { level: 'change', id: a.id }, 'rejected');
    expect(applyAccepted(base, rejectThis, AT).ok).toBe(true);
    const acceptRest = decided(onlyA, base, { level: 'change', id: b.id }, 'accepted');
    const done = applyAccepted(base, acceptRest, AT);
    expect(done.ok).toBe(true);
    if (done.ok) expect(validateProject(done.project)).toEqual([]);
  });

  describe('an anchor across the pages', () => {
    /** Canvas markings A and B on PG1, B anchored to A, and a second page. */
    function anchorBase(): Project {
      let p = createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });
      p = createMarking(p, {
        id: 'A',
        containerId: null,
        rect: rect(6000, 100, 300, 300),
      });
      p = createMarking(p, {
        id: 'B',
        containerId: null,
        rect: rect(6500, 100, 300, 300),
      });
      return setMarkingAnchor(p, 'B', { to: 'A', side: 'end' });
    }

    it('accepting only A move would release the anchor: blocked, with the two exits', () => {
      const base = anchorBase();
      const proposal = propose(base, moveRootsToPage(base, ['A', 'B'], 'PG2'));
      const a = changeOf(proposal, 'marking', 'A', 'page');
      const b = changeOf(proposal, 'marking', 'B', 'page');
      const onlyA = decided(proposal, base, { level: 'change', id: a.id }, 'accepted');
      const check = validateAccepted(base, onlyA);
      expect(check.ok).toBe(false);
      const issue = check.issues.find((i) => i.code === 'page-anchor-crossing');
      expect(issue).toBeDefined();
      expect(issue?.id).toBe('B');
      expect(issue?.otherId).toBe('A');
      expect([...(issue?.changeIds ?? []), ...(issue?.related ?? [])].sort()).toEqual(
        [a.id, b.id].sort(),
      );
      expect(issue?.changeIds).toEqual([a.id]);
      expect(issue?.related).toEqual([b.id]);
      expect(applyAccepted(base, onlyA, AT).ok).toBe(false);
    });

    it('accepting both is ok and keeps the anchor', () => {
      const base = anchorBase();
      const proposal = propose(base, moveRootsToPage(base, ['A', 'B'], 'PG2'));
      const after = acceptAll(base, proposal);
      expect(after.markings.find((m) => m.id === 'B')?.anchor?.to).toBe('A');
      expect(validateProject(after)).toEqual([]);
    });
  });

  it('the markings of a container go along: moving only one container is also blocked', () => {
    const base = createArrow(createPage(sampleProject(), { id: 'PG2', name: 'Page 2' }), {
      id: 'AR',
      from: 'M1',
      to: 'M4',
    });
    const proposal = propose(base, moveRootsToPage(base, ['I1', 'I2'], 'PG2'));
    const i1 = changeOf(proposal, 'image', 'I1', 'page');
    const i2 = changeOf(proposal, 'image', 'I2', 'page');
    const onlyI1 = decided(proposal, base, { level: 'change', id: i1.id }, 'accepted');
    const issue = validateAccepted(base, onlyI1).issues.find(
      (i) => i.code === 'arrow-cross-page',
    );
    expect(issue?.changeIds).toEqual([i1.id]);
    expect(issue?.related).toEqual([i2.id]);
  });

  it('a parent left on another page is not an invalid set: the parent is derived, so the child becomes a root', () => {
    let base = createPage(sampleProject(), { id: 'PG2', name: 'Page 2' });
    base = createMarking(base, {
      id: 'P',
      containerId: null,
      rect: rect(7000, 0, 1000, 1000),
    });
    base = createMarking(base, {
      id: 'Q',
      containerId: null,
      rect: rect(7100, 100, 200, 200),
    });
    base = settleHierarchy(base);
    expect(base.markings.find((m) => m.id === 'Q')?.parentId).toBe('P');
    const proposal = propose(base, moveRootsToPage(base, ['P'], 'PG2'));
    const q = changeOf(proposal, 'marking', 'Q', 'page');
    const onlyQ = decided(proposal, base, { level: 'change', id: q.id }, 'accepted');
    const applied = applyAccepted(base, onlyQ, AT);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.project.markings.find((m) => m.id === 'Q')?.parentId).toBeNull();
      expect(validateProject(applied.project)).toEqual([]);
    }
  });

  it('the revision does not produce an invalid set: dropping one move of the group is refused', () => {
    const base = arrowBase();
    const proposal = propose(base, moveRootsToPage(base, ['A', 'B'], 'PG2'));
    const a = changeOf(proposal, 'marking', 'A', 'page');
    const prep = prepareRevision(base, proposal, [a.id]);
    expect(prep.ok).toBe(false);
    if (!prep.ok) {
      expect(prep.error.code).toBe('proposal-not-applicable');
      expect(prep.error.problems?.some((i) => i.code === 'arrow-cross-page')).toBe(true);
    }
  });
});

describe('the reader and the version', () => {
  const written = (): Record<string, unknown> => {
    const base = twoPages();
    return JSON.parse(
      serializeProposal(
        propose(
          createPage(base, { id: 'PG3', name: 'Page 3' }),
          moveRootsToPage(createPage(base, { id: 'PG3', name: 'Page 3' }), ['I1'], 'PG3'),
        ),
      ),
    ) as Record<string, unknown>;
  };

  it('refuses 11 with the usual version message', () => {
    const json = written();
    json.formatVersion = 11;
    const r = parseProposal(json);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain(
        'formatVersion: must be 1, 2, 3, 4, 5, 6, 7, 8, 9 or 10',
      );
    }
  });

  it('refuses the page entity, the composite page change and a pageId in a created value below 10', () => {
    const base = twoPages();
    const withPage = createPage(base, { id: 'PG3', name: 'Page 3' });
    const cases: [string, Project, Project][] = [
      ['page entity', base, withPage],
      ['composite page change', base, moveRootsToPage(base, ['I1'], 'PG2')],
      [
        'pageId in a created value',
        base,
        addContainer(base, {
          id: 'I9',
          file: 'images/n.jpg',
          width: 5,
          height: 5,
          pageId: 'PG2',
        }),
      ],
    ];
    for (const [label, from, to] of cases) {
      const json = JSON.parse(serializeProposal(propose(from, to))) as Record<
        string,
        unknown
      >;
      expect(parseProposal(json).ok, `${label} accepted at 10`).toBe(true);
      json.formatVersion = 9;
      const r = parseProposal(json);
      expect(r.ok, `${label} refused at 9`).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toContain('formatVersion 10');
    }
  });

  it('an old proposal without pages still reads at 4 and its created root has no pageId', () => {
    const base = twoPages();
    const proposal = propose(
      base,
      addContainer(base, { id: 'I9', file: 'images/n.jpg', width: 5, height: 5 }),
    );
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
    const change: Change | undefined = parsed.ok ? parsed.proposal.changes[0] : undefined;
    expect(change?.to).not.toHaveProperty('pageId');
  });
});

describe('a marking that leaves a container for the canvas of another page', () => {
  /** M1 (in I1, on PG1) goes to the canvas of PG2. */
  function leaving(): { base: Project; after: Project } {
    const base = twoPages();
    const after: Project = {
      ...base,
      markings: base.markings.map((m) =>
        m.id === 'M1'
          ? { ...m, containerId: null, pageId: 'PG2', rect: rect(7000, 7000, 120, 120) }
          : m,
      ),
    };
    return { base, after };
  }

  it('is one page change that also leaves the container (no separate space change)', () => {
    const { base, after } = leaving();
    const proposal = propose(base, after);
    expect(
      proposal.changes.filter((c) => c.entityId === 'M1' && c.field === 'space'),
    ).toEqual([]);
    expect(changeOf(proposal, 'marking', 'M1', 'page')).toMatchObject({
      from: { pageId: 'PG1' },
      to: { pageId: 'PG2', position: rect(7000, 7000, 120, 120) },
    });
  });

  it('accepting it puts the marking on the canvas of the destination page; rejecting keeps it', () => {
    const { base, after } = leaving();
    const proposal = propose(base, after);
    const change = changeOf(proposal, 'marking', 'M1', 'page');
    const accepted = decided(
      proposal,
      base,
      { level: 'change', id: change.id },
      'accepted',
    );
    const result = applyAccepted(base, accepted, AT);
    if (!result.ok) throw new Error('blocked');
    expect(result.project.markings.find((m) => m.id === 'M1')).toMatchObject({
      containerId: null,
      pageId: 'PG2',
      rect: rect(7000, 7000, 120, 120),
    });
    const rejected = decided(
      proposal,
      base,
      { level: 'change', id: change.id },
      'rejected',
    );
    const kept = applyAccepted(base, rejected, AT);
    if (!kept.ok) throw new Error('blocked');
    expect(kept.project.markings.find((m) => m.id === 'M1')).toMatchObject({
      containerId: 'I1',
      pageId: null,
    });
  });
});

describe('a created root with no pageId and a reorder of the first page in the same proposal', () => {
  it('lands on the base first page whether the reorder is accepted or rejected', () => {
    const base = twoPages();
    const reordered = movePage(base, 'PG1', 1);
    const after = createMarking(reordered, {
      id: 'N1',
      containerId: null,
      rect: rect(9000, 9000, 100, 100),
      pageId: 'PG1',
    });
    const proposal = propose(base, after);
    expect(changeOf(proposal, 'marking', 'N1').to).not.toHaveProperty('pageId');
    const order = proposal.changes.find(
      (c) => c.entity === 'page' && c.field === 'position',
    )!;
    const create = changeOf(proposal, 'marking', 'N1');
    for (const state of ['accepted', 'rejected'] as const) {
      let d = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
      d = decided(d, base, { level: 'change', id: order.id }, state);
      const result = applyAccepted(base, d, AT);
      if (!result.ok) throw new Error('blocked');
      expect(result.project.markings.find((m) => m.id === create.entityId)?.pageId).toBe(
        'PG1',
      );
    }
  });
});
