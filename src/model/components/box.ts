/**
 * Retângulo em pixels (x, y, largura, altura): o único tipo de caixa dos componentes. Fica
 * aqui, sem importar o resto do modelo, para o pacote do visualizador não arrastar `types.ts`.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
