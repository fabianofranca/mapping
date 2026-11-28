import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_DECORATIVE_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  PROPOSAL_VARIANT_GROUP_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createPage,
  decide,
  linkVariant,
  moveRootsToPage,
  parseProposal,
  proposalFormatVersionFor,
  removeContainer,
  reviewTree,
  serializeProposal,
  usesVariantGroup,
  variantsOf,
  type Project,
  type Proposal,
} from '../../src/model';
import { emptyProject } from './fixtures';

// `variantGroup` in a proposal (schema v26, decision 9 of stage #2034): a container field compared like
// `direction`, carried by the whole container of a creation or removal, and `formatVersion` 14, written
// only when a change touches the field or a created or removed container carries it (an earlier app
// refuses 14 instead of dropping the group of a created container).

const AT = '2026-11-28T10:00:00.000Z';

const base: Project = ['A', 'B', 'C'].reduce(
  (p, id) =>
    addBackgroundContainer(p, { id, width: 400, height: 300, background: '#FFFFFF' }),
  emptyProject(),
);

const build = (from: Project, after: Project): Proposal =>
  buildProposal(from, after, { title: 'Variants', createdAt: AT });

function accept(from: Project, proposal: Proposal, only?: readonly string[]): Project {
  const tree = reviewTree(proposal, from);
  let decisions = proposal.decisions;
  const ids = only ?? proposal.changes.map((c) => c.id);
  for (const id of ids) {
    const decided = decide(
      { ...proposal, decisions },
      tree,
      { level: 'change', id },
      'accepted',
      AT,
    );
    if (!decided.ok) throw new Error(decided.reason);
    decisions = decided.decisions;
  }
  const applied = applyAccepted(from, { ...proposal, decisions }, AT);
  if (!applied.ok) throw new Error('blocked');
  return applied.project;
}

const variantChanges = (proposal: Proposal) =>
  proposal.changes.filter((c) => c.entity === 'image' && c.field === 'variantGroup');

