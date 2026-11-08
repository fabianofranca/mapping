// Quando as bolinhas de camada e o "+N" aparecem. Função pura, testada em `tests/canvas/renderers/`.

export interface LayerIndicatorInput {
  /** A marcação desenha um componente (o desenho ocupa o lugar do conteúdo da caixa). */
  readonly drawsComponent: boolean;
  /** Selecionada ou sob o mouse: mostra tudo, qualquer que seja o tamanho. */
  readonly emphasized: boolean;
  /** Tamanho da marcação na tela (px). */
  readonly screenWidth: number;
  readonly screenHeight: number;
  /** Limite (px de tela, token `size-indicator-min-marking`) abaixo do qual os indicadores somem. */
  readonly minScreenSize: number;
}

/**
 * As bolinhas de camada e o "+N" aparecem? A marcação que desenha componente os esconde quando,
 * na tela, a largura ou a altura fica abaixo do limite (os indicadores cobririam o desenho); a
 * selecionada ou sob o mouse os mostra sempre, e a marcação sem componente também. O alerta de
 * incompleta não passa por aqui: aparece nos dois tamanhos.
 */
export function showLayerIndicators(input: LayerIndicatorInput): boolean {
  if (!input.drawsComponent || input.emphasized) return true;
  return (
    input.screenWidth >= input.minScreenSize && input.screenHeight >= input.minScreenSize
  );
}
