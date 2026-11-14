import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  annotationsByMarking,
  buildIncompleteList,
  buildListing,
  createArrow,
  createMarking,
  layerSections,
  removeMarking,
} from '../../src/model';
import { sampleProject } from './fixtures';

describe('list view', () => {
  const p = sampleProject();
  const both = p.layers;

  it('groups Image → Marking → Layer, with the full path', () => {
    const listing = buildListing(p, both, { showEmpty: false });
    expect(listing.map((i) => i.image?.id)).toEqual(['I1', 'I2']);
    const [i1] = listing;
    // M3 has no annotation: it is left out. M2 has one, and the path goes through the parent.
    expect(i1?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2']);
    expect(i1?.markings[1]?.path.map((m) => m.id)).toEqual(['M1', 'M2']);
    const m1 = i1?.markings[0];
    expect(m1?.sections.map((s) => [s.layer.id, s.annotations.map((a) => a.id)])).toEqual(
      [
        ['L1', ['A1']],
        ['L2', ['A2']],
      ],
    );
  });

  it('respects the visible layers', () => {
    const onlyL2 = both.filter((l) => l.id === 'L2');
    const listing = buildListing(p, onlyL2, { showEmpty: false });
    expect(listing.flatMap((i) => i.markings.map((m) => m.marking.id))).toEqual([
      'M1',
      'M4',
    ]);
    expect(listing[0]?.markings[0]?.sections.map((s) => s.layer.id)).toEqual(['L2']);
  });

  it('with no visible layers the list is empty (unless it shows the empty ones)', () => {
    expect(buildListing(p, [], { showEmpty: false })).toEqual([]);
    const all = buildListing(p, [], { showEmpty: true });
    expect(all.flatMap((i) => i.markings)).toHaveLength(4);
  });

  it('"Show markings without annotations" includes the empty ones, depth first', () => {
    const listing = buildListing(p, both, { showEmpty: true });
    expect(listing[0]?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2', 'M3']);
    expect(listing[0]?.markings[2]?.sections).toEqual([]);
  });

  it('an image without markings only appears with "show empty"', () => {
    const q = removeMarking(p, 'M4');
    expect(buildListing(q, both, { showEmpty: false }).map((i) => i.image?.id)).toEqual([
      'I1',
    ]);
    expect(buildListing(q, both, { showEmpty: true }).map((i) => i.image?.id)).toEqual([
      'I1',
      'I2',
    ]);
  });

  it('a marking with an annotation appears even when the parent has none', () => {
    const q = addAnnotation(p, { id: 'A9', markingId: 'M3', layerId: 'L1' });
    const inOnlyL1 = buildListing(
      q,
      both.filter((l) => l.id === 'L1'),
      { showEmpty: false },
    );
    expect(inOnlyL1[0]?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2', 'M3']);
    const m3 = inOnlyL1[0]?.markings[2];
    expect(m3?.path.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
  });

  it('the Canvas group comes first, with the canvas markings and their annotations', () => {
    let q = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -50, y: -50, width: 900, height: 700 },
    });
    q = addAnnotation(q, { id: 'AC', markingId: 'C1', layerId: 'L1' });
    const listing = buildListing(q, both, { showEmpty: false });
    expect(listing.map((i) => i.image?.id ?? null)).toEqual([null, 'I1', 'I2']);
    expect(listing[0]?.markings.map((m) => m.marking.id)).toEqual(['C1']);
    // Without a canvas marking, the group does not appear, not even with "show empty".
    expect(buildListing(p, both, { showEmpty: true })[0]?.image?.id).toBe('I1');
  });

  it('layerSections follows the order of the given layers', () => {
    const index = annotationsByMarking(p);
    const reversed = [...both].reverse();
    expect(layerSections(index, 'M1', reversed).map((s) => s.layer.id)).toEqual([
      'L2',
      'L1',
    ]);
    expect(layerSections(index, 'M3', both)).toEqual([]);
  });
});

describe('incomplete list', () => {
  const p = sampleProject();
  // A2 (M1/L2) and A3 (M2/L1) in I1; A4 (M4/L2) in I2.
  const issues = new Map([
    ['A4', [{ code: 'layer-mismatch' as const }]],
    ['A3', [{ code: 'required-empty' as const, key: 'id' }]],
    ['A2', [{ code: 'unknown-type' as const }]],
  ]);

  it('groups by image, depth first, with layer and reasons', () => {
    const list = buildIncompleteList(p, issues);
    expect(list.map((i) => i.image?.id)).toEqual(['I1', 'I2']);
    expect(
      list[0]?.items.map((i) => [i.marking.id, i.annotation.id, i.layer.id]),
    ).toEqual([
      ['M1', 'A2', 'L2'],
      ['M2', 'A3', 'L1'],
    ]);
    expect(list[0]?.items[1]?.path.map((m) => m.id)).toEqual(['M1', 'M2']);
    expect(list[0]?.items[1]?.issues).toEqual([{ code: 'required-empty', key: 'id' }]);
  });

  it('only in the given layers (the visible ones); an image without pending items disappears', () => {
    const l1 = p.layers.filter((l) => l.id === 'L1');
    const list = buildIncompleteList(p, issues, l1);
    expect(list.map((i) => i.items.map((x) => x.annotation.id))).toEqual([['A3']]);
    expect(buildIncompleteList(p, issues, [])).toEqual([]);
  });

  it('a pending item of a canvas marking goes in the Canvas group', () => {
    let q = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -50, y: -50, width: 900, height: 700 },
    });
    q = addAnnotation(q, { id: 'AC', markingId: 'C1', layerId: 'L1' });
    const list = buildIncompleteList(
      q,
      new Map([['AC', [{ code: 'unknown-type' as const }]]]),
    );
    expect(list.map((i) => i.image?.id ?? null)).toEqual([null]);
    expect(list[0]?.items[0]?.marking.id).toBe('C1');
  });

  it('an annotation in a layer that does not exist is also listed (the counter and the list agree)', () => {
    const orphan = {
      ...(p.annotations.find((x) => x.id === 'A3') as (typeof p.annotations)[number]),
      id: 'AX',
      layerId: 'LX',
    };
    const q = { ...p, annotations: [...p.annotations, orphan] };
    const list = buildIncompleteList(
      q,
      new Map([['AX', [{ code: 'component-overflow' as const }]]]),
    );
    expect(
      list.flatMap((i) => i.items.map((x) => [x.annotation.id, x.layer.id])),
    ).toEqual([['AX', 'LX']]);
    // With "Visible layers only" it is left out: the layer does not exist, so it is not visible.
    expect(
      buildIncompleteList(
        q,
        new Map([['AX', [{ code: 'component-overflow' as const }]]]),
        [],
      ),
    ).toEqual([]);
  });

  it('with no pending items the list is empty', () => {
    expect(buildIncompleteList(p, new Map())).toEqual([]);
  });
});

