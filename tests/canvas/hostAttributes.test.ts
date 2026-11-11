import { describe, expect, it } from 'vitest';
import { arrowHandles, arrowShape } from '../../src/canvas/arrowGeometry';
import {
  formatArrowHandles,
  formatContainerBoxes,
  formatSelection,
} from '../../src/canvas/hostAttributes';
import { setArrowRoute, setArrowStyle, type Placement } from '../../src/model';
import { resolveSelection } from '../../src/store/ui';
import { arrowProject } from '../model/arrowFixtures';

// Texto dos atributos de teste do `.canvas-host` (etapa #1076): `data-selection`,
// `data-arrow-handles` e `data-container-boxes`. Funções puras, sem Konva.

const view = { x: 10, y: 20, scale: 0.5 };
const r2 = (n: number) => String(Math.round(n * 100) / 100);

function shapeOf(project = arrowProject()) {
  const arrow = project.arrows.find((a) => a.id === 'r1');
  const shape = arrow && arrowShape(project, arrow);
  if (!shape) throw new Error('forma');
  return shape;
}

describe('formatSelection', () => {
  const project = arrowProject();

  it('"<tipo> <id>" de cada tipo de seleção', () => {
    expect(formatSelection(project, { kind: 'marking', id: 'a1' })).toBe('marking a1');
    expect(formatSelection(project, { kind: 'image', id: 'B' })).toBe('image B');
    expect(formatSelection(project, { kind: 'arrow', id: 'r1' })).toBe('arrow r1');
  });

  it('null sem seleção e com item fora do projeto', () => {
    expect(formatSelection(project, null)).toBeNull();
    expect(formatSelection(null, { kind: 'marking', id: 'a1' })).toBeNull();
    expect(formatSelection(project, { kind: 'marking', id: 'nao-existe' })).toBeNull();
    expect(formatSelection(project, { kind: 'arrow', id: 'nao-existe' })).toBeNull();
    expect(resolveSelection(project, { kind: 'image', id: 'nao-existe' })).toBeNull();
    expect(formatSelection(project, { kind: 'image', id: 'nao-existe' })).toBeNull();
  });
});

describe('formatArrowHandles', () => {
  it('curve com um ponto de passagem: center, from, to, point0, mid0 e mid1', () => {
    const project = setArrowStyle(
      setArrowRoute(arrowProject(), 'r1', [{ x: 400, y: 800 }]),
      'r1',
      'curve',
    );
    const shape = shapeOf(project);
    const handles = arrowHandles(shape, view.scale);
    const text = formatArrowHandles(shape, view);
    const names = text.split(';').map((entry) => entry.split(' ')[0]);
    expect(names).toEqual(['center', 'from', 'to', 'point0', 'mid0', 'mid1']);
    const at = (p: { x: number; y: number }) =>
      `${r2(p.x * view.scale + view.x)} ${r2(p.y * view.scale + view.y)}`;
    const entries = text.split(';');
    expect(entries[0]).toBe(`center ${at(shape.label)}`);
    expect(entries[1]).toBe(`from ${at(handles[0]!.at)}`);
    expect(entries[2]).toBe(`to ${at(handles[1]!.at)}`);
    expect(entries[3]).toBe(`point0 ${at({ x: 400, y: 800 })}`);
    expect(entries[4]).toBe(`mid0 ${at(handles[3]!.at)}`);
    expect(entries[5]).toBe(`mid1 ${at(handles[4]!.at)}`);
  });

  it('elbow: center, from, to e segment<i>', () => {
    const shape = shapeOf(setArrowStyle(arrowProject(), 'r1', 'elbow'));
    const text = formatArrowHandles(shape, { x: 0, y: 0, scale: 1 });
    const names = text.split(';').map((entry) => entry.split(' ')[0]);
    expect(names).toEqual(['center', 'from', 'to', 'segment0']);
    const segment = arrowHandles(shape, 1).find((h) => h.kind === 'segment');
    expect(text.split(';')[3]).toBe(`segment0 ${r2(segment!.at.x)} ${r2(segment!.at.y)}`);
  });

  it('as alças dependem da escala (meios curtos somem)', () => {
    const shape = shapeOf();
    const near = formatArrowHandles(shape, { x: 0, y: 0, scale: 1 });
    const far = formatArrowHandles(shape, { x: 0, y: 0, scale: 0.001 });
    expect(far.split(';').length).toBeLessThan(near.split(';').length);
  });
});

describe('formatContainerBoxes', () => {
  const project = arrowProject();
  const placements = new Map<string, Placement>([
    ['A', { x: 0, y: 0, scale: 1 }],
    ['B', { x: 2000, y: 0, scale: 2 }],
  ]);

  it('uma entrada por container colocado, na ordem do projeto', () => {
    const text = formatContainerBoxes(project.containers, placements);
    expect(text).toBe('A 0 0 1000 1000 1;B 2000 0 1000 1000 2');
  });

  it('container sem colocação fica de fora; nenhum colocado dá null', () => {
    const only = new Map([['B', { x: 2000, y: 0, scale: 2 }]]);
    expect(formatContainerBoxes(project.containers, only)).toBe('B 2000 0 1000 1000 2');
    expect(formatContainerBoxes(project.containers, new Map())).toBeNull();
  });
});
