import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_ANCHOR_FORMAT_VERSION,
  PROPOSAL_DECORATIVE_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSIONS,
  PROPOSAL_FORMAT_VERSION,
  addBackgroundContainer,
  applyAccepted,
  buildProposal,
  createMarking,
  createProject,
  decide,
  parseProposal,
  proposalFormatVersionFor,
  reviewTree,
  serializeProposal,
  setMarkingAnchor,
  setMarkingDecorative,
  usesDecorative,
  type Project,
  type Proposal,
} from '../../src/model';

// `decorative` in a proposal (schema v25, decision 7 of stage #2826): a marking field compared like
// `floating`, carried by the whole marking of a creation or removal (absent reads as `false`), and
// `formatVersion` 13, written only when a created marking is decorative or a change touches the
// field (an earlier app refuses 13 instead of dropping the flag of a created marking).

const AT = '2026-11-27T10:00:00.000Z';
const FRAME = { x: 10, y: 10, width: 380, height: 120 };
const SAMPLES = [
  { x: 20, y: 30, width: 100, height: 60 },
  { x: 150, y: 30, width: 100, height: 60 },
  { x: 280, y: 30, width: 100, height: 60 },
];

/** Container `c1` with three samples in a row. */
const withSamples = SAMPLES.reduce(
  (p, rect, i) => createMarking(p, { id: `S${i + 1}`, containerId: 'c1', rect }),
  addBackgroundContainer(
    createProject({
      name: 'Test',
      now: AT,
      firstLayer: { id: 'l1', name: 'Layer 1', color: '#FF0000' },
    }),
    { id: 'c1', width: 400, height: 300, background: '#FFFFFF' },
  ),
);

/** The same project with a decorative frame around the samples (born first among the siblings). */
const withFrame = createMarking(withSamples, {
  id: 'F',
  containerId: 'c1',
  rect: FRAME,
  decorative: true,
});

/** The same project with a non-decorative frame around the samples (it becomes their parent). */
const withPlainFrame = createMarking(withSamples, {
  id: 'F',
  containerId: 'c1',
  rect: FRAME,
});

const build = (from: Project, after: Project): Proposal =>
  buildProposal(from, after, { title: 'Decorative', createdAt: AT });

function accept(from: Project, proposal: Proposal, only?: string): Project {
  const tree = reviewTree(proposal, from);
  const target = only
    ? { level: 'change' as const, id: only }
    : { level: 'proposal' as const, id: null };
  const decided = decide(proposal, tree, target, 'accepted', AT);
  if (!decided.ok) throw new Error(decided.reason);
  const applied = applyAccepted(from, { ...proposal, decisions: decided.decisions }, AT);
  if (!applied.ok) throw new Error('blocked');
  return applied.project;
}

const markingOf = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;
const orderOf = (p: Project) => p.markings.map((m) => m.id);

