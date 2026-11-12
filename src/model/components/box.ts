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

/**
 * Interseção de dois recortes (o de um slot com `clip` dentro do de outro); um ausente não
 * recorta. Caixas que não se tocam dão largura ou altura 0 (recorta tudo).
 */
export function intersectClips(a: Box | undefined, b: Box | undefined): Box | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
