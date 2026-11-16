import {
  addContainer,
  addPerspective,
  createMarking,
  createPage,
  type Project,
} from '../../src/model';
import { sampleProject } from '../model/fixtures';

// Shared world of the pages store tests (stage #883, PG2).
//
//   PG1 "Page 1": I1 (4000×3000) › M1 › M2 › M3 and I2 (1000×1000) › M4 (the model's sample project)
//   PG2 "Page 2": I3 (1000×1000 at the origin) › M5 and the canvas marking K (5000,5000 400×400)
//   PG3 "Page 3": empty
//
// The perspective V shows I1 (PG1) and I3 (PG2): one root on each page; the perspective W only I2.

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

export function pagesProject(): Project {
  let p = sampleProject();
  p = createPage(p, { id: 'PG2', name: 'Page 2' });
  p = createPage(p, { id: 'PG3', name: 'Page 3' });
  p = addContainer(p, {
    id: 'I3',
    file: 'images/back.jpg',
    width: 1000,
    height: 1000,
    pageId: 'PG2',
  });
  p = createMarking(p, { id: 'M5', containerId: 'I3', rect: rect(0, 0, 100, 100) });
  p = createMarking(p, {
    id: 'K',
    containerId: null,
    rect: rect(5000, 5000, 400, 400),
    pageId: 'PG2',
  });
  p = addPerspective(p, {
    id: 'V',
    name: 'View',
    hiddenLayers: [],
    items: [
      { root: 'I1', x: 0, y: 0 },
      { root: 'I3', x: 0, y: 0 },
    ],
  });
  p = addPerspective(p, {
    id: 'W',
    name: 'Only I2',
    hiddenLayers: [],
    items: [{ root: 'I2', x: 10, y: 10 }],
  });
  return p;
}

export const rectOf = rect;
