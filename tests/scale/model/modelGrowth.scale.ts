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

// Casos do modelo do teste de crescimento (#881): a mesma operação com 1.250 e 5.000 marcações, razão < 5×.
// O fixture é assentado uma vez; cada rodada mede uma versão nova do projeto (`{ ...p }`).
const build = (markings: number): Project => buildScaleProject({ markings });

describe('crescimento do modelo (n = 1.250, 4n = 5.000 marcações)', () => {
  it('valida os invariantes', GROWTH_OPTIONS, () => {
    expectLinearGrowth('validateProject', {
      build,
      run: (p) => {
        const issues = validateProject(p);
        if (issues.length > 0) throw new Error('o fixture deveria ser válido');
        return issues;
      },
    });
  });

  it('serializa e lê de volta sem perdas', GROWTH_OPTIONS, () => {
    const written = serialize(build(1250));
    const read = deserialize(written);
    expect(read.ok && serialize(read.project)).toBe(written);
    expectLinearGrowth('serialize + deserialize', {
      build,
      run: (p) => deserialize(serialize(p)),
    });
  });

  it(
    'monta o índice, as pendências, os indicadores e a visibilidade',
    GROWTH_OPTIONS,
    () => {
      expectLinearGrowth('índice + pendências + indicadores + visibilidade', {
        build,
        run: (p) => {
          projectIndex(p);
          projectIssues(p);
          layerDotsByMarking(p, p.layers);
          const active = layerDotsByMarking(p, p.layers.slice(0, 1));
          return markingVisibility(p, active, 'hide', null);
        },
      });
    },
  );

  it('monta a lista', GROWTH_OPTIONS, () => {
    expectLinearGrowth('buildListing', {
      build,
      run: (p) => {
        const listing = buildListing(p, p.layers, { showEmpty: true });
        if (listing.length === 0) throw new Error('a lista não pode ficar vazia');
        return listing;
      },
    });
  });

  it.each([0, 1])('monta a perspectiva %i', GROWTH_OPTIONS, (which) => {
    expectLinearGrowth(`perspectiveView #${which + 1}`, {
      build,
      // O índice da versão nova já é medido no caso acima: aqui só a vista.
      prepare: projectIndex,
      run: (p) => {
        const view = perspectiveView(p, p.perspectives[which]!);
        // A vista tem só as raízes da perspectiva: metade das marcações (raiz com o grupo).
        if (view.markings.length === 0)
          throw new Error('a perspectiva não pode ficar vazia');
        return view;
      },
    });
  });
});
