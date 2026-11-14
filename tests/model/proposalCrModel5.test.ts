// Stage #945, phase 5 (#1019): defects 36, 37, 39 and 40 of the proposals.
import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  addLayer,
  changeStatuses,
  computeChanges,
  createMarking,
  patchProject,
  parseProposalText,
  placeCreatedMarkings,
  serializeProposal,
  type Change,
  type Marking,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { propose } from './proposalFixtures';

describe('36: position + remove of the same layer', () => {
  it('the position of the layer being removed is ignored and the order of the others does not change', () => {
    let base = emptyProject();
    for (const id of ['L2', 'L3']) {
      base = addLayer(base, { id, name: id, color: '#ff0000' });
    }
    const handMade: Change[] = [
      {
        id: 'c1',
        entity: 'layer',
        entityId: 'L1',
        kind: 'update',
        field: 'position',
        from: 2,
        to: 0,
        imageId: null,
        markingId: null,
      },
      {
        id: 'c2',
        entity: 'layer',
        entityId: 'L1',
        kind: 'remove',
        field: null,
        from: base.layers[0] as unknown as Change['from'],
        to: null,
        imageId: null,
        markingId: null,
      },
    ] as Change[];
    const { project } = patchProject(base, handMade);
    expect(project.layers.map((l) => l.id)).toEqual(['L2', 'L3']);
  });
});

describe('37: placeCreatedMarkings with an anchor equal to its own id', () => {
  it('the anchor on its own id is ignored', () => {
    const mk = (id: string) => ({ id }) as Marking;
    const list = [mk('a'), mk('b'), mk('c'), mk('x')];
    const placed = placeCreatedMarkings(list, new Map([['b', 'b']]));
    expect(placed.map((m) => m.id)).toEqual(['a', 'b', 'c', 'x']);
  });
});

describe('39: annotation removed without parentRole in from', () => {
  it('does not become a false conflict, even on the round trip of a proposal older than v14', () => {
    let base = addContainer(emptyProject(), {
      id: 'I1',
      file: 'a.png',
      width: 100,
      height: 100,
    });
    base = createMarking(base, {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    base = addAnnotation(base, { id: 'E1', markingId: 'M1', layerId: 'L1' });
    const after = { ...base, annotations: [] };
    const p = propose(base, after);
    const raw = JSON.parse(serializeProposal(p)) as {
      changes: { entity: string; kind: string; from: Record<string, unknown> | null }[];
    };
    for (const c of raw.changes) {
      if (c.entity === 'annotation' && c.kind === 'remove' && c.from) {
        delete c.from.parentRole;
      }
    }
    const read = parseProposalText(JSON.stringify(raw));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    const change = read.proposal.changes.find(
      (c) => c.entity === 'annotation' && c.kind === 'remove',
    ) as Change;
    expect(changeStatuses(read.proposal, base).get(change.id)?.conflict).toBe(false);

    // Also without going through reading: the `from` without the key.
    const bare = {
      ...change,
      from: { ...(change.from as object) } as Record<string, never>,
    };
    delete (bare.from as Record<string, unknown>).parentRole;
    const direct = { ...read.proposal, changes: [bare as Change] };
    expect(changeStatuses(direct, base).get(bare.id)?.conflict).toBe(false);
  });
});

describe('40: field inherited from Object.prototype', () => {
  it('computeChanges does not fail with the toString field absent', () => {
    let base = addContainer(emptyProject(), {
      id: 'I1',
      file: 'a.png',
      width: 100,
      height: 100,
    });
    base = createMarking(base, {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    base = addAnnotation(base, { id: 'E1', markingId: 'M1', layerId: 'L1' });
    const typed = {
      ...base,
      annotations: base.annotations.map((a) => ({ ...a, values: { toString: 'x' } })),
    };
    expect(() => computeChanges(base, typed as typeof base)).not.toThrow();
    const base2 = { ...base, annotations: typed.annotations };
    const after2 = {
      ...base2,
      annotations: base2.annotations.map((a) => ({ ...a, values: {} })),
    };
    expect(() => computeChanges(base2, after2 as typeof base2)).not.toThrow();
  });
});
