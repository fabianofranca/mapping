import { describe, expect, it } from 'vitest';
import {
  addContainer,
  applyAccepted,
  computeChanges,
  createMarking,
  parseProposalText,
  patchProject,
  removeMarking,
  renameMarking,
  reorderMarking,
  serializeProposal,
  wrapItems,
  PROPOSAL_FORMAT_VERSION,
  type Change,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Proposal formatVersion 4: the created marking carries `insertBefore` (the anchor in the array of the
// base), and applying all the changes gives the same parents and the same order among siblings as the
// proposed project (docs/PROPOSAL-FORMAT.md, "Guarantee"); without reordering in the batch, also the same order
// of the `markings` array. With reordering and a tie, see proposalReorderLimit.test.ts and the fuzz
// proposalFidelityFuzz.test.ts (#549).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Container C 300×200 with A (fills it), B (inside A), D and E (siblings of A, they do not fit outside it). */
function tieBase(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 300,
    height: 200,
  });
  p = createMarking(p, { id: 'A', containerId: 'C', rect: rect(0, 0, 300, 200) });
  p = createMarking(p, { id: 'B', containerId: 'C', rect: rect(50, 50, 40, 30) });
  p = createMarking(p, { id: 'D', containerId: 'C', rect: rect(100, 100, 40, 30) });
  return p;
}

/** Four markings side by side, with no containment among them: P, Q, R, S. */
function rowBase(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 1000,
    height: 200,
  });
  for (const [id, x] of [
    ['P', 0],
    ['Q', 200],
    ['R', 400],
    ['S', 600],
  ] as const) {
    p = createMarking(p, { id, containerId: 'C', rect: rect(x, 0, 100, 100) });
  }
  return p;
}

const ids = (p: Project) => p.markings.map((m) => m.id);
const parents = (p: Project) =>
  Object.fromEntries([
    ...p.markings.map((m) => [m.id, m.parentId]),
    ...p.containers.map((c) => [c.id, c.parentId]),
  ]);

/** Applies all the changes from the base to the proposed project and checks the order and the parents. */
function expectApplied(base: Project, after: Project): Project {
  const applied = patchProject(base, computeChanges(base, after));
  expect(applied.problems).toEqual([]);
  expect(ids(applied.project)).toEqual(ids(after));
  expect(parents(applied.project)).toEqual(parents(after));
  return applied.project;
}

const wrap = (base: Project, id: string, items: string[]) =>
  wrapItems(
    base,
    { id, items: items.map((i) => ({ kind: 'marking' as const, id: i })) },
    { settle: true },
  );

