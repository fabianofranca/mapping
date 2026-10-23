import {
  addAnnotation,
  addLayer,
  createArrow,
  createMarking,
  setAnnotationParent,
  type Arrow,
  type Project,
} from '../../src/model';
import { multiProject } from './multiSelectionFixtures';

// Projeto das setas (ME4): o `multiProject` (ver tests/model/multiSelectionFixtures.ts) com uma
// marcação `b2` no container B e a seta `r1` de a1 para a3 (as duas no container A), com duas
// anotações livres nela: `ra1` (camada L1) e `ra2` (camada L2, vinculada à `ra1`).
//
//   Canvas (unidades do canvas)         container → retângulo no canvas
//   A  (0,0) 1000×1000, escala 1        a1 (100,100,300,300)  a2 (150,150,100,100)
//   B  (2000,0) 500×500, escala 2       a3 (600,600,200,200)
//   C  (4000,0) 1000×1000               b1 (2100,100,200,200)  b2 (2600,600,200,200)
//   H  (400,1300,200,100) no canvas     c1 (4900,900,100,100)
//   N  (100,1300,200,100) flutuante     e1 (9050,50,100,100)

/** `multiProject` com a marcação `b2` (300,300,100,100 em B), no canvas (2600,600,200,200). */
export function arrowBase(): Project {
  return createMarking(multiProject(), {
    id: 'b2',
    containerId: 'B',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
}

/** A seta `id` entre `from` e `to` (sem pontos), criada pela operação do modelo. */
export function withArrow(
  p: Project,
  id: string,
  from: string,
  to: string,
  extra: Partial<Omit<Arrow, 'id' | 'from' | 'to'>> = {},
): Project {
  const { points, locked, ...args } = extra;
  void points;
  void locked;
  const next = createArrow(p, { id, from, to, ...args });
  const arrow = next.arrows.find((a) => a.id === id);
  if (!arrow) throw new Error('seta não criada');
  return {
    ...next,
    arrows: next.arrows.map((a) =>
      a.id === id
        ? { ...a, points: extra.points ?? [], locked: extra.locked ?? false }
        : a,
    ),
  };
}

export function arrowProject(): Project {
  let p = withArrow(arrowBase(), 'r1', 'a1', 'a3');
  p = addLayer(p, { id: 'L2', name: 'Eventos', color: '#1E88E5' });
  p = addAnnotation(p, { id: 'ra1', markingId: 'r1', layerId: 'L1', name: 'Rota' });
  p = addAnnotation(p, { id: 'ra2', markingId: 'r1', layerId: 'L2', name: 'Evento' });
  return setAnnotationParent(p, 'ra2', 'ra1');
}
