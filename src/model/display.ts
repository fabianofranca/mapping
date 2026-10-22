import { projectIndex } from './projectIndex';
import type { Layer, Project } from './types';

// Como as marcações aparecem de acordo com as anotações nas
// camadas visíveis. Funções puras: o canvas só aplica o resultado.

/** Modos de exibição das marcações (preferência do dispositivo, fora do JSON). */
export const MARKING_DISPLAY_MODES = ['all', 'dim', 'hide'] as const;
export type MarkingDisplayMode = (typeof MARKING_DISPLAY_MODES)[number];

/** Uma camada com anotação própria na marcação. */
export interface LayerDot {
  readonly layer: Layer;
}

/**
 * Camadas visíveis com anotação própria em cada marcação, na ordem de `layers`.
 * Marcações sem nenhuma não aparecem no mapa.
 */
export function layerDotsByMarking(
  p: Project,
  layers: readonly Layer[],
): Map<string, LayerDot[]> {
  const order = new Map(layers.map((l, i) => [l.id, i]));
  const own = new Map<string, Set<number>>();
  for (const a of p.annotations) {
    const index = order.get(a.layerId);
    if (index === undefined) continue;
    const set = own.get(a.markingId) ?? new Set<number>();
    set.add(index);
    own.set(a.markingId, set);
  }

  const result = new Map<string, LayerDot[]>();
  for (const m of p.markings) {
    const ownSet = own.get(m.id);
    if (!ownSet) continue;
    const indexes = [...ownSet].sort((a, b) => a - b);
    result.set(
      m.id,
      indexes.map((i) => ({ layer: layers[i] as Layer })),
    );
  }
  return result;
}

/**
 * `full`: desenhada normalmente. `dim`: esmaecida. `outline`: só a borda esmaecida,
 * sem texto nem indicadores (ancestral de uma marcação visível, no modo Ocultar).
 * `hidden`: não aparece nem recebe toque.
 */
const NO_ALWAYS_SHOWN: ReadonlySet<string> = new Set();

export type MarkingVisibility = 'full' | 'dim' | 'outline' | 'hidden';

/**
 * Visibilidade de cada marcação segundo o modo. "Sem anotação" = sem anotação
 * própria nem herdada na camada ativa: `dots` vem de `layerDotsByMarking` com
 * só a camada ativa (as demais camadas visíveis não contam). A selecionada
 * sempre aparece por inteiro. No modo Ocultar, o ancestral sem anotação de uma
 * marcação que aparece fica só com a borda, para manter o contexto. `alwaysShown`: marcações
 * que desenham um componente são conteúdo da tela, não "sem anotação": o filtro não as
 * esmaece nem oculta (ficam `full`, como as selecionadas).
 */
export function markingVisibility(
  p: Project,
  dots: ReadonlyMap<string, readonly LayerDot[]>,
  mode: MarkingDisplayMode,
  selectedMarkingId: string | null,
  alwaysShown: ReadonlySet<string> = NO_ALWAYS_SHOWN,
): Map<string, MarkingVisibility> {
  const result = new Map<string, MarkingVisibility>();
  const shown = (id: string) =>
    dots.has(id) || id === selectedMarkingId || alwaysShown.has(id);
  const absent = mode === 'hide' ? 'hidden' : 'dim';
  for (const m of p.markings) {
    result.set(m.id, mode === 'all' || shown(m.id) ? 'full' : absent);
  }
  if (mode !== 'hide') return result;

  const byId = projectIndex(p).markings;
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
