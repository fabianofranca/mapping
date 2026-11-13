// Lados e alinhamentos da âncora (v20). Arquivo folha, sem imports: o formato do componente e os tipos do projeto
// o compartilham sem que as declarações do visualizador alcancem o schema (zod).

/** Lado do alvo em que a marcação ancorada fica; `start`/`end` seguem a direção de leitura. */
export const ANCHOR_SIDES = ['top', 'bottom', 'start', 'end'] as const;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];
/** Alinhamento ao longo do lado da âncora. */
export const ANCHOR_ALIGNS = ['start', 'center', 'end'] as const;
export type AnchorAlign = (typeof ANCHOR_ALIGNS)[number];
