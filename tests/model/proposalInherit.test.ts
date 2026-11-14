import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  parseProposal,
  renameAnnotation,
  serializeProposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Proposals written before schema 13 carry `inherit`: reading ignores the field (with a warning)
// and the rest of the proposal stays as it was. formatVersion 3 is already born without it.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Version 2 proposal as the old app wrote it: c1 renames, c2 creates A9 and c3 changes `inherit`. */
function legacySample(): Json {
  const base = sampleProject();
  let after = renameAnnotation(base, 'A3', 'Latch');
  after = addAnnotation(after, { id: 'A9', markingId: 'M4', layerId: 'L1' });
  let p = propose(base, after);
  p = decided(p, base, { level: 'change', id: 'c1' }, 'accepted');
  const json = JSON.parse(serializeProposal(p)) as Json;
  json.formatVersion = 2;
  json.changes.push({
    id: 'c3',
    kind: 'update',
    entity: 'annotation',
    entityId: 'A1',
    imageId: 'I1',
    markingId: 'M1',
    field: 'inherit',
    from: false,
    to: true,
  });
  json.decisions.c3 = { ...json.decisions.c1 };
  json.applied.c3 = { at: AT };
  json.notes = [
    { id: 'n1', target: { level: 'change', id: 'c3' }, text: 'Inheritance.', at: AT },
  ];
  return json;
}

describe('proposal with `inherit` (formatVersion 1 and 2)', () => {
  it("discards the field's change, its decision and its application, with a warning", () => {
    const result = parseProposal(legacySample());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.proposal.formatVersion).toBe(2);
    expect(result.proposal.changes.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result.proposal.changes.some((c) => c.field === 'inherit')).toBe(false);
    expect(Object.keys(result.proposal.decisions)).toEqual(['c1']);
    expect(Object.keys(result.proposal.applied)).not.toContain('c3');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('inherit');
  });

  it('the note attached to the discarded change moves to the proposal', () => {
    const result = parseProposal(legacySample());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.proposal.notes.map((n) => n.target)).toEqual([
      { level: 'proposal', id: null },
    ]);
  });

  it('the whole annotation of a creation loses `inherit`', () => {
    const json = legacySample();
    json.changes = json.changes.filter((c: Json) => c.id !== 'c3');
    delete json.decisions.c3;
    delete json.applied.c3;
    json.notes = [];
    const create = json.changes.find((c: Json) => c.id === 'c2');
    create.to = { ...create.to, inherit: true };
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const change = result.proposal.changes.find((c) => c.id === 'c2');
    expect(change?.to).not.toHaveProperty('inherit');
    expect(change?.to).toMatchObject({ id: 'A9', markingId: 'M4' });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('a proposal without `inherit` has no warnings', () => {
    const json = legacySample();
    json.changes = json.changes.filter((c: Json) => c.id !== 'c3');
    delete json.decisions.c3;
    delete json.applied.c3;
    json.notes = [];
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.warnings).toEqual([]);
  });
});

describe('proposal formatVersion 4 (without inherit since 3)', () => {
  it('is accepted and comes back the same', () => {
    const base = sampleProject();
    const p = propose(base, renameAnnotation(base, 'A3', 'Latch'));
    const json = JSON.parse(serializeProposal(p)) as Json;
    expect(json.formatVersion).toBe(4);
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.warnings).toEqual([]);
    expect(JSON.parse(serializeProposal(result.proposal))).toEqual(json);
  });
});
