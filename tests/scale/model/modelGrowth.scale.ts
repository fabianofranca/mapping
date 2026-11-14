import { describe, expect, it } from 'vitest';
import {
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

  it.each([0, 1])('builds the perspective %i', GROWTH_OPTIONS, (which) => {
    expectLinearGrowth(`perspectiveView #${which + 1}`, {
      build,
      // The index of the new version is already measured in the case above: here only the view.
      prepare: projectIndex,
      run: (p) => {
        const view = perspectiveView(p, p.perspectives[which]!);
        // The view has only the roots of the perspective: half of the markings (root with the group).
        if (view.markings.length === 0)
          throw new Error('the perspective must not be empty');
        return view;
      },
    });
  });
});
