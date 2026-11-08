import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import { createViewer, type Viewer } from '../../../viewer';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../viewer/samples/samples';
import { installFakeCanvas } from '../../canvas/harness';
import { GROWTH_OPTIONS, expectLinearGrowth } from '../../support/growth';

// Visualizador no teste de crescimento (#881): carregar e montar a cena, e redesenhá-la, em jsdom com o contexto
// 2D falso (mede a árvore do Konva e o nosso código, não a pintura). A cena é a tela de exemplo repetida, uma
// cópia abaixo da outra, com ids próprios, até chegar a `n` instâncias.
const library = loadLibrary(SAMPLE_FILES);

function tiled(base: Screen, n: number): Screen {
  const per = base.instances.length;
  const copies = Math.ceil(n / per);
  const instances = Array.from({ length: copies }, (_, k) =>
    base.instances.map((i) => ({
      ...i,
      id: `${k}-${i.id}`,
      ...(i.parentId === undefined ? {} : { parentId: `${k}-${i.parentId}` }),
      box: { ...i.box, y: i.box.y + k * base.height },
    })),
  ).flat();
  return { ...base, id: `escala-${n}`, height: base.height * copies, instances };
}

function container(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

interface UpdateState {
  readonly viewer: Viewer;
  readonly screen: Screen;
  next: Screen;
}

const build = (n: number): { screen: Screen } => ({ screen: tiled(SAMPLE_SCREEN, n) });

beforeAll(() => installFakeCanvas());
afterAll(() => {
  document.body.replaceChildren();
});

describe('crescimento do visualizador (n = 1.250, 4n = 5.000 instâncias)', () => {
  it('a cena repetida tem o tamanho pedido e desenha', () => {
    const screen = tiled(SAMPLE_SCREEN, 1250);
    expect(screen.instances.length).toBeGreaterThanOrEqual(1250);
    const viewer = createViewer(container(), {
      library,
      screen: tiled(SAMPLE_SCREEN, 50),
      measure: approximateMeasurer,
    });
    expect(viewer.boxOf('0-i-bar')).toBeDefined();
    viewer.dispose();
  });

  it('carrega e monta a cena', GROWTH_OPTIONS, () => {
    let last: Viewer | null = null;
    expectLinearGrowth('visualizador: createViewer', {
      build,
      // O visualizador da rodada anterior sai fora do tempo.
      prepare: () => {
        last?.dispose();
        last = null;
      },
      run: ({ screen }) => {
        last = createViewer(container(), {
          library,
          screen,
          measure: approximateMeasurer,
        });
      },
      warmup: 2,
      runs: 5,
    });
    (last as Viewer | null)?.dispose();
  });

  it('atualiza uma instância da cena já montada', GROWTH_OPTIONS, () => {
    const viewers: Viewer[] = [];
    let turn = 0;
    expectLinearGrowth('visualizador: update de 1 instância', {
      build: (n) => {
        const { screen } = build(n);
        const viewer = createViewer(container(), {
          library,
          screen,
          measure: approximateMeasurer,
        });
        viewers.push(viewer);
        return { viewer, screen, next: screen } as UpdateState;
      },
      // A tela nova (um valor de texto de uma instância) é montada fora do tempo; a medida é o `update`.
      prepare: (state) => {
        turn += 1;
        const instances = state.screen.instances.map((i) =>
          i.id === '0-i-bar'
            ? { ...i, values: { ...i.values, title: `Entrar ${turn}` } }
            : i,
        );
        state.next = { ...state.screen, instances };
      },
      run: (state) => state.viewer.update({ screen: state.next }),
      warmup: 5,
      runs: 31,
    });
    for (const viewer of viewers) viewer.dispose();
  });
});