describe('proposal with the variantGroup field', () => {
  it('without variants the proposal keeps its version and 14 is a readable version', () => {
    const proposal = build(base, base);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesVariantGroup(proposal.changes)).toBe(false);
    expect(PROPOSAL_VARIANT_GROUP_FORMAT_VERSION).toBe(14);
    expect(PROPOSAL_FORMAT_VERSIONS.at(-1)).toBe(14);
  });

  it('linking two existing containers is two field changes, written in 14', () => {
    const proposal = build(base, linkVariant(base, 'A', 'B'));
    expect(proposal.formatVersion).toBe(PROPOSAL_VARIANT_GROUP_FORMAT_VERSION);
    expect(usesVariantGroup(proposal.changes)).toBe(true);
    const changes = variantChanges(proposal);
    expect(changes.map((c) => c.entityId).sort()).toEqual(['A', 'B']);
    for (const c of changes) {
      expect(c).toMatchObject({ kind: 'update', from: null });
      expect(typeof c.to).toBe('string');
    }
    expect(changes[0]?.to).toBe(changes[1]?.to);
  });

  it('unlinking is a change to null', () => {
    const linked = linkVariant(base, 'A', 'B');
    const proposal = build(linked, base);
    expect(proposal.formatVersion).toBe(PROPOSAL_VARIANT_GROUP_FORMAT_VERSION);
    for (const c of variantChanges(proposal)) expect(c).toMatchObject({ to: null });
  });

  it('a created container with a group carries it in the whole value and writes 14', () => {
    const linked = linkVariant(base, 'A', 'B');
    const group = linked.containers.find((c) => c.id === 'A')!.variantGroup;
    const created = linkVariant(
      addBackgroundContainer(linked, {
        id: 'D',
        width: 100,
        height: 100,
        background: '#000000',
      }),
      'D',
      'A',
    );
    const proposal = build(linked, created);
    expect(proposal.formatVersion).toBe(PROPOSAL_VARIANT_GROUP_FORMAT_VERSION);
    const create = proposal.changes.find(
      (c) => c.entity === 'image' && c.kind === 'create',
    );
    expect(create?.to).toMatchObject({ id: 'D', variantGroup: group });
  });

  it('a created container without a group does not need 14', () => {
    const after = addBackgroundContainer(base, {
      id: 'D',
      width: 100,
      height: 100,
      background: '#000000',
    });
    const proposal = build(base, after);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    const create = proposal.changes.find(
      (c) => c.entity === 'image' && c.kind === 'create',
    );
    expect(create?.to).not.toHaveProperty('variantGroup');
  });

  it('the version of the change set is the newest feature and a revision never goes down', () => {
    const changes = build(base, linkVariant(base, 'A', 'B')).changes;
    expect(proposalFormatVersionFor(changes, 4)).toBe(14);
    expect(proposalFormatVersionFor([], 5, 14)).toBe(14);
    expect(PROPOSAL_DECORATIVE_FORMAT_VERSION).toBe(13);
  });

  it('round trip: writing and reading keeps the group and the version', () => {
    const proposal = build(base, linkVariant(base, 'A', 'B'));
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.formatVersion).toBe(14);
    expect(variantChanges(parsed.proposal)).toHaveLength(2);
  });

  it('14 refuses an earlier version: a variantGroup change below 14 is an error', () => {
    const json = JSON.parse(
      serializeProposal(build(base, linkVariant(base, 'A', 'B'))),
    ) as Record<string, unknown>;
    expect(parseProposal(json).ok).toBe(true);
    const r = parseProposal({ ...json, formatVersion: 13 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('formatVersion 14');
  });

  it('an empty string or one above 64 characters is refused', () => {
    const json = JSON.parse(
      serializeProposal(build(base, linkVariant(base, 'A', 'B'))),
    ) as { changes: { field?: string; to: unknown }[] };
    for (const bad of ['', 'x'.repeat(65)]) {
      const changes = json.changes.map((c) =>
        c.field === 'variantGroup' ? { ...c, to: bad } : c,
      );
      expect(parseProposal({ ...json, changes }).ok).toBe(false);
    }
  });

  it('accepting both changes links the containers', () => {
    const proposal = build(base, linkVariant(base, 'A', 'B'));
    const applied = accept(base, proposal);
    expect(variantsOf(applied, 'A').map((c) => c.id)).toEqual(['B']);
    expect(variantsOf(applied, 'B').map((c) => c.id)).toEqual(['A']);
  });

  it('accepting only one of the two leaves a group of one, read as no link', () => {
    const proposal = build(base, linkVariant(base, 'A', 'B'));
    const first = variantChanges(proposal).find((c) => c.entityId === 'A')!;
    const applied = accept(base, proposal, [first.id]);
    expect(applied.containers.find((c) => c.id === 'A')?.variantGroup).toBeTruthy();
    expect(variantsOf(applied, 'A')).toEqual([]);
    expect(variantsOf(applied, 'B')).toEqual([]);
  });

  it('a change to null removes the key', () => {
    const linked = linkVariant(base, 'A', 'B');
    const applied = accept(linked, build(linked, base));
    for (const id of ['A', 'B']) {
      expect('variantGroup' in applied.containers.find((c) => c.id === id)!).toBe(false);
    }
  });

  it('a created container joins the group when applied', () => {
    const linked = linkVariant(base, 'A', 'B');
    const withD = linkVariant(
      addBackgroundContainer(linked, {
        id: 'D',
        width: 100,
        height: 100,
        background: '#000000',
      }),
      'D',
      'A',
    );
    const applied = accept(linked, build(linked, withD));
    expect(
      variantsOf(applied, 'A')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['B', 'D']);
  });

  it('a proposal that removes a container leaves no group of one', () => {
    const linked = linkVariant(base, 'A', 'B');
    const applied = accept(linked, build(linked, removeContainer(linked, 'A')));
    expect(applied.containers.some((c) => c.id === 'A')).toBe(false);
    expect('variantGroup' in applied.containers.find((c) => c.id === 'B')!).toBe(false);
  });

  it('the link survives a page move proposal', () => {
    const linked = linkVariant(createPage(base, { id: 'PG2', name: 'Page 2' }), 'A', 'B');
    const moved = moveRootsToPage(linked, ['B'], 'PG2');
    const applied = accept(linked, build(linked, moved));
    expect(variantsOf(applied, 'A').map((c) => c.id)).toEqual(['B']);
  });
});
