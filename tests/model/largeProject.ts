import {
  createProject,
  type Annotation,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../../src/model';

interface LargeProjectOptions {
  readonly images?: number;
  readonly markingsPerImage?: number;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
}

/**
 * Large, valid project for performance tests (docs/ARCHITECTURE.md, "Performance"): 20 images and
 * 500 markings by default. Each image has `markingsPerImage / 5` groups of 1 marking
 * with 4 children (2-level hierarchy), and the markings have annotations in 2 layers.
 */
export function buildLargeProject(options: LargeProjectOptions = {}): Project {
  const {
    images = 20,
    markingsPerImage = 25,
    imageWidth = 4000,
    imageHeight = 3000,
  } = options;
  const base = createProject({
    name: 'Large',
    now: '2026-09-30T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Bodywork', color: '#E53935' },
  });
  const cols = 5;
  const scale = 1000 / Math.max(imageWidth, imageHeight);
  const cell = 1000 + 50;
  const groups = Math.floor(markingsPerImage / 5);

  const imageList: ProjectContainer[] = [];
  const markings: Marking[] = [];
  const annotations: Annotation[] = [];
  for (let i = 0; i < images; i++) {
    const containerId = `I${i}`;
    imageList.push({
      id: containerId,
      name: null,
      parentId: null,
      markingColor: null,
      locked: false,
      source: null,
      file: `images/photo-${i}.jpg`,
      background: null,
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
        containerId: containerId,
        parentId: null,
        name: `Marking ${i}-${g}`,
        rect: parent,
        needsReview: false,
        locked: false,
        floating: false,
        source: null,
      });
      for (let c = 0; c < 4; c++) {
        markings.push({
          id: `${parentId}-${c}`,
          containerId: containerId,
          parentId,
          name: null,
          rect: {
            x: parent.x + 10 + (c % 2) * Math.floor(parent.width / 2),
            y: parent.y + 10 + Math.floor(c / 2) * Math.floor(parent.height / 2),
            width: Math.floor(parent.width / 2) - 20,
            height: Math.floor(parent.height / 2) - 20,
          },
          needsReview: false,
          locked: false,
          floating: false,
          source: null,
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
        name: `Annotation ${index}`,
        parentAnnotationId: null,
        parentRole: null,
        type: null,
        values: null,
        entries: [
          { id: `A${index}-${layerId}-e1`, key: 'kind', value: 'dented' },
          { id: `A${index}-${layerId}-e2`, key: 'severity', value: 'medium' },
          { id: `A${index}-${layerId}-e3`, key: 'notes', value: `item ${index}` },
        ],
      });
    }
  });
  return {
    ...base,
    layers: [...base.layers, { id: 'L2', name: 'Glass', color: '#1E88E5', spec: null }],
    containers: imageList,
    markings,
    annotations,
  };
}
