import {
  addAnnotation,
  addImage,
  addLayer,
  createMarking,
  createProject,
  validateProject,
  type Project,
} from '../../src/model';

export const NOW = '2026-09-30T12:00:00.000Z';

export function emptyProject(): Project {
  return createProject({
    name: 'Teste',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Lataria', color: '#E53935' },
  });
}

/**
 * Projeto do exemplo do PLAN.md:
 * I1 (4000×3000) com M1 › M2 › M3; I2 (1000×1000) com M4.
 * Camadas L1 e L2; anotações A1 (M1/L1), A2 (M1/L2), A3 (M2/L1), A4 (M4/L2).
 */
export function sampleProject(): Project {
  let p = emptyProject();
  p = addLayer(p, { id: 'L2', name: 'Vidros', color: '#1E88E5' });
  p = addImage(p, { id: 'I1', file: 'images/lateral.jpg', width: 4000, height: 3000 });
  p = addImage(p, { id: 'I2', file: 'images/frente.jpg', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'M1',
    imageId: 'I1',
    rect: { x: 1000, y: 1000, width: 1000, height: 1000 },
    name: 'Porta',
  });
  p = createMarking(p, {
    id: 'M2',
    imageId: 'I1',
    rect: { x: 1200, y: 1200, width: 400, height: 200 },
    name: 'Maçaneta',
  });
  p = createMarking(p, {
    id: 'M3',
    imageId: 'I1',
    rect: { x: 1300, y: 1250, width: 50, height: 50 },
    name: 'Fechadura',
  });
  p = createMarking(p, {
    id: 'M4',
    imageId: 'I2',
    rect: { x: 0, y: 0, width: 100, height: 100 },
  });
  p = addAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'L1',
    name: 'Amassado',
    entries: [
      { key: 'tipo', value: 'amassado' },
      { key: 'gravidade', value: 'média' },
    ],
  });
  p = addAnnotation(p, {
    id: 'A2',
    markingId: 'M1',
    layerId: 'L2',
    entries: [{ key: 'tipo', value: 'trinca' }],
  });
  p = addAnnotation(p, { id: 'A3', markingId: 'M2', layerId: 'L1' });
  p = addAnnotation(p, { id: 'A4', markingId: 'M4', layerId: 'L2' });
  return p;
}

export function marking(p: Project, id: string) {
  const m = p.markings.find((x) => x.id === id);
  if (!m) throw new Error(`marking ${id} not found`);
  return m;
}

export function image(p: Project, id: string) {
  const i = p.images.find((x) => x.id === id);
  if (!i) throw new Error(`image ${id} not found`);
  return i;
}

/** Garante que a operação produziu um projeto válido. */
export function expectValid(p: Project): Project {
  const issues = validateProject(p);
  if (issues.length > 0)
    throw new Error(`invariants violated: ${JSON.stringify(issues)}`);
  return p;
}
