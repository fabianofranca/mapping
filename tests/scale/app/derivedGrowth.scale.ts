import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../src/model';
import { createEditorDerived } from '../../../src/store/derived';
import { createHarness } from '../../components/harness';
import { buildScaleProject } from '../../model/scaleProject';
import { GROWTH_OPTIONS, expectLinearGrowth } from '../../support/growth';

// Derived editor state in the growth test (#881): a project update in view (new version) and
// reading everything that the canvas, the panel and the list read.
function setup(markings: number) {
  const project = buildScaleProject({ markings });
  const h = createHarness(project);
  const shown = signal<Project | null>(project);
  const derived = createEditorDerived(h.store, h.ui, shown);
  return { project, shown, derived };
}

type Setup = ReturnType<typeof setup>;

function readAll({ derived }: Setup) {
  return [
    derived.visibleLayers.value,
    derived.issues.value,
    derived.annotationsByMarking.value,
    derived.layerDots.value,
    derived.markingVisibility.value,
    derived.canvasVisibility.value,
    derived.incompleteMarkings.value,
    derived.listing.value,
    derived.incompleteList.value,
    derived.incompleteCount.value,
  ] as const;
}

describe('derived state growth (n = 1,250, 4n = 5,000 markings)', () => {
  it('reads everything once and checks that there is something to measure', () => {
    const [layers, , annotations, dots, visibility, , incomplete, listing, , count] =
      readAll(setup(100));
    expect(layers.length).toBeGreaterThan(0);
    expect(annotations.size).toBeGreaterThan(0);
    expect(dots.size).toBeGreaterThan(0);
    expect(visibility.size).toBeGreaterThan(0);
    expect(listing.length).toBeGreaterThan(0);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(incomplete.size).toBeGreaterThanOrEqual(0);
  });

  it(
    'recomputes visible layers, indicators, visibility, pending items and list on a new version',
    GROWTH_OPTIONS,
    () => {
      expectLinearGrowth('editor derived state', {
        build: (n) => {
          const state = setup(n);
          readAll(state);
          return state;
        },
        // `run` receives a shallow copy: `shown` and `derived` are the same, the new version is the project's.
        run: (state) => {
          state.shown.value = { ...state.project };
          return readAll(state);
        },
      });
    },
  );
});
