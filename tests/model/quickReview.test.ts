import { describe, expect, it } from 'vitest';
import {
  QUICK_REVIEW_MAX_ITEMS,
  addAnnotation,
  addEntry,
  addLayer,
  createMarking,
  quickReviewOf,
  removeMarking,
  renameAnnotation,
  renameMarking,
  setMarkingRect,
  type Change,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, propose } from './proposalFixtures';

const base = sampleProject();

const reasonOf = (p: Proposal, project: Project = base) => {
  const result = quickReviewOf(p, project);
  return result.ok ? null : result.reason;
};

describe('quickReviewOf: eligible proposals', () => {
  it('accepts the creation of one marking with an annotation, in one container', () => {
    let after = createMarking(base, {
      id: 'M9',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 100, height: 50 },
      name: 'Button',
    });
    after = addAnnotation(after, { id: 'A9', markingId: 'M9', layerId: 'L1' });
    const result = quickReviewOf(propose(base, after), base);
    expect(result).toEqual({ ok: true, spaceId: 'I1', created: ['M9'], changed: [] });
  });

  it('accepts a marking created on the canvas (space null)', () => {
    const after = createMarking(base, {
      id: 'M9',
      containerId: null,
      rect: { x: 90000, y: 90000, width: 100, height: 50 },
      name: 'Solta',
    });
    const result = quickReviewOf(propose(base, after), base);
    expect(result).toEqual({ ok: true, spaceId: null, created: ['M9'], changed: [] });
  });

  it('accepts a name change and a move of existing markings (changed)', () => {
    let after = renameMarking(base, 'M1', 'Porta dianteira');
    after = setMarkingRect(after, 'M2', { x: 1210, y: 1210, width: 400, height: 200 });
    const result = quickReviewOf(propose(base, after), base);
    expect(result).toEqual({
      ok: true,
      spaceId: 'I1',
      created: [],
      changed: ['M1', 'M2'],
    });
  });

  it('counts a marking whose only changes are annotation updates as changed', () => {
    let after = renameAnnotation(base, 'A1', 'Amassado grande');
    after = addEntry(after, 'A1', { id: 'E9', key: 'cor', value: 'azul' });
    const proposal = propose(base, after);
    expect(proposal.changes.every((c) => c.entity === 'annotation')).toBe(true);
    expect(quickReviewOf(proposal, base)).toEqual({
      ok: true,
      spaceId: 'I1',
      created: [],
      changed: ['M1'],
    });
  });

  it('accepts exactly QUICK_REVIEW_MAX_ITEMS markings', () => {
    expect(QUICK_REVIEW_MAX_ITEMS).toBe(5);
    let after = base;
    for (let i = 0; i < QUICK_REVIEW_MAX_ITEMS; i += 1) {
      after = createMarking(after, {
        id: `N${i}`,
        containerId: 'I1',
        rect: { x: 2500 + i * 10, y: 100, width: 20, height: 20 },
        name: `Novo ${i}`,
      });
    }
    const result = quickReviewOf(propose(base, after), base);
    expect(result.ok).toBe(true);
  });
});

describe('quickReviewOf: why a proposal is not a quick review', () => {
  const eligible = (): Proposal =>
    propose(base, renameMarking(base, 'M1', 'Porta dianteira'));

  it('not-open: any status other than open', () => {
    for (const status of ['applied', 'superseded', 'withdrawn', 'rejected'] as const) {
      expect(reasonOf({ ...eligible(), status })).toBe('not-open');
    }
  });

  it('decided: a decision was already made', () => {
    const p = eligible();
    const id = p.changes[0]?.id ?? '';
    expect(reasonOf({ ...p, decisions: { [id]: { state: 'rejected', at: AT } } })).toBe(
      'decided',
    );
  });

  it('applied: something was already applied', () => {
    const p = eligible();
    const id = p.changes[0]?.id ?? '';
    expect(reasonOf({ ...p, applied: { [id]: { at: AT } } })).toBe('applied');
  });

  it('entity: a layer, an image, a page or an arrow change', () => {
    const withLayer = propose(
      base,
      addLayer(base, { id: 'L9', name: 'Nova', color: '#00FF00' }),
    );
    expect(reasonOf(withLayer)).toBe('entity');
    const p = eligible();
    const asArrow: Proposal = {
      ...p,
      changes: p.changes.map((c): Change => ({ ...c, entity: 'arrow' })),
    };
    expect(reasonOf(asArrow)).toBe('entity');
  });

  it('entity: an annotation on something that is not a marking of the project', () => {
    const p = propose(base, renameAnnotation(base, 'A1', 'Outro'));
    const orphan: Proposal = {
      ...p,
      changes: p.changes.map((c): Change => ({ ...c, markingId: 'AR1' })),
    };
    expect(reasonOf(orphan)).toBe('entity');
  });

  it('remove: the removal of a marking', () => {
    expect(reasonOf(propose(base, removeMarking(base, 'M3')))).toBe('remove');
  });

  it('field: an update outside name and rect of a marking', () => {
    const p = eligible();
    const locked: Proposal = {
      ...p,
      changes: p.changes.map((c): Change => ({ ...c, field: 'locked' })),
    };
    expect(reasonOf(locked)).toBe('field');
  });

  it('field: an annotation update outside name, values.<key> and entries.<id>', () => {
    const p = propose(base, renameAnnotation(base, 'A1', 'Outro'));
    const moved: Proposal = {
      ...p,
      changes: p.changes.map((c): Change => ({ ...c, field: 'layerId' })),
    };
    expect(reasonOf(moved)).toBe('field');
  });

  it('spaces: changes in two containers', () => {
    let after = renameMarking(base, 'M1', 'Porta dianteira');
    after = setMarkingRect(after, 'M4', { x: 5, y: 5, width: 100, height: 100 });
    expect(reasonOf(propose(base, after))).toBe('spaces');
  });

  it('too-many: more than QUICK_REVIEW_MAX_ITEMS markings', () => {
    let after = base;
    for (let i = 0; i <= QUICK_REVIEW_MAX_ITEMS; i += 1) {
      after = createMarking(after, {
        id: `N${i}`,
        containerId: 'I1',
        rect: { x: 2500 + i * 10, y: 100, width: 20, height: 20 },
        name: `Novo ${i}`,
      });
    }
    expect(reasonOf(propose(base, after))).toBe('too-many');
  });
});
