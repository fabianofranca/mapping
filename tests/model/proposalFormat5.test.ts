import { describe, expect, it } from 'vitest';
import {
  parseProposal,
  parseProposalText,
  renameMarking,
  serializeProposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { propose } from './proposalFixtures';

// formatVersion 5: version 4 with `revisions` at the root, the history of the agent's revisions
// (docs/PROPOSAL-FORMAT.md, "Agent revision"). Here: reading, rewriting and the rules.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Version 4 proposal as canonical JSON (keys in serialization order), with one change c1. */
function base4(): Json {
  const base = sampleProject();
  const p = propose(base, renameMarking(base, 'M4', 'Headlight'));
  return JSON.parse(serializeProposal(p)) as Json;
}

/** Dropped change: the same shape as `changes`, with another id. */
function droppedChange(): Json {
  const c = base4().changes[0] as Json;
  return { ...c, id: 'c4' };
}

/** Canonical version 5 proposal with a revision that fills changed, added and dropped. */
function sample5(): Json {
  const json = base4();
  json.formatVersion = 5;
  json.notes = [
    {
      id: 'n9',
      target: { level: 'proposal', id: null },
      text: 'Came from change c4',
      at: '2026-11-07T10:00:00.000Z',
    },
  ];
  json.revisions = [
    {
      at: '2026-11-07T10:00:00.000Z',
      baseRevision: 43,
      operations: [],
      changed: { c1: { to: 'Screen title', state: 'rejected' } },
      added: ['c9'],
      dropped: [{ change: droppedChange(), state: null, notes: ['n2'] }],
    },
  ];
  return json;
}

const text = (json: Json) => `${JSON.stringify(json, null, 2)}\n`;

function errorsOf(json: Json): string[] {
  const result = parseProposal(json);
  if (result.ok) throw new Error('expected an error');
  return result.errors;
}

describe('proposal formatVersion 5', () => {
  it('reads the file with revisions and rewrites it byte for byte the same', () => {
    const input = text(sample5());
    const result = parseProposalText(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.formatVersion).toBe(5);
    expect(result.proposal.revisions).toHaveLength(1);
    expect(serializeProposal(result.proposal)).toBe(input);
  });

  it('version 4 with revisions gives an error with the path', () => {
    const json = sample5();
    json.formatVersion = 4;
    expect(errorsOf(json)).toContain('revisions: only in formatVersion 5 or later');
  });

  it('version 5 without revisions gives an error', () => {
    const json = sample5();
    delete json.revisions;
    expect(errorsOf(json)).toContain('revisions: required in formatVersion 5');
  });

  it('a dropped id that is in changes gives an error', () => {
    const json = sample5();
    json.revisions[0].dropped[0].change.id = 'c1';
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[0].dropped[0].change.id: '))).toBe(
      true,
    );
  });

  it('an id repeated in added of two revisions gives an error on the second', () => {
    const json = sample5();
    json.revisions.push({
      at: '2026-11-07T11:00:00.000Z',
      baseRevision: 44,
      operations: [],
      changed: {},
      added: ['c9'],
      dropped: [],
    });
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[1].added[0]: '))).toBe(true);
  });

  it('an id repeated inside added of the same revision gives an error', () => {
    const json = sample5();
    json.revisions[0].added = ['c9', 'c9'];
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[0].added[1]: '))).toBe(true);
  });

  it.each([1, 2, 3, 4])(
    'version %i is still read and rewritten without revisions',
    (version) => {
      const json = base4();
      json.formatVersion = version;
      if (version < 4) {
        for (const c of json.changes as Json[]) delete c.insertBefore;
      }
      const result = parseProposal(json);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.proposal.formatVersion).toBe(version);
      expect(result.proposal.revisions).toBeUndefined();
      const out = JSON.parse(serializeProposal(result.proposal)) as Json;
      expect(out.formatVersion).toBe(version);
      expect('revisions' in out).toBe(false);
    },
  );

  it('dropped[].change is validated as a change', () => {
    const json = sample5();
    json.revisions[0].dropped[0].change.kind = 'move';
    const errors = errorsOf(json);
    expect(
      errors.some((e) => e.startsWith('revisions[0].dropped[0].change.kind: ')),
    ).toBe(true);
  });

  it('citing in changed, added or dropped.notes something that no longer exists is not an error', () => {
    const json = sample5();
    json.revisions[0].changed = { c77: { to: 1, state: null } };
    json.revisions[0].added = ['c88'];
    json.revisions[0].dropped[0].notes = ['n-gone'];
    expect(parseProposal(json).ok).toBe(true);
  });

  it('a non-ISO at gives an error; changed.state only accepts "rejected" or null', () => {
    const badDate = sample5();
    badDate.revisions[0].at = 'yesterday';
    expect(errorsOf(badDate).some((e) => e.startsWith('revisions[0].at: '))).toBe(true);

    const badState = sample5();
    badState.revisions[0].changed.c1.state = 'accepted';
    expect(
      errorsOf(badState).some((e) => e.startsWith('revisions[0].changed.c1.state: ')),
    ).toBe(true);

    const noState = sample5();
    noState.revisions[0].dropped[0].state = 'accepted';
    expect(
      errorsOf(noState).some((e) => e.startsWith('revisions[0].dropped[0].state: ')),
    ).toBe(true);
  });
});
