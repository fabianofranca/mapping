import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  buildListing,
  deserialize,
  layerDotsByMarking,
  markingVisibility,
  perspectiveView,
  projectIndex,
  projectIssues,
  serialize,
  validateProject,
  type Project,
} from '../../../src/model';
import { withAccessibility } from '../../model/accessibilityFixtures';
import { buildScaleProject } from '../../model/scaleProject';
import { GROWTH_OPTIONS, expectLinearGrowth } from '../../support/growth';

// Model cases of the growth test (#881): the same operation with 1,250 and 5,000 markings, ratio < 6×.
// The fixture is settled once; each round measures a new version of the project (`{ ...p }`).
const build = (markings: number): Project => buildScaleProject({ markings });

describe('model growth (n = 1,250, 4n = 5,000 markings)', () => {
  it('validates the invariants', GROWTH_OPTIONS, () => {
    expectLinearGrowth('validateProject', {
      build,
      run: (p) => {
        const issues = validateProject(p);
        if (issues.length > 0) throw new Error('the fixture should be valid');
        return issues;
      },
      // A few ms per round: more rounds so the median does not fluctuate.
      runs: 41,
    });
  });

  it('serializes and reads back without losses', GROWTH_OPTIONS, () => {
    const written = serialize(build(1250));
    const read = deserialize(written);
    expect(read.ok && serialize(read.project)).toBe(written);
    expectLinearGrowth('serialize + deserialize', {
      build,
      run: (p) => deserialize(serialize(p)),
    });
  });

  it(
    'builds the index, the pending items, the indicators and the visibility',
    GROWTH_OPTIONS,
    () => {
      expectLinearGrowth('index + pending items + indicators + visibility', {
        build,
        run: (p) => {
          projectIndex(p);
          projectIssues(p);
          layerDotsByMarking(p, p.layers);
          const active = layerDotsByMarking(p, p.layers.slice(0, 1));
          return markingVisibility(p, active, 'hide', null);
        },
        runs: 41,
      });
    },
  );

  it('builds the list', GROWTH_OPTIONS, () => {
    expectLinearGrowth('buildListing', {
      build,
      run: (p) => {
        const listing = buildListing(p, p.layers, { showEmpty: true });
        if (listing.length === 0) throw new Error('the list must not be empty');
        return listing;
      },
      runs: 41,
    });
  });

  it('audits accessibility (labels, parts and touch targets)', GROWTH_OPTIONS, () => {
    expectLinearGrowth('accessibilityAudit', {
      build: (markings) => withAccessibility(build(markings)),
      // The index of the new version is already measured in the index case: here only the audit.
      prepare: projectIndex,
      run: (p) => {
        const audit = accessibilityAudit(p);
        if (audit.size === 0) throw new Error('the audit must find something');
        return audit;
      },
      runs: 41,
    });
  });
});

describe('perspective growth (n = 2,500, 4n = 10,000 markings)', () => {
  // `perspectiveView` is a memory-bound linear pass: it reads the roots by position from the index (stage #2674) instead of hashing each
  // id and reading each annotation, and takes ~0.3 ms at 2,500 markings and ~1.6 ms at 10,000. At 1,250 the cache advantage of n weighs the
  // most and a loaded runner pushed the ratio over 6× (6.2-6.3× in the CI run of PR #1967, with the code untouched; stage #1968), so the case measures at 2,500 and 10,000,
  // where both sizes are larger than the cache. Its center is ~5× (4.8-5.3× idle, pairwise third quartile ~5.3×), the memory effect that `projectIndex` itself shows, not an
  // algorithm. The other cases keep 1,250 and 5,000: they measure from 1.5 ms (accessibilityAudit) to tens of ms at 1,250.
  it.each([0, 1])('builds the perspective %i', GROWTH_OPTIONS, (which) => {
    expectLinearGrowth(`perspectiveView #${which + 1}`, {
      build,
      n: 2500,
      // The index of the new version is already measured in the index case: here only the view.
      prepare: projectIndex,
      run: (p) => {
        const view = perspectiveView(p, p.perspectives[which]!);
        // The view has only the roots of the perspective: half of the markings (root with the group).
        if (view.markings.length === 0)
          throw new Error('the perspective must not be empty');
        return view;
      },
      // Around a millisecond per round: more rounds so the median does not fluctuate.
      runs: 41,
    });
  });
});

describe('container overlap (n = 1,250, 4n = 5,000 containers)', () => {
  // Small containers scattered without overlap, plus one 1,024 times larger placed apart (64 times larger would be about the width of the 5,000-container grid, so the
  // check would stay linear even with the old single grid): a grid with the cell of the largest
  // container would put every small one in one cell and the overlap check would be quadratic (code review of stage #1971).
  const SMALL = 100;
  const template = buildScaleProject().containers[0]!;
  const buildContainers = (n: number): Project => {
    const base = buildScaleProject();
    const cols = Math.ceil(Math.sqrt(n));
    const containers = Array.from({ length: n }, (_, i) => ({
      ...template,
      id: `X${i}`,
      file: `images/x${i}.png`,
      width: SMALL,
      height: SMALL,
      placement: {
        x: (i % cols) * (SMALL * 2),
        y: Math.floor(i / cols) * (SMALL * 2),
        scale: 1,
      },
    }));
    containers.push({
      ...template,
      id: 'XBIG',
      file: 'images/big.png',
      width: SMALL * 1024,
      height: SMALL * 1024,
      placement: { x: -SMALL * 2000, y: 0, scale: 1 },
    });
    return {
      ...base,
      containers,
      markings: [],
      annotations: [],
      arrows: [],
      arrivals: [],
      perspectives: [],
    };
  };

  it('checks that the containers do not overlap', GROWTH_OPTIONS, () => {
    expectLinearGrowth('validateProject (container overlap)', {
      build: buildContainers,
      run: (p) => {
        const issues = validateProject(p);
        if (issues.some((i) => i.code === 'images-overlap'))
          throw new Error('the fixture should have no overlap');
        return issues;
      },
      runs: 41,
    });
  });
});