describe('proposal v4: applied = proposed (order and parents)', () => {
  it('the rectangle tie: W without a parent, A child of W, B child of A', () => {
    const base = tieBase();
    const after = wrap(base, 'W', ['A']);
    expect(parents(after)).toMatchObject({ W: null, A: 'W', B: 'A' });
    const applied = expectApplied(base, after);
    expect(parents(applied)).toMatchObject({ W: null, A: 'W', B: 'A' });
  });

  it('wrapping without a tie (the rectangle grows)', () => {
    const base = tieBase();
    expectApplied(base, wrap(base, 'W', ['B', 'D']));
  });

  it('wrapping a marking with siblings before and after it', () => {
    const base = rowBase();
    const after = wrap(base, 'W', ['Q']);
    expect(ids(after)).toEqual(['P', 'W', 'Q', 'R', 'S']);
    expectApplied(base, after);
  });

  it('wrapping two markings from different places of the array', () => {
    const base = rowBase();
    const after = wrap(base, 'W', ['Q', 'S']);
    expectApplied(base, after);
  });

  it('a plain create_marking goes to the end', () => {
    const base = rowBase();
    const after = createMarking(base, {
      id: 'N',
      containerId: 'C',
      rect: rect(800, 0, 50, 50),
    });
    const changes = computeChanges(base, after);
    const create = changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create?.insertBefore ?? null).toBeNull();
    expect(ids(expectApplied(base, after)).at(-1)).toBe('N');
  });

  it('two created with the same anchor stay in the proposed order', () => {
    const base = rowBase();
    let after = wrap(base, 'W1', ['R']);
    after = wrap(after, 'W2', ['R']);
    const changes = computeChanges(base, after);
    const anchors = changes
      .filter((c) => c.entity === 'marking' && c.kind === 'create')
      .map((c) => c.insertBefore);
    expect(anchors).toEqual(['R', 'R']);
    expectApplied(base, after);
  });

  it('wrapping together with the removal of the marking that would be the anchor', () => {
    const base = rowBase();
    const after = removeMarking(wrap(base, 'W', ['Q']), 'Q');
    const changes = computeChanges(base, after);
    const create = changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create?.insertBefore).toBe('R');
    expectApplied(base, after);
  });

  it('wrapping together with an order change (reorderMarking), without a tie: same parents and same order among siblings', () => {
    // The `position` only orders siblings (the siblings swap places in the array and the others stay): where
    // a child lands in the array among them is not expressible, so the exact order of the array is only
    // guaranteed without an order change. With it, the parents and the relative order of siblings hold.
    const base = rowBase();
    const roots = (p: Project) =>
      p.markings.filter((m) => m.parentId === null).map((m) => m.id);
    const afters = [
      reorderMarking(wrap(base, 'W', ['Q']), 'S', 0),
      reorderMarking(wrap(base, 'W', ['R']), 'S', 0),
      reorderMarking(wrap(base, 'W', ['R']), 'P', 3),
    ];
    for (const after of afters) {
      const applied = patchProject(base, computeChanges(base, after));
      expect(applied.problems).toEqual([]);
      expect(parents(applied.project)).toEqual(parents(after));
      expect(roots(applied.project)).toEqual(roots(after));
    }
  });

  it('the tie together with an order change of the siblings', () => {
    const base = tieBase();
    const after = reorderMarking(wrap(base, 'W', ['A']), 'D', 0);
    expectApplied(base, after);
  });
});

describe('proposal v4: partial acceptance', () => {
  it('rejecting the creation of the wrapper and accepting the rest applies without error', () => {
    const base = rowBase();
    const after = removeMarking(wrap(base, 'W', ['Q']), 'S');
    const p = propose(base, after);
    const create = p.changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create).toBeDefined();
    const rejectCreate = p.changes.map((c) => c).filter((c) => c.id !== create?.id);
    const accepted = {
      ...p,
      decisions: Object.fromEntries(
        p.changes.map((c) => [
          c.id,
          { state: c.id === create?.id ? 'rejected' : 'accepted', at: AT },
        ]),
      ),
    } as typeof p;
    expect(rejectCreate.length).toBeGreaterThan(0);
    const result = applyAccepted(base, accepted, AT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.markings.some((m) => m.id === 'W')).toBe(false);
  });

  it('with the anchor removed by an accepted change, the created one goes to the end', () => {
    const base = rowBase();
    const wrapped = wrap(base, 'W', ['Q']);
    const changes = computeChanges(base, wrapped);
    const create = changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    ) as Change;
    expect(create.insertBefore).toBe('Q');
    const removeQ: Change = {
      id: 'x1',
      kind: 'remove',
      entity: 'marking',
      entityId: 'Q',
      imageId: 'C',
      markingId: 'Q',
      field: null,
      from: JSON.parse(JSON.stringify(base.markings.find((m) => m.id === 'Q'))),
      to: null,
    };
    const result = patchProject(base, [create, removeQ]);
    expect(result.problems).toEqual([]);
    expect(ids(result.project).at(-1)).toBe('W');
    expect(ids(result.project)).not.toContain('Q');
  });

  it('an anchor that does not exist in the base: the created one goes to the end, without a problem', () => {
    const base = rowBase();
    const changes = computeChanges(base, wrap(base, 'W', ['Q']));
    const create = changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    ) as Change;
    const result = patchProject(base, [{ ...create, insertBefore: 'ZZ' }]);
    expect(result.problems).toEqual([]);
    expect(ids(result.project).at(-1)).toBe('W');
  });
});

