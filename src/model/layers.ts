import { fail } from './errors';
import { annotationWithLinked } from './links';
import { findById, moveItem, updateById } from './project';
import { countBrokenRefs } from './refs';
import type { Layer, Project } from './types';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Cor da primeira camada de um projeto novo. */
export const DEFAULT_LAYER_COLOR = '#D32F2F';

/**
 * Paleta de sugestões de cor para camadas (a cor também pode ser livre).
 * Espelha os tokens `layer-01`…`layer-10` do tema (`src/theme/tokens.ts`; o
 * `tests/theme/layerPalette.test.ts` confere). Em maiúsculas, como `nextLayerColor` compara.
 * Só vale para camadas novas: as existentes mantêm a cor salva no projeto.
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

/** Cria uma camada livre. Camadas de especialização vêm de `applySpecialization`. */
export function addLayer(p: Project, layer: Omit<Layer, 'spec'>): Project {
  const created: Layer = {
    id: layer.id,
    name: checkName(layer.name),
    color: checkColor(layer.color),
    spec: null,
  };
  return { ...p, layers: [...p.layers, created] };
}

/** Camadas da especialização não podem ser renomeadas nem excluídas individualmente. */
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
 * Exclui a camada, as anotações dela e as vinculadas a elas em outras camadas.
 * O projeto precisa manter ao menos uma camada.
 */
export function removeLayer(p: Project, layerId: string): Project {
  checkFreeLayer(p, layerId);
  if (p.layers.length === 1) fail('last-layer');
  const doomed = doomedByLayer(p, layerId);
  return {
    ...p,
    layers: p.layers.filter((l) => l.id !== layerId),
    annotations: p.annotations.filter((a) => !doomed.has(a.id)),
  };
}
