import { beforeEach, describe, expect, it } from 'vitest';
import {
  RESIZE_STEP,
  WINDOW_LIMITS,
  bottomToolWindow,
  clampLayersHeight,
  clampWindowSize,
  hideToolWindow,
  isToolWindowOpen,
  layersWindowHeight,
  openWindowOf,
  openWindowsOf,
  resetLayersWindowHeight,
  resetToolWindowSize,
  resizeLayersWindow,
  resizeToolWindow,
  REVIEW_BOTTOM_DEFAULT,
  setReviewLayout,
  showToolWindow,
  sideWidth,
  toggleToolWindow,
  toolWindowByNumber,
  toolWindowSizes,
} from '../../src/store/toolWindows';

// Estado das janelas de ferramenta (R4, B1 e B2). Os signals são de módulo (como em
// `store/settings`), então cada teste parte de um estado conhecido.

const SPACE = { width: 1400, height: 800, otherWidth: 0 };

function reset(): void {
  showToolWindow('tree');
  showToolWindow('layers');
  showToolWindow('details');
  resetLayersWindowHeight(800);
  hideToolWindow('list');
  resetToolWindowSize('left', SPACE);
  resetToolWindowSize('right', SPACE);
  resetToolWindowSize('bottom', SPACE);
}

beforeEach(reset);

describe('abrir e fechar janelas', () => {
  it('a esquerda empilha Árvore e Camadas; os outros lados mostram uma só', () => {
    expect(openWindowsOf('left')).toEqual(['tree', 'layers']);
    hideToolWindow('tree');
    expect(openWindowsOf('left')).toEqual(['layers']);
    expect(openWindowOf('left')).toBe('layers');
    // Esconder uma não esconde a outra, e voltar mantém a ordem.
    showToolWindow('tree');
    expect(openWindowsOf('left')).toEqual(['tree', 'layers']);
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('cada lado mostra a janela aberta', () => {
    expect(openWindowOf('left')).toBe('tree');
    expect(openWindowOf('right')).toBe('details');
    expect(openWindowOf('bottom')).toBeNull();
  });

  it('o clique na faixa abre e esconde', () => {
    toggleToolWindow('list');
    expect(isToolWindowOpen('list')).toBe(true);
    expect(bottomToolWindow.value).toBe('list');
    toggleToolWindow('list');
    expect(isToolWindowOpen('list')).toBe(false);
    expect(openWindowOf('bottom')).toBeNull();
  });

  it('esconder Detalhes zera a largura da direita', () => {
    expect(sideWidth('right')).toBe(WINDOW_LIMITS.right.default);
    hideToolWindow('details');
    expect(sideWidth('right')).toBe(0);
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('o número do atalho só vale para as janelas que existem', () => {
    expect(toolWindowByNumber(1)).toBe('tree');
    expect(toolWindowByNumber(3)).toBe('details');
    expect(toolWindowByNumber(4)).toBe('list');
    expect(toolWindowByNumber(2)).toBe('layers');
    expect(toolWindowByNumber(5)).toBe('incomplete');
    expect(toolWindowByNumber(6)).toBe('diagnostics');
  });

  it('a janela inferior mostra uma aba por vez', () => {
    showToolWindow('list');
    showToolWindow('incomplete');
    expect(openWindowOf('bottom')).toBe('incomplete');
    expect(isToolWindowOpen('list')).toBe(false);
    showToolWindow('diagnostics');
    expect(bottomToolWindow.value).toBe('diagnostics');
    expect(isToolWindowOpen('incomplete')).toBe(false);
    hideToolWindow('diagnostics');
    expect(openWindowOf('bottom')).toBeNull();
  });
});

describe('tamanhos', () => {
  it('respeita os limites do lado', () => {
    expect(clampWindowSize('left', 100, SPACE)).toBe(WINDOW_LIMITS.left.min);
    expect(clampWindowSize('left', 999, SPACE)).toBe(480);
    expect(clampWindowSize('right', 999, SPACE)).toBe(560);
    expect(clampWindowSize('right', 300, SPACE)).toBe(300);
  });

  it('não deixa o canvas abaixo de 320px', () => {
    const tight = { width: 900, height: 800, otherWidth: 360 };
    // 900 − 360 (Detalhes) − 320 (canvas) = 220 para a esquerda.
    expect(clampWindowSize('left', 480, tight)).toBe(220);
    // Sem espaço nenhum, vale o mínimo do lado.
    expect(clampWindowSize('left', 480, { ...tight, width: 400 })).toBe(
      WINDOW_LIMITS.left.min,
    );
  });

  it('a janela inferior vai até 60% da altura', () => {
    expect(clampWindowSize('bottom', 999, SPACE)).toBe(480);
    expect(clampWindowSize('bottom', 50, SPACE)).toBe(WINDOW_LIMITS.bottom.min);
  });

  it('redimensionar grava o tamanho limitado e o padrão volta', () => {
    resizeToolWindow('left', WINDOW_LIMITS.left.default + RESIZE_STEP, SPACE);
    expect(toolWindowSizes.value.left).toBe(WINDOW_LIMITS.left.default + RESIZE_STEP);
    resizeToolWindow('left', 10_000, SPACE);
    expect(toolWindowSizes.value.left).toBe(480);
    resetToolWindowSize('left', SPACE);
    expect(toolWindowSizes.value.left).toBe(WINDOW_LIMITS.left.default);
  });
});

describe('divisória entre Árvore e Camadas', () => {
  it('nenhuma das duas janelas fica abaixo do mínimo', () => {
    expect(clampLayersHeight(10, 800)).toBe(96);
    expect(clampLayersHeight(900, 800)).toBe(704);
    expect(clampLayersHeight(300, 800)).toBe(300);
    // Coluna menor que as duas alturas mínimas: vale o mínimo.
    expect(clampLayersHeight(300, 150)).toBe(96);
  });

  it('redimensiona, limita e volta ao padrão', () => {
    const initial = layersWindowHeight.value;
    resizeLayersWindow(initial + RESIZE_STEP, 800);
    expect(layersWindowHeight.value).toBe(initial + RESIZE_STEP);
    resizeLayersWindow(10_000, 800);
    expect(layersWindowHeight.value).toBe(704);
    resetLayersWindowHeight(800);
    expect(layersWindowHeight.value).toBe(initial);
  });
});

describe('janela inferior em modo revisão (size-tw-bottom-review)', () => {
  it('Propostas é a 7ª janela, na faixa inferior', () => {
    expect(toolWindowByNumber(7)).toBe('proposals');
    showToolWindow('proposals');
    expect(bottomToolWindow.value).toBe('proposals');
    hideToolWindow('proposals');
  });

  it('começa maior na revisão e guarda a altura de cada modo à parte', () => {
    const normal = toolWindowSizes.value.bottom;
    setReviewLayout(true);
    expect(toolWindowSizes.value.bottom).toBe(REVIEW_BOTTOM_DEFAULT);
    expect(REVIEW_BOTTOM_DEFAULT).toBe(344);
    resizeToolWindow('bottom', 300, SPACE);
    expect(toolWindowSizes.value.bottom).toBe(300);
    setReviewLayout(false);
    expect(toolWindowSizes.value.bottom).toBe(normal);
    setReviewLayout(true);
    expect(toolWindowSizes.value.bottom).toBe(300);
    // Duplo clique na divisória volta ao padrão do modo.
    resetToolWindowSize('bottom', SPACE);
    expect(toolWindowSizes.value.bottom).toBe(REVIEW_BOTTOM_DEFAULT);
    setReviewLayout(false);
  });
});
