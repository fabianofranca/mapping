import type { Layer, Project } from './types';

// Como as marcações aparecem de acordo com as anotações (próprias e herdadas) nas
// camadas visíveis. Funções puras: o canvas só aplica o resultado.

/** Modos de exibição das marcações (preferência do dispositivo, fora do JSON). */
export const MARKING_DISPLAY_MODES = ['all', 'dim', 'hide'] as const;
export type MarkingDisplayMode = (typeof MARKING_DISPLAY_MODES)[number];

/** Uma camada que chega à marcação. `inheritedOnly`: só por herança, sem anotação própria. */
export interface LayerDot {
  readonly layer: Layer;
  readonly inheritedOnly: boolean;
}

/**
 * Camadas visíveis que chegam a cada marcação, na ordem de `layers`. Conta a
 * anotação própria e a herdada (`inherit: true` em qualquer ancestral).
 * Marcações sem nenhuma não aparecem no mapa.
 */
export function layerDotsByMarking(
  p: Project,
  layers: readonly Layer[],
): Map<string, LayerDot[]> {
  const order = new Map(layers.map((l, i) => [l.id, i]));
  const own = new Map<string, Set<number>>();
  const inheriting = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, key: string, index: number) => {
    const set = map.get(key) ?? new Set<number>();
    set.add(index);
    map.set(key, set);
  };
  for (const a of p.annotations) {
    const index = order.get(a.layerId);
    if (index === undefined) continue;
    add(own, a.markingId, index);
    if (a.inherit) add(inheriting, a.markingId, index);
  }

  const byId = new Map(p.markings.map((m) => [m.id, m]));
  // Camadas herdadas por marcação, com memória para não refazer a subida.
  const inheritedOf = new Map<string, ReadonlySet<number>>();
  const inherited = (id: string, guard = 0): ReadonlySet<number> => {
    const cached = inheritedOf.get(id);
    if (cached) return cached;
    const parentId = byId.get(id)?.parentId ?? null;
    let result: ReadonlySet<number> = new Set();
    if (parentId !== null && guard <= byId.size) {
      result = new Set([
        ...inherited(parentId, guard + 1),
        ...(inheriting.get(parentId) ?? []),
      ]);
    }
    inheritedOf.set(id, result);
    return result;
  };

  const result = new Map<string, LayerDot[]>();
  for (const m of p.markings) {
    const ownSet = own.get(m.id);
    const inheritedSet = inherited(m.id);
    if (!ownSet && inheritedSet.size === 0) continue;
    const indexes = [...new Set([...(ownSet ?? []), ...inheritedSet])].sort(
      (a, b) => a - b,
    );
    result.set(
      m.id,
      indexes.map((i) => ({
        layer: layers[i] as Layer,
        inheritedOnly: !ownSet?.has(i),
      })),
    );
  }
  return result;
}

/**
 * `full`: desenhada normalmente. `dim`: esmaecida. `outline`: só a borda esmaecida,
 * sem texto nem indicadores (ancestral de uma marcação visível, no modo Ocultar).
 * `hidden`: não aparece nem recebe toque.
 */
export type MarkingVisibility = 'full' | 'dim' | 'outline' | 'hidden';

/**
 * Visibilidade de cada marcação segundo o modo. "Sem anotação" = sem anotação
 * própria nem herdada na camada ativa: `dots` vem de `layerDotsByMarking` com
 * só a camada ativa (as demais camadas visíveis não contam). A selecionada
 * sempre aparece por inteiro. No modo Ocultar, o ancestral sem anotação de uma
 * marcação que aparece fica só com a borda, para manter o contexto.
 */
export function markingVisibility(
  p: Project,
  dots: ReadonlyMap<string, readonly LayerDot[]>,
  mode: MarkingDisplayMode,
  selectedMarkingId: string | null,
): Map<string, MarkingVisibility> {
  const result = new Map<string, MarkingVisibility>();
  const shown = (id: string) => dots.has(id) || id === selectedMarkingId;
  const absent = mode === 'hide' ? 'hidden' : 'dim';
  for (const m of p.markings) {
    result.set(m.id, mode === 'all' || shown(m.id) ? 'full' : absent);
  }
  if (mode !== 'hide') return result;

  const byId = new Map(p.markings.map((m) => [m.id, m]));
  for (const m of p.markings) {
    if (!shown(m.id)) continue;
    let parentId = m.parentId;
    // Para ao achar um ancestral já resolvido (o resto da cadeia também está).
    while (parentId !== null && result.get(parentId) === 'hidden') {
      result.set(parentId, 'outline');
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return result;
}
