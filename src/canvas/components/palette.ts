/**
 * Cores e medidas do desenho dos componentes que não vêm da cena. O produto passa os valores dos
 * tokens do tema (`CanvasTokens.component`); `DEFAULT_PALETTE` é o padrão de quem não tem tema
 * (o visualizador embutível, o laboratório e os testes).
 */
export interface RenderPalette {
  /** Preenchimento do reservado de imagem. */
  readonly placeholderFill: string;
  /** Contorno do reservado (X, traço de imagem, slot). */
  readonly placeholderLine: string;
  /** Contorno da caixa de nó que o desenho não conhece (e texto da caixa de tipo ausente). */
  readonly unknownLine: string;
  /** Preenchimento da caixa de tipo ausente (instância sem componente ou de tipo desconhecido). */
  readonly unknownFill: string;
  /** Opacidade do contorno de um `slot`. */
  readonly slotOpacity: number;
  /** Tamanho e família da fonte do texto da caixa de tipo ausente. */
  readonly labelFontSize: number;
  readonly labelFontFamily: string;
}

/** Padrão do laboratório (sem tema próprio). */
export const DEFAULT_PALETTE: RenderPalette = {
  placeholderFill: 'rgba(128, 128, 128, 0.25)',
  placeholderLine: 'rgba(128, 128, 128, 0.8)',
  unknownLine: '#d81b60',
  unknownFill: 'rgba(216, 27, 96, 0.06)',
  slotOpacity: 0.6,
  labelFontSize: 12,
  labelFontFamily: 'system-ui, sans-serif',
};
