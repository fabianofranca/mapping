/**
 * Breakpoints do layout, em px. Media queries não aceitam `var()`, então o CSS repete
 * estes números; `tests/theme/tokenLiterals.test.ts` confere que os dois batem.
 */
export const BREAKPOINTS = {
  /** Menor largura da app (só desktop): abaixo dela, o aviso "Abra numa janela maior". */
  appMin: 900,
  /**
   * Menor altura da app (só desktop): 720 px, a janela baixa de um notebook. A revisão se adapta a ela
   * (filtros recolhidos num popover, legenda das marcas por cima da Propostas e do minimapa; #598).
   */
  appMinHeight: 720,
  /** Maior largura do desktop "compacto" (botões da barra só com ícone). */
  compact: 1199,
  /** Largura de referência dos mockups de desktop. */
  design: 1440,
} as const;

/** Janela abaixo da largura ou da altura mínima da app. */
export const NARROW_QUERY = `(max-width: ${BREAKPOINTS.appMin - 1}px), (max-height: ${BREAKPOINTS.appMinHeight - 1}px)`;
