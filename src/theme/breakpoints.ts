/**
 * Breakpoints do layout, em px. Media queries não aceitam `var()`, então o CSS repete
 * estes números; `tests/theme/breakpoints.test.ts` confere que os dois batem.
 */
export const BREAKPOINTS = {
  /** Maior largura do layout de celular. */
  mobileMax: 899,
  /** Menor largura do layout de desktop. */
  desktop: 900,
  /** Maior largura do desktop "compacto" (botões da barra só com ícone). */
  compact: 1199,
  /** Largura de referência dos mockups de desktop. */
  design: 1440,
  /** Largura de referência dos mockups de celular. */
  mobileDesign: 380,
} as const;

/** Layout de desktop (docs/history/PLAN-etapas-1-2.md, 7.1). */
export const DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.desktop}px)`;