describe('proposal with the decorative field', () => {
  it('without decorative the proposal stays at formatVersion 4 and 13 is a readable version', () => {
    const proposal = build(withSamples, withSamples);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDecorative(proposal.changes)).toBe(false);
    expect(PROPOSAL_DECORATIVE_FORMAT_VERSION).toBe(13);
    expect(PROPOSAL_FORMAT_VERSIONS.at(-1)).toBe(13);
  });

  it('a created non-decorative marking does not need 13 (and its value has no decorative key)', () => {
    const proposal = build(withSamples, withPlainFrame);
    expect(proposal.formatVersion).toBe(PROPOSAL_FORMAT_VERSION);
    expect(usesDecorative(proposal.changes)).toBe(false);
    const create = proposal.changes.find((c) => c.kind === 'create');
    expect(create?.to).not.toHaveProperty('decorative');
  });

  it('a decorative created marking writes 13 and the whole marking carries decorative: true', () => {
    const proposal = build(withSamples, withFrame);
    expect(proposal.formatVersion).toBe(PROPOSAL_DECORATIVE_FORMAT_VERSION);
    expect(usesDecorative(proposal.changes)).toBe(true);
    const create = proposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    expect(create?.to).toMatchObject({ id: 'F', decorative: true });
  });

  it('a decorative change on an existing marking writes 13 and is a single field change', () => {
    const proposal = build(
      withPlainFrame,
      setMarkingDecorative(withPlainFrame, 'F', true),
    );
    expect(proposal.formatVersion).toBe(PROPOSAL_DECORATIVE_FORMAT_VERSION);
    const changes = proposal.changes.filter(
      (c) => c.entity === 'marking' && c.field === 'decorative',
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'update',
      entityId: 'F',
      field: 'decorative',
      from: false,
      to: true,
    });
  });

  it('the other proposals keep their versions', () => {
    const anchored = setMarkingAnchor(withSamples, 'S2', { to: 'S1', side: 'bottom' });
    expect(build(withSamples, anchored).formatVersion).toBe(
      PROPOSAL_ANCHOR_FORMAT_VERSION,
    );
    // The version of the change set with the flag is the newest feature (it includes the earlier ones).
    expect(proposalFormatVersionFor(build(withSamples, withFrame).changes, 4)).toBe(13);
    // A revision never goes down.
    expect(proposalFormatVersionFor([], 5, 13)).toBe(13);
  });

  it('round trip: writing and reading keeps decorative and the version', () => {
    const proposal = build(withSamples, withFrame);
    const parsed = parseProposal(JSON.parse(serializeProposal(proposal)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.proposal.formatVersion).toBe(13);
    expect(parsed.proposal.changes.find((c) => c.kind === 'create')?.to).toMatchObject({
      decorative: true,
    });
  });

  it('13 refuses an earlier version: a decorative created marking or change below 13 is an error', () => {
    const created = JSON.parse(
      serializeProposal(build(withSamples, withFrame)),
    ) as Record<string, unknown>;
    const toggled = JSON.parse(
      serializeProposal(
        build(withPlainFrame, setMarkingDecorative(withPlainFrame, 'F', true)),
      ),
    ) as Record<string, unknown>;
    for (const [label, json] of [
      ['created marking', created],
      ['field change', toggled],
    ] as const) {
      expect(parseProposal(json).ok, `${label} accepted at 13`).toBe(true);
      const below = { ...json, formatVersion: 12 };
      const r = parseProposal(below);
      expect(r.ok, `${label} refused at 12`).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toContain('formatVersion 13');
    }
  });

  it('a whole marking without the key reads as false when applied', () => {
    const proposal = build(withSamples, withPlainFrame);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(serializeProposal(proposal)) as Record<string, any>;
    const create = (json.changes as Record<string, any>[]).find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    expect(create?.to).not.toHaveProperty('decorative');
    const parsed = parseProposal(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = accept(withSamples, parsed.proposal);
    expect(markingOf(applied, 'F').decorative).toBe(false);
  });

  it('accepting only the field applies it and settles (the samples leave the frame)', () => {
    expect(markingOf(withPlainFrame, 'S1').parentId).toBe('F');
    const proposal = build(
      withPlainFrame,
      setMarkingDecorative(withPlainFrame, 'F', true),
    );
    const change = proposal.changes.find((c) => c.field === 'decorative');
    const applied = accept(withPlainFrame, proposal, change?.id);
    expect(markingOf(applied, 'F').decorative).toBe(true);
    for (const id of ['S1', 'S2', 'S3'])
      expect(markingOf(applied, id).parentId).toBeNull();
  });

  it('accepting the field turned off lets the frame take what it contains', () => {
    const proposal = build(withFrame, setMarkingDecorative(withFrame, 'F', false));
    const change = proposal.changes.find((c) => c.field === 'decorative');
    expect(change).toMatchObject({ from: true, to: false });
    const applied = accept(withFrame, proposal, change?.id);
    expect(markingOf(applied, 'F').decorative).toBe(false);
    expect(markingOf(applied, 'S1').parentId).toBe('F');
  });

  it('the created position survives the apply: the decorative marking stays first among its siblings', () => {
    expect(orderOf(withFrame).indexOf('F')).toBeLessThan(
      orderOf(withFrame).indexOf('S1'),
    );
    const proposal = build(withSamples, withFrame);
    const create = proposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    );
    expect(create?.insertBefore).toBe('S1');
    const applied = accept(withSamples, proposal);
    expect(orderOf(applied)).toEqual(orderOf(withFrame));
    expect(markingOf(applied, 'F')).toMatchObject({ decorative: true, parentId: null });
    for (const id of ['S1', 'S2', 'S3'])
      expect(markingOf(applied, id).parentId).toBeNull();
  });
});
