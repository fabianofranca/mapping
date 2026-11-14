import { fail } from './errors';
import { HEX_COLOR_RE } from './hexColor';
import { annotationWithLinked } from './links';
import { pruneHiddenLayers } from './perspectiveReconcile';
import { findById, moveItem, updateById } from './project';
import { countBrokenRefs } from './refs';
import type { Layer, Project } from './types';

/** Color of the first layer of a new project. */
export const DEFAULT_LAYER_COLOR = '#D32F2F';

/**
 * Palette of color suggestions for layers (the color can also be free).
 * Mirrors the theme's `layer-01`…`layer-10` tokens (`src/theme/tokens.ts`;
 * `tests/theme/layerPalette.test.ts` checks it). Uppercase, as `nextLayerColor` compares.
 * Only applies to new layers: existing ones keep the color saved in the project.
 */
export const LAYER_PALETTE: readonly string[] = [
  DEFAULT_LAYER_COLOR,
  '#1E88E5',
  '#2E7D32',
  '#E65100',
  '#7E57C2',
  '#A07800',
  '#00838F',
  '#D81B60',
  '#8D6E63',
  '#607D8B',
];

/** First palette color not yet used by a layer (starts over when all are in use). */
export function nextLayerColor(p: Project): string {
  const used = new Set(p.layers.map((l) => l.color.toUpperCase()));
  return (
    LAYER_PALETTE.find((c) => !used.has(c)) ??
    (LAYER_PALETTE[p.layers.length % LAYER_PALETTE.length] as string)
  );
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') fail('invalid-name');
  return trimmed;
}

function checkColor(color: string): string {
  if (!HEX_COLOR_RE.test(color)) fail('invalid-color');
  return color.toUpperCase();
}

/** Creates a free layer. Specialization layers come from `applySpecialization`. */
export function addLayer(p: Project, layer: Omit<Layer, 'spec'>): Project {
  if (p.layers.some((l) => l.id === layer.id)) fail('duplicate-id', layer.id);
  const created: Layer = {
    id: layer.id,
    name: checkName(layer.name),
    color: checkColor(layer.color),
    spec: null,
  };
  return { ...p, layers: [...p.layers, created] };
}

/** Specialization layers cannot be renamed or deleted individually. */
function checkFreeLayer(p: Project, layerId: string): void {
  if (findById(p.layers, layerId).spec) fail('spec-layer', layerId);
}

export function renameLayer(p: Project, layerId: string, name: string): Project {
  checkFreeLayer(p, layerId);
  const trimmed = checkName(name);
  return {
    ...p,
    layers: updateById(p.layers, layerId, (l) => ({ ...l, name: trimmed })),
  };
}

export function setLayerColor(p: Project, layerId: string, color: string): Project {
  const checked = checkColor(color);
  return {
    ...p,
    layers: updateById(p.layers, layerId, (l) => ({ ...l, color: checked })),
  };
}

/** Moves the layer to position `toIndex`. */
export function moveLayer(p: Project, layerId: string, toIndex: number): Project {
  const from = p.layers.indexOf(findById(p.layers, layerId));
  return { ...p, layers: moveItem(p.layers, from, toIndex) };
}

/** Annotations of the layer plus the ones linked to them (recursively), even in other layers. */
function doomedByLayer(p: Project, layerId: string): Set<string> {
  const doomed = new Set<string>();
  for (const a of p.annotations) {
    if (a.layerId !== layerId) continue;
    for (const id of annotationWithLinked(p, a.id)) doomed.add(id);
  }
  return doomed;
}

/**
 * Effect of deleting the layer: `annotations` is the total and `byLayer` the count per
 * layer (includes the layer itself and the others reached by the link).
 */
export function layerDeletionImpact(
  p: Project,
  layerId: string,
): { annotations: number; byLayer: ReadonlyMap<string, number>; brokenRefs: number } {
  findById(p.layers, layerId);
  const doomed = doomedByLayer(p, layerId);
  const byLayer = new Map<string, number>();
  for (const a of p.annotations) {
    if (doomed.has(a.id)) byLayer.set(a.layerId, (byLayer.get(a.layerId) ?? 0) + 1);
  }
  const after = { ...p, annotations: p.annotations.filter((a) => !doomed.has(a.id)) };
  return { annotations: doomed.size, byLayer, brokenRefs: countBrokenRefs(p, after) };
}

/**
 * Deletes the layer, its annotations and the ones linked to them in other layers.
 * The project must keep at least one layer.
 */
export function removeLayer(p: Project, layerId: string): Project {
  checkFreeLayer(p, layerId);
  if (p.layers.length === 1) fail('last-layer');
  const doomed = doomedByLayer(p, layerId);
  return pruneHiddenLayers({
    ...p,
    layers: p.layers.filter((l) => l.id !== layerId),
    annotations: p.annotations.filter((a) => !doomed.has(a.id)),
  });
}
