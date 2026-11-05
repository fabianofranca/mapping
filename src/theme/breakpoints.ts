/**
 * Breakpoints do layout, em px. Media queries não aceitam `var()`, então o CSS repete
 * estes números; `tests/theme/tokenLiterals.test.ts` confere que os dois batem.
 */
export const BREAKPOINTS = {
  /** Menor largura da app (só desktop): abaixo dela, o aviso "Abra numa janela maior". */
  appMin: 900,
  /**
   * Menor altura da app (só desktop): a legenda das marcas da revisão só cabe inteira com
   * o canvas de pelo menos 360 px, que a 900 px de largura pede janela de ~842 px (#552).
   */
  appMinHeight: 850,
  /** Maior largura do desktop "compacto" (botões da barra só com ícone). */
  compact: 1199,
  /** Largura de referência dos mockups de desktop. */
  design: 1440,
} as const;

/** Janela abaixo da largura ou da altura mínima da app. */
export const NARROW_QUERY = `(max-width: ${BREAKPOINTS.appMin - 1}px), (max-height: ${BREAKPOINTS.appMinHeight - 1}px)`;