describe('proposal v4: no redundant position', () => {
  it('wrapping in a tie brings no position for the created nor the wrapped one', () => {
    const base = tieBase();
    const changes = computeChanges(base, wrap(base, 'W', ['A']));
    expect(changes.filter((c) => c.field === 'position')).toEqual([]);
  });

  it('wrapping without a tie does not either', () => {
    const base = rowBase();
    const changes = computeChanges(base, wrap(base, 'W', ['Q']));
    expect(changes.filter((c) => c.field === 'position')).toEqual([]);
  });
});

describe('proposal v4: reading and writing', () => {
  const build = () => {
    const base = rowBase();
    const p = propose(base, wrap(base, 'W', ['Q']));
    return { base, p, data: JSON.parse(serializeProposal(p)) as Record<string, unknown> };
  };
  const changesOf = (data: Record<string, unknown>) =>
    data.changes as Record<string, unknown>[];

  it('the new proposal comes out on formatVersion 4, with insertBefore on creation', () => {
    const { p, data } = build();
    expect(PROPOSAL_FORMAT_VERSION).toBe(4);
    expect(p.formatVersion).toBe(4);
    const create = changesOf(data).find(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    expect(create?.insertBefore).toBe('Q');
    const parsed = parseProposalText(JSON.stringify(data));
    expect(parsed.ok).toBe(true);
  });

  it('insertBefore in another change is a read error, with the path', () => {
    const base = rowBase();
    const p = propose(base, renameMarking(wrap(base, 'W', ['Q']), 'P', 'First'));
    const data = JSON.parse(serializeProposal(p)) as Record<string, unknown>;
    const list = changesOf(data);
    const index = list.findIndex((c) => c.kind === 'update');
    expect(index).toBeGreaterThanOrEqual(0);
    list[index] = { ...list[index], insertBefore: 'Q' };
    const result = parseProposalText(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.startsWith(`changes[${index}].insertBefore:`)),
      ).toBe(true);
    }
  });

  it('insertBefore that is neither an id nor null is a read error', () => {
    const { data } = build();
    const index = changesOf(data).findIndex(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    for (const value of [5, '', {}]) {
      const bad = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      changesOf(bad)[index] = { ...changesOf(bad)[index], insertBefore: value };
      const result = parseProposalText(JSON.stringify(bad));
      expect(result.ok, JSON.stringify(value)).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.startsWith(`changes[${index}].insertBefore`)),
        ).toBe(true);
      }
    }
  });

  it('insertBefore null is read; an anchor that does not exist in the base is not a read error', () => {
    const { data } = build();
    const index = changesOf(data).findIndex(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    for (const value of [null, 'does-not-exist']) {
      const ok = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      changesOf(ok)[index] = { ...changesOf(ok)[index], insertBefore: value };
      expect(parseProposalText(JSON.stringify(ok)).ok).toBe(true);
    }
  });

  it('versions 1 to 3 are still read, without the field (ignored if it appears)', () => {
    const { data } = build();
    for (const version of [1, 2, 3]) {
      const old = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      old.formatVersion = version;
      const result = parseProposalText(JSON.stringify(old));
      expect(result.ok, `v${version}`).toBe(true);
      if (result.ok) {
        expect(result.proposal.formatVersion).toBe(version);
        expect(result.proposal.changes.every((c) => c.insertBefore === undefined)).toBe(
          true,
        );
      }
    }
  });

  it('the app rewrites the decisions keeping the file's version (a v3)', () => {
    const { base, data } = build();
    const v3 = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    v3.formatVersion = 3;
    const read = parseProposalText(JSON.stringify(v3));
    if (!read.ok) throw new Error(read.errors.join('; '));
    const decidedP = decided(
      read.proposal,
      base,
      { level: 'proposal', id: null },
      'accepted',
    );
    const again = JSON.parse(serializeProposal(decidedP)) as Record<string, unknown>;
    expect(again.formatVersion).toBe(3);
    expect(changesOf(again).every((c) => !('insertBefore' in c))).toBe(true);
  });

  it('the rewritten v4 keeps insertBefore', () => {
    const { base, p } = build();
    const decidedP = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    const again = JSON.parse(serializeProposal(decidedP)) as Record<string, unknown>;
    expect(again.formatVersion).toBe(4);
    const create = changesOf(again).find(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    expect(create?.insertBefore).toBe('Q');
  });
});