describe('arrows in the list (ME4)', () => {
  function withArrow() {
    let q = createArrow(sampleProject(), { id: 'AR1', from: 'M1', to: 'M4' });
    q = addAnnotation(q, { id: 'AA', markingId: 'AR1', layerId: 'L1' });
    return q;
  }

  it('an arrow with an annotation appears right after the origin marking', () => {
    const q = withArrow();
    const listing = buildListing(q, q.layers, { showEmpty: false });
    const rows = listing[0]?.markings.map((m) => [m.marking.id, m.arrow?.id ?? null]);
    expect(rows).toEqual([
      ['M1', null],
      ['M1', 'AR1'],
      ['M2', null],
    ]);
    const arrowRow = listing[0]?.markings[1];
    expect(arrowRow?.sections.map((s) => s.annotations.map((a) => a.id))).toEqual([
      ['AA'],
    ]);
  });

  it('an arrow without an annotation only enters with "show without annotation"', () => {
    const q = createArrow(sampleProject(), { id: 'AR1', from: 'M1', to: 'M4' });
    const plain = buildListing(q, q.layers, { showEmpty: false });
    expect(plain.flatMap((i) => i.markings).some((m) => m.arrow)).toBe(false);
    const empty = buildListing(q, q.layers, { showEmpty: true });
    expect(empty.flatMap((i) => i.markings).some((m) => m.arrow?.id === 'AR1')).toBe(
      true,
    );
  });

  it('the pending item of the arrow annotation comes with the origin and the arrow', () => {
    const q = withArrow();
    const list = buildIncompleteList(
      q,
      new Map([['AA', [{ code: 'unknown-type' as const }]]]),
    );
    expect(list[0]?.items[0]).toMatchObject({
      arrow: { id: 'AR1' },
      marking: { id: 'M1' },
    });
  });
});
