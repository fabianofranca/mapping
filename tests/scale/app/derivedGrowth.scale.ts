import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../src/model';
import { createEditorDerived } from '../../../src/store/derived';
import { createHarness } from '../../components/harness';
import { buildScaleProject } from '../../model/scaleProject';
import { GROWTH_OPTIONS, expectLinearGrowth } from '../../support/growth';

// Estado derivado do editor no teste de crescimento (#881): uma atualização do projeto à vista (versão nova) e
// a leitura de tudo que o canvas, o painel e a lista leem.
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

describe('crescimento do estado derivado (n = 1.250, 4n = 5.000 marcações)', () => {
  it('lê tudo uma vez e confere que há o que medir', () => {
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
    'recalcula camadas visíveis, indicadores, visibilidade, pendências e lista numa versão nova',
    GROWTH_OPTIONS,
    () => {
      expectLinearGrowth('estado derivado do editor', {
        build: (n) => {
          const state = setup(n);
          readAll(state);
          return state;
        },
        // `run` recebe uma cópia rasa: `shown` e `derived` são os mesmos, a versão nova é do projeto.
        run: (state) => {
          state.shown.value = { ...state.project };
          return readAll(state);
        },
      });
    },
  );
});
