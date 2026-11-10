import { shapes } from 'konva/lib/Shape';
import { afterAll, describe, it } from 'vitest';
import type { Project } from '../../../src/model';
import {
  openWholeProject,
  wholeProject,
  type WholeProjectScenario,
} from '../../canvas/wholeProjectScenario';
import {
  GROWTH_FACTOR,
  GROWTH_N,
  GROWTH_OPTIONS,
  expectLinearGrowth,
} from '../../support/growth';

// Crescimento do canvas (etapa canvas-desempenho, CD1): o quadro de pan, o de zoom e o primeiro quadro em
// Enquadrar tudo com n = 1.250 e 4n = 5.000 marcações (50 por container, ou seja, 25 e 100 containers; setas na
// metade), em jsdom com o contexto 2D falso: mede a árvore do Konva e o nosso código, não a pintura. Razão < 6×
// (`expectLinearGrowth`); passar disso é defeito da etapa, não um teto a subir.
const PER_IMAGE = 50;

/** Projetos montados uma vez por tamanho: montar não é o que se mede e leva segundos nos 5.000. */
const projects = new Map<number, Project>();
function projectOf(n: number): Project {
  let project = projects.get(n);
  if (!project) {
    project = wholeProject(n, { perImage: PER_IMAGE });
    projects.set(n, project);
  }
  return project;
}

const open = (n: number): WholeProjectScenario =>
  openWholeProject(n, 'fit', { project: projectOf(n) });

const opened: WholeProjectScenario[] = [];
afterAll(() => {
  for (const scenario of opened.splice(0)) scenario.destroy();
});

interface FrameState {
  readonly scenario: WholeProjectScenario;
  readonly turn: { n: number };
}

/** Um cenário aberto por tamanho; `prepare` agenda a mudança de vista e `run` desenha o quadro. */
function frameCase(label: string, act: (s: WholeProjectScenario, turn: number) => void) {
  const build = (n: number): FrameState => {
    const scenario = open(n);
    opened.push(scenario);
    return { scenario, turn: { n: 0 } };
  };
  expectLinearGrowth(label, {
    build,
    prepare: (state) => act(state.scenario, state.turn.n++),
    run: (state) => state.scenario.flush(),
    warmup: 5,
    runs: 15,
  });
  // Cada caso devolve os cenários, que ocupam muita memória.
  for (const scenario of opened.splice(0)) scenario.destroy();
}

describe(`crescimento do canvas (n = ${GROWTH_N}, ${GROWTH_FACTOR}n = ${GROWTH_N * GROWTH_FACTOR} marcações)`, () => {
  it('o cenário tem os containers e as setas do tamanho pedido', () => {
    const small = projectOf(GROWTH_N);
    const large = projectOf(GROWTH_N * GROWTH_FACTOR);
    if (small.containers.length !== 25 || large.containers.length !== 100) {
      throw new Error(
        `fixture: ${small.containers.length} e ${large.containers.length} containers`,
      );
    }
    if (small.arrows.length === 0 || large.arrows.length === 0)
      throw new Error('fixture: sem setas');
  });

  it('quadro de pan', GROWTH_OPTIONS, () => {
    frameCase('canvas: quadro de pan', (s, turn) =>
      s.controller.centerOnPoint({ x: 500 + (turn % 2) * 300, y: 500 }),
    );
  });

  it('quadro de zoom', GROWTH_OPTIONS, () => {
    frameCase('canvas: quadro de zoom', (s, turn) =>
      s.controller.zoomBy(turn % 2 === 0 ? 1.1 : 1 / 1.1),
    );
  });

  it('primeiro quadro em Enquadrar tudo', GROWTH_OPTIONS, () => {
    let last: WholeProjectScenario | null = null;
    expectLinearGrowth('canvas: primeiro quadro em Enquadrar tudo', {
      build: (n) => ({ n }),
      // O cenário da rodada anterior sai fora do tempo.
      prepare: () => {
        last?.destroy();
        last = null;
        // `CanvasController.destroy` deixa formas no registro de cores de acerto do Konva (cerca de cinco por
        // marcação a cada abertura). Sem esvaziá-lo, a sexta abertura de 5.000 marcações leva ~90 s só procurando
        // uma cor livre. Aqui nenhum outro cenário está vivo, então o registro pode ser esvaziado.
        for (const key of Object.keys(shapes)) delete shapes[key];
      },
      // Mede abrir o cenário (store, derivados, controller) e o primeiro quadro, sobre o projeto já montado.
      run: ({ n }) => {
        last = open(n);
      },
      warmup: 2,
      runs: 7,
    });
    (last as WholeProjectScenario | null)?.destroy();
  });
});
