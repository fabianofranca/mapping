/**
 * Avisos do desenho de uma cena (`renderScene`): cada um leva um código e, se preciso,
 * parâmetros. O texto nunca nasce aqui: quem mostra o aviso o traduz (a app por `t()`, o
 * visualizador pelos rótulos que passa ao `ScreenRenderer`).
 */
export type RenderWarningCode =
  /** Sombra num grupo sem filhos nem forma. */
  | 'empty-group-shadow'
  /** Sombra interna: não existe no canvas 2D. */
  | 'inner-shadow'
  /** Nó que o desenho não conhece (`params.type`): só a caixa. */
  | 'unknown-node'
  /** Imagem sem pixels (sem `src` embutido nem `url`): reservado. */
  | 'image-without-pixels'
  /** Imagem embutida que não pôde ser decodificada. */
  | 'image-decode-failed'
  /** Traço com vários preenchimentos: só o primeiro vale. */
  | 'stroke-extra-paints'
  /** Traço por dentro ou por fora em caminho ou linha: centralizado. */
  | 'stroke-align-centered'
  /** Traço com gradiente radial: a primeira cor. */
  | 'stroke-radial-first-color'
  /** Traço com imagem: cinza. */
  | 'stroke-image-gray';

export interface RenderWarning {
  readonly code: RenderWarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** Todos os códigos (a interface confere que cada um tem texto nos dois idiomas). */
export const RENDER_WARNING_CODES: readonly RenderWarningCode[] = [
  'empty-group-shadow',
  'inner-shadow',
  'unknown-node',
  'image-without-pixels',
  'image-decode-failed',
  'stroke-extra-paints',
  'stroke-align-centered',
  'stroke-radial-first-color',
  'stroke-image-gray',
];
