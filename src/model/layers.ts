import { fail } from './errors';
import { annotationWithLinked } from './links';
import { findById, moveItem, updateById } from './project';
import type { Layer, Project } from './types';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Cor da primeira camada de um projeto novo. */
export const DEFAULT_LAYER_COLOR = '#E53935';

/** Paleta de sugestões de cor para camadas (a cor também pode ser livre). */
export const LAYER_PALETTE: readonly string[] = [
  DEFAULT_LAYER_COLOR,
  '#FB8C00',
  '#FDD835',
  '#43A047',
  '#00ACC1',
  '#1E88E5',
  '#5E35B1',
  '#D81B60',
  '#6D4C41',
  '#546E7A',
];

/** Primeira cor da paleta ainda não usada por uma camada (recomeça quando todas estão em uso). */
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
  if (!HEX_COLOR.test(color)) fail('invalid-color');
  return color.toUpperCase();
}

export function addLayer(p: Project, layer: Layer): Project {
  const created: Layer = {
    id: layer.id,
    name: checkName(layer.name),
    color: checkColor(layer.color),
  };
  return { ...p, layers: [...p.layers, created] };
}

export function renameLayer(p: Project, layerId: string, name: string): Project {
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

/** Reordena a camada para a posição `toIndex`. */
export function moveLayer(p: Project, layerId: string, toIndex: number): Project {
  const from = p.layers.indexOf(findById(p.layers, layerId));
  return { ...p, layers: moveItem(p.layers, from, toIndex) };
}

/** Anotações da camada mais as vinculadas a elas (recursivamente), mesmo em outras camadas. */
function doomedByLayer(p: Project, layerId: string): Set<string> {
  const doomed = new Set<string>();
  for (const a of p.annotations) {
    if (a.layerId !== layerId) continue;
    for (const id of annotationWithLinked(p, a.id)) doomed.add(id);
  }
  return doomed;
}

/**
 * Efeito de excluir a camada: `annotations` é o total e `byLayer` a contagem por
 * camada (inclui a própria camada e as outras atingidas pelo vínculo).
 */
export function layerDeletionImpact(
  p: Project,
  layerId: string,
): { annotations: number; byLayer: ReadonlyMap<string, number> } {
  findById(p.layers, layerId);
  const doomed = doomedByLayer(p, layerId);
  const byLayer = new Map<string, number>();
  for (const a of p.annotations) {
    if (doomed.has(a.id)) byLayer.set(a.layerId, (byLayer.get(a.layerId) ?? 0) + 1);
  }
  return { annotations: doomed.size, byLayer };
}

/**
 * Exclui a camada, as anotações dela e as vinculadas a elas em outras camadas.
 * O projeto precisa manter ao menos uma camada.
 */
export function removeLayer(p: Project, layerId: string): Project {
  findById(p.layers, layerId);
  if (p.layers.length === 1) fail('last-layer');
  const doomed = doomedByLayer(p, layerId);
  return {
    ...p,
    layers: p.layers.filter((l) => l.id !== layerId),
    annotations: p.annotations.filter((a) => !doomed.has(a.id)),
  };
}
