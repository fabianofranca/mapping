import { findSlot, resolveSlotLayout, slotBoxOfScene } from './components/arrange';
import type { ComponentFile } from './components/componentFormat';
import { instantiate, type TextMeasurer } from './components/instantiate';
import {
  hasSlotComponent,
  markingComponent,
  type ComponentCatalog,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import { componentForDrawing } from './drawingMode';
import { fail, ModelError } from './errors';
import {
  MIN_STORED_MARKING_SIZE,
  clamp,
  containsRect,
  imagePixelRect,
  rectsOverlap,
  right,
  bottom,
  type Size,
} from './geometry';
import {
  crowdedRectIn,
  freeRectIn,
  isFreeInLevel,
  placementLevel,
} from './freePlacement';
import { childrenOf } from './hierarchy';
import { createMarking, placeFloatingNear, type FloatingNearTarget } from './markings';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { SpecAnnotationType } from './spec';
import { findSpecType, projectLayerFor } from './specLookup';
import { addTypedAnnotation, setFieldValue } from './typed';
import type { Marking, Project, ProjectContainer, Rect, TypedValues } from './types';

// Criar uma instância de componente (etapa Biblioteca, B3): uma marcação com uma anotação
// tipada, no tamanho inicial do componente. Operação pura: o store faz dela **uma** entrada
// de desfazer. Nada do desenho é gravado (ver `componentDrawings.ts`).

export interface ComponentType {
  readonly specId: string;
  readonly typeId: string;
  readonly name: string;
  /** Camada da especialização a que o tipo pertence. */
  readonly layerId: string;
  /** O componente tem um slot que adota marcações filhas. */
  readonly container: boolean;
  /** O tipo declara `floating`: a instância nasce flutuante, no canvas (`formatVersion` 7). */
  readonly floating: boolean;
  readonly component: ComponentFile;
}

/**
 * Tipos com componente das especializações aplicadas, na ordem da especialização (camadas e
 * depois tipos). Só entra a especialização cuja versão bate com a do catálogo.
 */
export function componentTypes(p: Project, catalog: ComponentCatalog): ComponentType[] {
  const result: ComponentType[] = [];
  for (const applied of p.specializations) {
    const components = catalog.get(applied.id);
    if (!applied.spec || components?.version !== applied.version) continue;
    for (const layer of applied.spec.layers) {
      for (const type of layer.annotationTypes) {
        const component = components.byType.get(type.id);
        if (component === undefined) continue;
        result.push({
          specId: applied.id,
          typeId: type.id,
          name: type.name,
          layerId: layer.id,
          container: hasSlotComponent(component),
          floating: type.floating === true,
          component,
        });
      }
    }
  }
  return result;
}

export interface NewComponentArgs {
  readonly markingId: string;
  readonly annotationId: string;
  /** Container da instância (posição em pixels dele); `null` = o canvas (unidades do canvas). */
  readonly containerId: string | null;
  /**
   * Componente com slot **alvo**, onde a instância é posicionada (dentro do slot); `null` = fora
   * de qualquer slot. É só o destino do posicionamento: o pai gravado é sempre o que o assentar
   * decide pela geometria (a menor marcação do espaço que contém a instância), nunca o pedido.
   */
  readonly parentId: string | null;
  readonly specId: string;
  readonly typeId: string;
  /**
   * Centro desejado sem componente com slot, no espaço da instância: pixels do container
   * (ausente = centro dele) ou unidades do canvas (ausente = `{ x: 0, y: 0 }`). Um tipo
   * flutuante só existe no canvas: `containerId` e `parentId` nulos, senão `invalid-space`.
   */
  readonly center?: { readonly x: number; readonly y: number };
  /** Retângulo explícito (MCP), no espaço da instância; ausente = `componentPlacement`. */
  readonly rect?: Rect;
  /**
   * Só tipo flutuante: posiciona a instância num lugar livre da margem do alvo (container ou
   * marcação; `placeFloatingNear`) com o tamanho do componente. `rect` explícito vence.
   */
  readonly near?: FloatingNearTarget;
  /**
   * Valores iniciais por cima do `preview` do componente (que já está sobre os `default`):
   * os campos que não vêm aqui começam com o `preview`; ausente = só o `preview`.
   */
  readonly values?: TypedValues;
  readonly name?: string | null;
}

interface Resolved {
  readonly component: ComponentFile;
  readonly type: SpecAnnotationType;
  readonly layerId: string;
}

function resolveType(
  p: Project,
  catalog: ComponentCatalog,
  specId: string,
  typeId: string,
): Resolved {
  const applied = projectIndex(p).specializations.get(specId);
  const components = catalog.get(specId);
  const component = components?.byType.get(typeId);
  const resolved = findSpecType(p, { specId, typeId });
  if (
    !applied ||
    components?.version !== applied.version ||
    component === undefined ||
    resolved === null
  ) {
    return fail('unknown-type', `${specId}/${typeId}`);
  }
  return { component, type: resolved.type, layerId: resolved.layer.id };
}

interface SlotBox {
  readonly area: Rect;
  readonly padding: { left: number; top: number; right: number; bottom: number };
  readonly gap: number;
  readonly flow: 'row' | 'column' | 'none';
  readonly reverse: boolean;
  readonly hasSlot: boolean;
}

/** Caixa do slot em pixels inteiros, dentro do componente com slot; o retângulo dele se não houver slot. */
function slotArea(
  p: Project,
  catalog: ComponentCatalog,
  containerId: string,
  measure: TextMeasurer,
): SlotBox {
  const container = findById(p.markings, containerId);
  const none = { left: 0, top: 0, right: 0, bottom: 0 };
  const whole = {
    area: container.rect,
    padding: none,
    gap: 0,
    flow: 'none' as const,
    reverse: false,
    hasSlot: false,
  };
  const mc = markingComponent(p, catalog, containerId);
  const drawn =
    mc === null ? null : componentForDrawing(p, mc.component, container.containerId);
  const slot = drawn === null ? undefined : findSlot(drawn.component);
  if (mc === null || drawn === null || slot === undefined) return whole;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const { root } = instantiate(drawn.component, values, container.rect, {
    measure,
    idPrefix: container.id,
    ...(drawn.tokens === undefined ? {} : { tokens: drawn.tokens }),
  });
  const box = slotBoxOfScene(root);
  if (box === undefined) return whole;
  const x = Math.max(Math.ceil(box.x), container.rect.x);
  const y = Math.max(Math.ceil(box.y), container.rect.y);
  const r = Math.min(Math.floor(box.x + box.width), right(container.rect));
  const b = Math.min(Math.floor(box.y + box.height), bottom(container.rect));
  if (r - x < 1 || b - y < 1) return whole;
  const layout = resolveSlotLayout(slot, values);
  return {
    area: { x, y, width: r - x, height: b - y },
    padding: layout.padding,
    gap: layout.gap,
    flow: layout.type,
    reverse: layout.reverse,
    hasSlot: true,
  };
}

/**
 * O retângulo de `rect` ficou dentro da área do slot do componente com slot `targetId` (a mesma
 * `slotArea` do `componentPlacement`) e, em layout de linha ou coluna, fora da última filha? `false`
 * também quando o alvo não desenha componente com slot. Serve para saber se uma instância nova
 * coube ou ficou presa ao componente (slot cheio).
 */
export function placementFitsSlot(
  p: Project,
  catalog: ComponentCatalog,
  targetId: string,
  rect: Rect,
  measure: TextMeasurer,
): boolean {
  const slot = slotArea(p, catalog, targetId, measure);
  if (!slot.hasSlot || !containsRect(slot.area, rect)) return false;
  // Layout em linha ou coluna: presa ao componente, a filha pode ficar dentro da área do slot e ainda
  // assim em cima da última irmã (slot do tamanho do componente): também não coube.
  const last = childrenOf(p, targetId).at(-1);
  return slot.flow === 'none' || last === undefined || !rectsOverlap(last.rect, rect);
}

/** O alvo desenha um componente com slot? (o que o `componentPlacement` usa para posicionar a filha) */
export function hasComponentSlot(
  p: Project,
  catalog: ComponentCatalog,
  targetId: string,
  measure: TextMeasurer,
): boolean {
  return slotArea(p, catalog, targetId, measure).hasSlot;
}

type PlacementArgs = Pick<
  NewComponentArgs,
  'containerId' | 'parentId' | 'specId' | 'typeId' | 'center'
> & {
  /** Substitui o `size` do componente (MCP: o `rect` de `inside`), com as mesmas regras. */
  readonly size?: { readonly width: number; readonly height: number };
};

/** O que a colocação de uma instância nova precisa: o tipo, o pai alvo, o slot dele e a área. */
interface PlacementSpace {
  readonly component: ComponentFile;
  readonly floating: boolean;
  readonly image: ProjectContainer | null;
  readonly parent: Marking | null;
  readonly slot: SlotBox | null;
  /** A imagem ou a caixa do slot; `null` no canvas sem slot (sem limite). */
  readonly area: Rect | null;
}

function placementSpace(
  p: Project,
  catalog: ComponentCatalog,
  args: PlacementArgs,
  measure: TextMeasurer,
): PlacementSpace {
  const { component, type } = resolveType(p, catalog, args.specId, args.typeId);
  const image =
    args.containerId === null ? null : findById(p.containers, args.containerId);
  const parent = args.parentId === null ? null : findById(p.markings, args.parentId);
  if (parent !== null && parent.containerId !== args.containerId)
    fail('invalid-parent', parent.id);
  const slot = parent === null ? null : slotArea(p, catalog, parent.id, measure);
  // Sem imagem (canvas) e sem slot, não há limite.
  const area: Rect | null = slot?.area ?? (image === null ? null : imagePixelRect(image));
  return { component, floating: type.floating === true, image, parent, slot, area };
}

/**
 * Tamanho de uma instância nova: o `size` do componente (ou `args.size`) preso à área disponível
 * (a imagem ou a caixa do slot do componente com slot) e nunca abaixo do `minSize`; se nem o
 * mínimo cabe, `rect-out-of-image` (nível da imagem) ou `rect-outside-parent` (componente com
 * slot). No canvas sem slot não há limite. É só o tamanho, sem a busca de lugar: serve a quem não
 * precisa da posição (o tamanho inicial e o `near` do MCP).
 */
function fitSize(space: PlacementSpace, wanted: Size): Size {
  const min = space.component.minSize;
  const fit = (size: number, minimum: number, available: number): number => {
    const value = Math.max(
      Math.min(Math.round(size), available),
      minimum,
      MIN_STORED_MARKING_SIZE,
    );
    if (value > available)
      fail(space.parent === null ? 'rect-out-of-image' : 'rect-outside-parent');
    return value;
  };
  return {
    width: fit(wanted.width, min?.width ?? 0, space.area?.width ?? Infinity),
    height: fit(wanted.height, min?.height ?? 0, space.area?.height ?? Infinity),
  };
}

export function componentSize(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<PlacementArgs, 'containerId' | 'parentId' | 'specId' | 'typeId' | 'size'>,
  measure: TextMeasurer,
): Size {
  const space = placementSpace(p, catalog, args, measure);
  return fitSize(space, args.size ?? space.component.size);
}

/** R0 fora de um slot: o tamanho centrado em `center` (padrão, o centro da imagem), preso à imagem. */
function centeredRect(
  space: PlacementSpace,
  size: Size,
  center?: { readonly x: number; readonly y: number },
): Rect {
  const at =
    center ??
    (space.image === null
      ? { x: 0, y: 0 }
      : { x: space.image.width / 2, y: space.image.height / 2 });
  const x = Math.round(at.x - size.width / 2);
  const y = Math.round(at.y - size.height / 2);
  const { area } = space;
  if (area === null) return { x, y, ...size };
  return {
    x: clamp(x, area.x, right(area) - size.width),
    y: clamp(y, area.y, bottom(area) - size.height),
    ...size,
  };
}

/** R0 num componente com slot: depois da última filha no eixo do layout, ou no início do conteúdo (antes do `clamp`). */
function slotRect(p: Project, parent: Marking, slot: SlotBox, size: Size): Rect {
  const slotBox = slot.area;
  let x = slotBox.x + slot.padding.left;
  let y = slotBox.y + slot.padding.top;
  const last = childrenOf(p, parent.id).at(-1);
  if (slot.reverse && slot.flow !== 'none') {
    // `layout.reverse`: a primeira filha encosta no fim do slot e as seguintes ficam antes da última.
    const column = slot.flow === 'column';
    const edge = column
      ? bottom(slotBox) - slot.padding.bottom
      : right(slotBox) - slot.padding.right;
    const near =
      last === undefined ? edge : (column ? last.rect.y : last.rect.x) - slot.gap;
    if (column) y = near - size.height;
    else x = near - size.width;
  } else if (last !== undefined && slot.flow === 'row') x = right(last.rect) + slot.gap;
  else if (last !== undefined && slot.flow === 'column') y = bottom(last.rect) + slot.gap;
  return { x: Math.round(x), y: Math.round(y), ...size };
}

/** Sem lugar livre no slot: a posição de antes (a do slot se cabe; senão presa dentro do componente). */
function clampToParent(parent: Marking, slotBox: Rect, placed: Rect): Rect {
  if (containsRect(slotBox, placed)) return placed;
  const outer = parent.rect;
  return {
    x: clamp(placed.x, outer.x, right(outer) - placed.width),
    y: clamp(placed.y, outer.y, bottom(outer) - placed.height),
    width: placed.width,
    height: placed.height,
  };
}

/**
 * Retângulo de uma instância nova, em lugar livre (etapa #1087). O R0 é a posição de antes:
 * sem componente com slot, o tamanho do componente centrado em `center` (padrão, o centro da
 * imagem) e preso à imagem; no canvas (`containerId` nulo), centrado em `center` (padrão
 * `{ x: 0, y: 0 }`), sem limite; num componente com slot, dentro da caixa do slot, logo depois da
 * última filha no eixo do layout (linha: à direita; coluna: abaixo; com o `gap` e o `padding` do
 * slot; com `layout.reverse`, a primeira no fim do slot e as seguintes antes da última), ou no
 * início do conteúdo se o layout é `none` ou não há filhas (antes do `clamp`).
 *
 * Se o R0 já é livre, é ele. Senão vai para o lugar livre mais perto dele (`placementLevel`:
 * dentro da menor marcação que o contém e é diferente dele, ou na imagem, sem cobrir nem
 * coincidir com outras marcações), com o vão `PLACEMENT_GAP`. Sem lugar na área, fica no R0 (preso
 * ao componente com slot), sem erro. O tipo flutuante (fora da árvore) devolve o R0 sem buscar.
 */
export function componentPlacement(
  p: Project,
  catalog: ComponentCatalog,
  args: PlacementArgs,
  measure: TextMeasurer,
): Rect {
  const space = placementSpace(p, catalog, args, measure);
  const size = fitSize(space, args.size ?? space.component.size);
  const { parent, slot } = space;
  if (parent === null || slot === null) {
    const r0 = centeredRect(space, size, args.center);
    if (space.floating) return r0;
    return freeRectIn(placementLevel(p, args.containerId, r0), r0) ?? r0;
  }
  const placed = slotRect(p, parent, slot, size);
  const level = placementLevel(p, args.containerId, placed, { parent, area: slot.area });
  const free = freeRectIn(level, placed);
  // Slot cheio: a posição de antes, mas nunca contida nem igual a uma irmã (3.1): senão o assentar
  // a faria filha dela, e não do componente do slot.
  return free ?? crowdedRectIn(level, clampToParent(parent, slot.area, placed));
}

/**
 * O retângulo `rect` é livre onde `componentPlacement` o poria: cabe na área do nível (a imagem,
 * a marcação que o contém ou a caixa do slot de `parentId`) e não se sobrepõe a nenhuma marcação
 * não flutuante (nem, no canvas, a nenhum container) que cruza a área, fora o pai e os ancestrais.
 * Dá ao teste, e a quem quiser avisar depois, se a peça escolhida ficou livre (decisão 5).
 */
export function placementIsFree(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<PlacementArgs, 'containerId' | 'parentId' | 'specId' | 'typeId'> & {
    readonly rect: Rect;
  },
  measure: TextMeasurer,
): boolean {
  const { slot, parent } = placementSpace(p, catalog, args, measure);
  const target =
    parent === null || slot === null ? undefined : { parent, area: slot.area };
  return isFreeInLevel(placementLevel(p, args.containerId, args.rect, target), args.rect);
}

/** O `preview` do campo se ele é um valor simples; `undefined` para `table`, `ref`, ausente ou composto. */
function simplePreview(
  field: SpecAnnotationType['fields'][number],
  component: ComponentFile,
): string | number | null | undefined {
  if (field.type === 'table' || field.type === 'ref') return undefined;
  const preview = component.preview?.[field.key];
  // As linhas de uma tabela não passam por aqui (o campo `table` já foi pulado).
  const simple =
    typeof preview === 'string' || typeof preview === 'number' || preview === null;
  return simple ? preview : undefined;
}

/**
 * Põe o `preview` do componente nos campos da anotação que `given` não informa (os campos
 * `table` e `ref` ficam no `default`). Um `preview` que o campo não aceita fica no `default`.
 */
function applyPreview(
  p: Project,
  annotationId: string,
  type: SpecAnnotationType,
  component: ComponentFile,
  given: TypedValues | undefined,
): Project {
  let next = p;
  for (const field of type.fields) {
    if (given !== undefined && field.key in given) continue;
    const preview = simplePreview(field, component);
    if (preview === undefined) continue;
    try {
      next = setFieldValue(next, annotationId, field.key, preview);
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
    }
  }
  return next;
}

/**
 * Cria a marcação e a anotação tipada que a desenha, numa operação só (o store faz uma
 * entrada de desfazer). `parentId` é o componente com slot alvo onde a instância é posicionada;
 * o pai gravado é o que o assentar decide pela geometria (`createMarking` assenta), nunca o
 * pedido. A anotação vai na camada do projeto que veio da camada da
 * especialização do tipo, com o `preview` do componente nos campos que `args.values` não
 * informa e os valores de `args.values` por cima (campos `table` e `ref` ficam no `default`). O tamanho mínimo do
 * componente vale desde a criação.
 */
export function addComponentMarking(
  p: Project,
  catalog: ComponentCatalog,
  args: NewComponentArgs,
  measure: TextMeasurer,
): Project {
  const { component, type, layerId } = resolveType(p, catalog, args.specId, args.typeId);
  const layer =
    projectLayerFor(p, args.specId, layerId) ?? fail('type-not-in-layer', args.typeId);
  // Tipo flutuante (decisão 10): nasce marcação flutuante no canvas, fora do pertencimento.
  const floating = type.floating === true;
  const defaultSize = (): Size =>
    componentSize(
      p,
      catalog,
      { containerId: null, parentId: null, specId: args.specId, typeId: args.typeId },
      measure,
    );
  if (floating && (args.containerId !== null || args.parentId !== null)) {
    fail('invalid-space', args.typeId);
  }
  const near = floating && args.near && !args.rect ? args.near : null;
  const rect =
    args.rect ??
    (near ? placeFloatingNear(p, near, defaultSize()) : null) ??
    componentPlacement(
      p,
      catalog,
      {
        containerId: args.containerId,
        parentId: args.parentId,
        specId: args.specId,
        typeId: args.typeId,
        ...(args.center ? { center: args.center } : {}),
      },
      measure,
    );
  if (args.parentId !== null) {
    const parent = findById(p.markings, args.parentId);
    if (parent.containerId !== args.containerId) fail('invalid-parent', parent.id);
    if (!containsRect(parent.rect, rect)) fail('rect-outside-parent');
  }

  let next = createMarking(
    p,
    {
      id: args.markingId,
      containerId: args.containerId,
      rect,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(floating ? { floating: true } : {}),
    },
    {
      minSize: component.minSize ?? {
        width: MIN_STORED_MARKING_SIZE,
        height: MIN_STORED_MARKING_SIZE,
      },
    },
  );
  next = addTypedAnnotation(next, {
    id: args.annotationId,
    markingId: args.markingId,
    layerId: layer.id,
    type: { specId: args.specId, typeId: args.typeId },
  });

  next = applyPreview(next, args.annotationId, type, component, args.values);
  for (const [key, value] of Object.entries(args.values ?? {})) {
    next = setFieldValue(next, args.annotationId, key, value);
  }
  return next;
}
