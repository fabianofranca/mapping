// Projeto do `npm run perf:canvas`: a mesma receita do cenário "projeto inteiro à vista" dos testes
// (tests/canvas/wholeProjectScenario.ts), mas com containers de fundo sem arquivo, para a app abrir
// a pasta sem imagens. Empacotado pelo esbuild em `scripts/perf/canvas.mjs`.
import { createArrow, serialize, type Project } from '../../src/model';
import { buildLargeProject } from '../../tests/model/largeProject';

const IMAGES = 20;

export function perfProject(size: number): Project {
  const base = buildLargeProject({ images: IMAGES, markingsPerImage: size / IMAGES });
  let project: Project = {
    ...base,
    containers: base.containers.map((c) => ({ ...c, file: null, background: '#FFFFFF' })),
  };
  const roots = project.markings.filter((m) => m.parentId === null);
  for (let i = 0; i < size / 2; i++) {
    const from = roots[i % roots.length];
    const to = roots[(i + 3) % roots.length];
    if (from && to && from.id !== to.id) {
      project = createArrow(project, { id: `R${i}`, from: from.id, to: to.id });
    }
  }
  return project;
}

/** `mapping.json` do projeto, com a revisão 1 que a app espera de um arquivo já gravado. */
export function perfMappingJson(size: number): string {
  return serialize({ ...perfProject(size), revision: 1 });
}
