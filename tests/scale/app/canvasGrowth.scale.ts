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

// Canvas growth (stage canvas-desempenho, CD1): the pan frame, the zoom frame and the first frame in
// Fit all with n = 1,250 and 4n = 5,000 markings (50 per container, i.e. 25 and 100 containers; arrows on
// half), in jsdom with the fake 2D context: it measures the Konva tree and our code, not the painting. Ratio < 6×
// (`expectLinearGrowth`); going over that is a defect of the stage, not a ceiling to raise.
const PER_IMAGE = 50;

/** Projects built once per size: building is not what is measured and takes seconds at 5,000. */
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

/** One open scenario per size; `prepare` schedules the view change and `run` draws the frame. */
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
  // Each case returns the scenarios, which take up a lot of memory.
  for (const scenario of opened.splice(0)) scenario.destroy();
}

describe(`canvas growth (n = ${GROWTH_N}, ${GROWTH_FACTOR}n = ${GROWTH_N * GROWTH_FACTOR} markings)`, () => {
  it('the scenario has the containers and arrows of the requested size', () => {
    const small = projectOf(GROWTH_N);
    const large = projectOf(GROWTH_N * GROWTH_FACTOR);
    if (small.containers.length !== 25 || large.containers.length !== 100) {
      throw new Error(
        `fixture: ${small.containers.length} and ${large.containers.length} containers`,
      );
    }
    if (small.arrows.length === 0 || large.arrows.length === 0)
      throw new Error('fixture: no arrows');
  });

  it('pan frame', GROWTH_OPTIONS, () => {
    frameCase('canvas: pan frame', (s, turn) =>
      s.controller.centerOnPoint({ x: 500 + (turn % 2) * 300, y: 500 }),
    );
  });

  it('zoom frame', GROWTH_OPTIONS, () => {
    frameCase('canvas: zoom frame', (s, turn) =>
      s.controller.zoomBy(turn % 2 === 0 ? 1.1 : 1 / 1.1),
    );
  });

  it('first frame in Fit all', GROWTH_OPTIONS, () => {
    let last: WholeProjectScenario | null = null;
    expectLinearGrowth('canvas: first frame in Fit all', {
      build: (n) => ({ n }),
      // The scenario of the previous round is dropped outside the measured time.
      prepare: () => {
        last?.destroy();
        last = null;
        // `CanvasController.destroy` leaves shapes in Konva's hit-color registry (about five per
        // marking on each opening). Without emptying it, the sixth opening of 5,000 markings takes ~90 s just looking for
        // a free color. Here no other scenario is alive, so the registry can be emptied.
        for (const key of Object.keys(shapes)) delete shapes[key];
      },
      // Measures opening the scenario (store, derived state, controller) and the first frame, over the already built project.
      run: ({ n }) => {
        last = open(n);
      },
      warmup: 2,
      runs: 7,
    });
    (last as WholeProjectScenario | null)?.destroy();
  });
});
