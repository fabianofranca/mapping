import {
  createProject,
  type Annotation,
  type Marking,
  type Project,
  type ProjectImage,
} from '../../src/model';

interface LargeProjectOptions {
  readonly images?: number;
  readonly markingsPerImage?: number;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
}

/**
 * Projeto grande e válido para testes de desempenho (PLAN.md, fase 7): 20 imagens e
 * 500 marcações por padrão. Cada imagem tem `markingsPerImage / 5` grupos de 1 marcação
 * com 4 filhas (hierarquia de 2 níveis), e as marcações têm anotações em 2 camadas.
 */
export function buildLargeProject(options: LargeProjectOptions = {}): Project {
  const {
    images = 20,
    markingsPerImage = 25,
    imageWidth = 4000,
    imageHeight = 3000,
  } = options;
  const base = createProject({
    name: 'Grande',
    now: '2026-09-30T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Lataria', color: '#E53935' },
  });
  const cols = 5;
  const scale = 1000 / Math.max(imageWidth, imageHeight);
  const cell = 1000 + 50;
  const groups = Math.floor(markingsPerImage / 5);

  const imageList: ProjectImage[] = [];
  const markings: Marking[] = [];
  const annotations: Annotation[] = [];
  for (let i = 0; i < images; i++) {
    const imageId = `I${i}`;
    imageList.push({
      id: imageId,
      name: null,
      file: `images/foto-${i}.jpg`,
      width: imageWidth,
      height: imageHeight,
      placement: { x: (i % cols) * cell, y: Math.floor(i / cols) * cell, scale },
    });
    const groupWidth = Math.floor(imageWidth / groups);
    for (let g = 0; g < groups; g++) {
      const parent = {
        x: g * groupWidth + 20,
        y: Math.floor(imageHeight * 0.1),
        width: groupWidth - 40,
        height: Math.floor(imageHeight * 0.8),
      };
      const parentId = `M${i}-${g}`;
      markings.push({
        id: parentId,
        imageId,
        parentId: null,
        name: `Marcação ${i}-${g}`,
        rect: parent,
        needsReview: false,
      });
      for (let c = 0; c < 4; c++) {
        markings.push({
          id: `${parentId}-${c}`,
          imageId,
          parentId,
          name: null,
          rect: {
            x: parent.x + 10 + (c % 2) * Math.floor(parent.width / 2),
            y: parent.y + 10 + Math.floor(c / 2) * Math.floor(parent.height / 2),
            width: Math.floor(parent.width / 2) - 20,
            height: Math.floor(parent.height / 2) - 20,
          },
          needsReview: false,
        });
      }
    }
  }
  markings.forEach((marking, index) => {
    for (const layerId of index % 2 === 0 ? ['L1', 'L2'] : ['L1']) {
      annotations.push({
        id: `A${index}-${layerId}`,
        markingId: marking.id,
        layerId,
        name: `Anotação ${index}`,
        inherit: false,
        parentAnnotationId: null,
        entries: [
          { key: 'tipo', value: 'amassado' },
          { key: 'gravidade', value: 'média' },
          { key: 'obs', value: `item ${index}` },
        ],
      });
    }
  });
  return {
    ...base,
    layers: [...base.layers, { id: 'L2', name: 'Vidros', color: '#1E88E5' }],
    images: imageList,
    markings,
    annotations,
  };
}
