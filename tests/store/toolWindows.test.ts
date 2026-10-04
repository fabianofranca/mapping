import { beforeEach, describe, expect, it } from 'vitest';
import {
  RESIZE_STEP,
  WINDOW_LIMITS,
  bottomToolWindow,
  clampWindowSize,
  hideToolWindow,
  isToolWindowOpen,
  openWindowOf,
  resetToolWindowSize,
  resizeToolWindow,
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
  showToolWindow('details');
  hideToolWindow('list');
  resetToolWindowSize('left', SPACE);
  resetToolWindowSize('right', SPACE);
  resetToolWindowSize('bottom', SPACE);
}

beforeEach(reset);

describe('abrir e fechar janelas', () => {
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
    // Camadas (2), Incompletas (5) e Diagnóstico (6) entram nas fases R6 e R7.
    expect(toolWindowByNumber(2)).toBeNull();
    expect(toolWindowByNumber(6)).toBeNull();
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
