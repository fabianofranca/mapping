// Textos que o visualizador entrega junto com o desenho: a caixa de tipo ausente e os avisos.
// O `ScreenRenderer` não tem texto próprio; o visualizador passa os dele (sem o `t()` da app).
import type { ScreenRendererLabels } from '../src/canvas/components/screenRenderer';
import type { RenderWarning } from '../src/canvas/components/renderWarnings';

function drawWarning({ code, params }: RenderWarning): string {
  switch (code) {
    case 'empty-group-shadow':
      return 'sombra num grupo vazio foi ignorada';
    case 'inner-shadow':
      return 'sombra interna não existe no canvas 2D: ignorada';
    case 'extra-shadows':
      return 'só a primeira sombra externa de cada nó foi desenhada';
    case 'unknown-node':
      return `nó não desenhado (${params?.type ?? ''}): só a caixa`;
    case 'image-without-pixels':
      return 'imagem sem pixels desenhada como reservado';
    case 'image-decode-failed':
      return 'uma imagem embutida não pôde ser decodificada';
    case 'stroke-extra-paints':
      return 'só o primeiro preenchimento do traço foi usado';
    case 'stroke-align-centered':
      return 'traço por dentro/por fora em caminho ou linha foi centralizado';
    case 'stroke-radial-first-color':
      return 'traço com gradiente radial desenhado com a primeira cor';
    case 'stroke-image-gray':
      return 'traço com imagem desenhado em cinza';
  }
}

export const VIEWER_LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (typeName) => `${typeName}\n(sem componente)`,
  unknownType: (typeId) => `${typeId}\n(tipo desconhecido)`,
  warningTypeWithoutComponent: 'tipo sem componente na especialização',
  warningUnknownType: 'tipo não existe na especialização',
  drawWarning,
};
