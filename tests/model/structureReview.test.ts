// Findings of the MS1 review (stage #3087): a component created over observation markings, and the `slot`
// that must never outlive the stored parent.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  removeAnnotation,
  settleFrom,
  settleHierarchy,
  validateProject,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { find, parents, r, raw, structureProject } from '../support/structureFixtures';

describe('a component created over observation markings', () => {
  it('does not keep them as children: the new marking is materialized', () => {
    const base = settleHierarchy({
      ...componentProject(),
      markings: [raw('bare', r(30, 30, 40, 20))],
    });
    expect(find(base, 'bare').parentId).toBeNull();
    const created = addComponentMarking(
      base,
      testCatalog(),
      {
        markingId: 'NEW',
        annotationId: 'A_NEW',
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: r(0, 0, 200, 100),
      },
      approximateMeasurer,
    );
    expect(parents(created).bare).toBeNull();
    expect(settleHierarchy(created)).toBe(created);
  });
});

describe('the slot never outlives the stored parent', () => {
  const withSlot = () =>
    structureProject(
      [
        raw('A', r(0, 0, 600, 500)),
        raw('card', r(20, 20, 300, 200), { parentId: 'A', slot: 'content' }),
      ],
      ['A', 'card'],
    );

  it('a floating child loses it with the parent', () => {
    const p = withSlot();
    const floating = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'card' ? { ...m, floating: true } : m)),
    };
    const settled = settleHierarchy(floating);
    expect(find(settled, 'card').parentId).toBeNull();
    expect(find(settled, 'card').slot).toBeUndefined();
    expect(validateProject(settled).map((i) => i.code)).not.toContain(
      'slot-without-parent',
    );
  });

  it('a child that stops being materialized loses it, in the clipped and in the full settle', () => {
    const p = settleHierarchy(withSlot());
    expect(find(p, 'card').slot).toBe('content');
    const bare = removeAnnotation(p, 'A_card_text');
    const clipped = settleFrom(p, bare);
    const full = settleHierarchy(bare);
    for (const settled of [clipped, full]) {
      expect(find(settled, 'card').slot).toBeUndefined();
      expect(validateProject(settled).map((i) => i.code)).not.toContain(
        'slot-without-parent',
      );
    }
    expect(clipped.markings).toEqual(full.markings);
  });
});
