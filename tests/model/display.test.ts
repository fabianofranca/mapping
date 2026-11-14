import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  createArrow,
  layerDotsByMarking,
  markingVisibility,
} from '../../src/model';
import { sampleProject } from './fixtures';

// Door (M1) › Handle (M2) › Lock (M3); A1 (M1/L1) and A3 (M2/L1) are own.
const p = sampleProject();
const [l1, l2] = p.layers;
const both = p.layers;

describe('layer dots', () => {
  it('only considers the visible layers', () => {
    const dots = layerDotsByMarking(p, [l2 as NonNullable<typeof l2>]);
    expect(dots.has('M3')).toBe(false);
    expect(dots.get('M1')?.map((d) => d.layer.id)).toEqual(['L2']);
  });
});

describe('layer dots: arrows', () => {
  it('an arrow with an annotation is keyed by its own id, like markings', () => {
    let q = createArrow(p, { id: 'R1', from: 'M1', to: 'M4' });
    q = createArrow(q, { id: 'R2', from: 'M2', to: 'M3' });
    q = addAnnotation(q, { id: 'AR', markingId: 'R1', layerId: 'L2' });
    const dots = layerDotsByMarking(q, both);
    expect(dots.get('R1')?.map((d) => d.layer.id)).toEqual(['L2']);
    expect(dots.has('R2')).toBe(false);
    // Markings stay as before.
    expect(dots.get('M1')?.map((d) => d.layer.id)).toEqual(['L1', 'L2']);
  });
});

describe('display modes', () => {
  const dots = layerDotsByMarking(p, both);

  it('show all: everything in full', () => {
    const v = markingVisibility(p, dots, 'all', null);
    expect([...v.values()].every((x) => x === 'full')).toBe(true);
  });

  it('dim: only dims what has no own annotation', () => {
    const v = markingVisibility(p, dots, 'dim', null);
    expect(v.get('M4')).toBe('full'); // own in L2
    const v1 = markingVisibility(
      sampleProject(),
      layerDotsByMarking(sampleProject(), both),
      'dim',
      null,
    );
    expect(v1.get('M3')).toBe('dim');
  });

  it('hide: what has no annotation disappears, and the ancestor of what shows keeps only its outline', () => {
    // Only L1: M1 and M2 have one; M3 (child of M2) and M4 do not and are nobody's parent.
    const base = sampleProject();
    const only = [l1 as NonNullable<typeof l1>];
    const v = markingVisibility(base, layerDotsByMarking(base, only), 'hide', null);
    expect(v.get('M1')).toBe('full');
    expect(v.get('M2')).toBe('full');
    expect(v.get('M3')).toBe('hidden');
    expect(v.get('M4')).toBe('hidden');
  });

  it('hide: a parent without an annotation becomes an outline; the selected one always shows', () => {
    // Only L2: M1 and M4 have one; M2 (only L1) contains the selected M3, so it stays as an outline.
    const base = sampleProject();
    const only = [l2 as NonNullable<typeof l2>];
    const v = markingVisibility(base, layerDotsByMarking(base, only), 'hide', 'M3');
    expect(v.get('M3')).toBe('full');
    expect(v.get('M2')).toBe('outline');
    expect(v.get('M1')).toBe('full');
    expect(v.get('M4')).toBe('full');
  });

  it('hide: a parent without an annotation becomes an outline when only one child has an annotation', () => {
    // Active = L2 with A2 only on M1: no parent without an annotation. Without A2, the M1 › M2 chain is an outline.
    const base = sampleProject();
    const v = markingVisibility(base, new Map([['M2', []]]), 'hide', null);
    expect(v.get('M2')).toBe('full');
    expect(v.get('M1')).toBe('outline');
    expect(v.get('M3')).toBe('hidden');
    expect(v.get('M4')).toBe('hidden');
  });
});

describe('markings that draw a component', () => {
  it('alwaysShown stays in full under hide and dim, and the parent does not become an outline', () => {
    const base = sampleProject();
    // No visible layer with an annotation: without `alwaysShown`, everything disappears.
    const none = new Map<string, readonly never[]>();
    expect(markingVisibility(base, none, 'hide', null).get('M3')).toBe('hidden');
    const always = new Set(['M2', 'M3']);
    const hide = markingVisibility(base, none, 'hide', null, always);
    expect(hide.get('M2')).toBe('full');
    expect(hide.get('M3')).toBe('full');
    // What does not draw follows the usual rule; its ancestor (M1) is only an outline.
    expect(hide.get('M4')).toBe('hidden');
    expect(hide.get('M1')).toBe('outline');
    const dim = markingVisibility(base, none, 'dim', null, always);
    expect(dim.get('M3')).toBe('full');
    expect(dim.get('M4')).toBe('dim');
  });

  it('without alwaysShown nothing changes', () => {
    const base = sampleProject();
    const none = new Map<string, readonly never[]>();
    expect(markingVisibility(base, none, 'hide', null, new Set())).toEqual(
      markingVisibility(base, none, 'hide', null),
    );
  });
});

describe('display modes by visible layers', () => {
  it('an annotation in any visible layer keeps the marking; with none, it disappears', () => {
    const base = sampleProject();
    // Visible = L1 and L2: markings with an annotation in either stay.
    const both = layerDotsByMarking(base, base.layers);
    const withAny = new Set(both.keys());
    expect(withAny.has('M1') && withAny.has('M2') && withAny.has('M4')).toBe(true);
    const v = markingVisibility(base, both, 'hide', null);
    expect(v.get('M2')).toBe('full');
    // Only L2 visible: M2 (only has L1) disappears, M1 and M4 stay.
    const onlyL2 = layerDotsByMarking(base, [l2 as NonNullable<typeof l2>]);
    const hide = markingVisibility(base, onlyL2, 'hide', null);
    expect(hide.get('M1')).toBe('full');
    expect(hide.get('M4')).toBe('full');
    expect(hide.get('M2')).toBe('hidden');
    expect(markingVisibility(base, onlyL2, 'dim', null).get('M2')).toBe('dim');
  });
});
