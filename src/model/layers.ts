import { fail } from './errors';
import { findById, moveItem, updateById } from './project';
import type { Layer, Project } from './types';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

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

export function layerDeletionImpact(
  p: Project,
  layerId: string,
): { annotations: number } {
  findById(p.layers, layerId);
  return { annotations: p.annotations.filter((a) => a.layerId === layerId).length };
}

/** Exclui a camada e as anotações dela. O projeto precisa manter ao menos uma camada. */
export function removeLayer(p: Project, layerId: string): Project {
  findById(p.layers, layerId);
  if (p.layers.length === 1) fail('last-layer');
  return {
    ...p,
    layers: p.layers.filter((l) => l.id !== layerId),
    annotations: p.annotations.filter((a) => a.layerId !== layerId),
  };
}
