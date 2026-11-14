import { describe, expect, it } from 'vitest';
import {
  applyAccepted,
  createMarking,
  parseProposal,
  parseProposalText,
  previewProject,
  removeMarking,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Proposal written before schema v12: the created or removed marking carries `imageId` in the whole value
// and the marking's field change is called `imageId`. Reading normalizes to
// `containerId`; the change's `imageId` header (where it appears in the review) stays.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Swaps `containerId` for `imageId` in a marking's value, as the old version wrote it. */
function legacyValue(value: Json | null): Json | null {
  if (value === null) return null;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k === 'containerId' ? 'imageId' : k, v]),
  );
}

/**
 * Proposal in the old format: creates M9, removes M3 and changes the container field of M4 (I2 → I1),
 * all with `imageId` in place of `containerId`.
 */
function legacyJson(): Json {
  const base = sampleProject();
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I2',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
  after = removeMarking(after, 'M3');
  const json = JSON.parse(serializeProposal(propose(base, after))) as Json;
  for (const c of json.changes as Json[]) {
    if (c.entity !== 'marking' || c.field !== null) continue;
    c.from = legacyValue(c.from);
    c.to = legacyValue(c.to);
  }
  json.changes.push({
    id: 'c9',
    kind: 'update',
    entity: 'marking',
    entityId: 'M4',
    imageId: 'I2',
    markingId: 'M4',
    field: 'imageId',
    from: 'I2',
    to: 'I1',
  });
  return json;
}

function parsed(json: Json): Proposal {
  const result = parseProposal(json);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.proposal;
}

describe('proposal written with imageId in the marking (before v12)', () => {
  it('the starting JSON really has the old format', () => {
    const json = legacyJson();
    const create = json.changes.find(
      (c: Json) => c.kind === 'create' && c.entity === 'marking',
    );
    const remove = json.changes.find(
      (c: Json) => c.kind === 'remove' && c.entity === 'marking',
    );
    expect(create.to.imageId).toBe('I2');
    expect(create.to.containerId).toBeUndefined();
    expect(remove.from.imageId).toBe('I1');
    expect(remove.from.containerId).toBeUndefined();
  });

  it('creation, removal and field change are read with containerId', () => {
    const p = parsed(legacyJson());
    const create = p.changes.find((c) => c.kind === 'create' && c.entity === 'marking');
    const remove = p.changes.find((c) => c.kind === 'remove' && c.entity === 'marking');
    const field = p.changes.find((c) => c.id === 'c9');
    expect(create?.to).toMatchObject({ id: 'M9', containerId: 'I2' });
    expect(create?.to).not.toHaveProperty('imageId');
    expect(remove?.from).toMatchObject({ id: 'M3', containerId: 'I1' });
    expect(remove?.from).not.toHaveProperty('imageId');
    expect(field?.field).toBe('containerId');
    expect(field?.from).toBe('I2');
    expect(field?.to).toBe('I1');
    // The change's header does not change: it says in which container it appears in the review.
    expect(create?.imageId).toBe('I2');
    expect(remove?.imageId).toBe('I1');
    expect(field?.imageId).toBe('I2');
  });

  it('equals the proposal already in the new format and rewrites without imageId in the values', () => {
    const legacy = parsed(legacyJson());
    const modern = legacyJson();
    // The same content, written in the new format.
    for (const c of modern.changes as Json[]) {
      if (c.entity !== 'marking') continue;
      if (c.field === 'imageId') c.field = 'containerId';
      if (c.field !== null) continue;
      const toNew = (v: Json | null) =>
        v === null
          ? null
          : Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k === 'imageId' ? 'containerId' : k, x]),
            );
      c.from = toNew(c.from);
      c.to = toNew(c.to);
    }
    expect(legacy).toEqual(parsed(modern));
    const text = serializeProposal(legacy);
    const again = parseProposalText(text);
    expect(again.ok && again.proposal).toEqual(legacy);
    const reparsed = JSON.parse(text) as Json;
    for (const c of reparsed.changes as Json[]) {
      if (c.entity !== 'marking' || c.field !== null) continue;
      expect(JSON.stringify(c.from ?? c.to)).not.toContain('"imageId"');
    }
  });

  it('a proposal that already carries containerId (and imageId only in the header) stays as it is', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'M9',
      containerId: 'I2',
      rect: { x: 300, y: 300, width: 100, height: 100 },
    });
    const p = propose(base, after);
    expect(parsed(JSON.parse(serializeProposal(p)))).toEqual(p);
  });

  it('applies: the created marking, the removed one and the container field reach the project', () => {
    const base = sampleProject();
    let p = parsed(legacyJson());
    for (const c of p.changes) {
      p = decided(p, base, { level: 'change', id: c.id }, 'accepted');
    }
    const preview = previewProject(base, p).project;
    expect(preview.markings.find((m) => m.id === 'M9')?.containerId).toBe('I2');
    expect(preview.markings.some((m) => m.id === 'M3')).toBe(false);
    expect(preview.markings.find((m) => m.id === 'M4')?.containerId).toBe('I1');

    const applied = applyAccepted(base, p, AT);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.project.markings.find((m) => m.id === 'M9')?.containerId).toBe('I2');
    expect(applied.project.markings.find((m) => m.id === 'M4')?.containerId).toBe('I1');
  });
});
