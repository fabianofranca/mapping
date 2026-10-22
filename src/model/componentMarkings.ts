import { findSlot, resolveSlotLayout, slotBoxOfScene } from './components/arrange';
import type { ComponentFile } from './components/componentFormat';
import { instantiate, type TextMeasurer } from './components/instantiate';
import {
  hasSlotComponent,
  markingComponent,
  type ComponentCatalog,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import { fail, ModelError } from './errors';
import {
  MIN_MARKING_SIZE,
  clamp,
  containsRect,
  imagePixelRect,
  right,
  bottom,
} from './geometry';
import { childrenOf } from './hierarchy';
import { createMarking, setMarkingParent } from './markings';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { SpecAnnotationType } from './spec';
import { findSpecType, projectLayerFor } from './specLookup';
import { addTypedAnnotation, setFieldValue } from './typed';
import type { Project, Rect, TypedValues } from './types';

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
  readonly containerId: string;
  /** Componente com slot que adota a instância (dentro do slot); `null` = nível da imagem. */
  readonly parentId: string | null;
  readonly specId: string;
  readonly typeId: string;
  /** Centro desejado (pixels da imagem) sem componente com slot; ausente = centro da imagem. */
  readonly center?: { readonly x: number; readonly y: number };
  /** Retângulo explícito (MCP); ausente = `componentPlacement`. */
  readonly rect?: Rect;
  /** Valores iniciais; ausente = `preview` do componente sobre os `default` dos campos. */
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

/** Caixa do slot em pixels inteiros, dentro do componente com slot; o retângulo dele se não houver slot. */
function slotArea(
  p: Project,
  catalog: ComponentCatalog,
  containerId: string,
  measure: TextMeasurer,
): {
  area: Rect;
  padding: { left: number; top: number };
  gap: number;
  flow: 'row' | 'column' | 'none';
} {
  const container = findById(p.markings, containerId);
  const none = { left: 0, top: 0 };
  const whole = { area: container.rect, padding: none, gap: 0, flow: 'none' as const };
  const mc = markingComponent(p, catalog, containerId);
  const slot = mc === null ? undefined : findSlot(mc.component);
  if (mc === null || slot === undefined) return whole;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const { root } = instantiate(mc.component, values, container.rect, {
    measure,
    idPrefix: container.id,
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
    padding: { left: layout.padding.left, top: layout.padding.top },
    gap: layout.gap,
    flow: layout.type,
  };
}

/**
 * Retângulo de uma instância nova. Tamanho = `size` do componente, preso à área disponível
 * (a imagem ou a caixa do slot do componente com slot) e nunca abaixo do `minSize`; se nem o mínimo
 * cabe, `rect-out-of-image` (nível da imagem) ou `rect-outside-parent` (componente com slot). Sem
 * componente com slot: centrada em `center` (padrão, o centro da imagem) e presa dentro da imagem. Com
 * componente com slot: dentro da caixa do slot, logo depois da última filha no eixo do layout (linha:
 * à direita; coluna: abaixo; com o `gap` e o `padding` do slot), ou no início do conteúdo do
 * slot se o layout é `none` ou não há filhas; se passar do slot, presa dentro do componente com slot.
 */
export function componentPlacement(
  p: Project,
  catalog: ComponentCatalog,
  args: Pick<
    NewComponentArgs,
    'containerId' | 'parentId' | 'specId' | 'typeId' | 'center'
  >,
  measure: TextMeasurer,
): Rect {
  const { component } = resolveType(p, catalog, args.specId, args.typeId);
  const image = findById(p.containers, args.containerId);
  const parent = args.parentId === null ? null : findById(p.markings, args.parentId);
  if (parent !== null && parent.containerId !== image.id)
    fail('invalid-parent', parent.id);

  const slot = parent === null ? null : slotArea(p, catalog, parent.id, measure);
  const area = slot?.area ?? imagePixelRect(image);

  const min = component.minSize;
  const fit = (size: number, minimum: number, available: number): number => {
    const value = Math.max(
      Math.min(Math.round(size), available),
      minimum,
      MIN_MARKING_SIZE,
    );
    if (value > available)
      fail(parent === null ? 'rect-out-of-image' : 'rect-outside-parent');
    return value;
  };
  const width = fit(component.size.width, min?.width ?? 0, area.width);
  const height = fit(component.size.height, min?.height ?? 0, area.height);

  if (parent === null || slot === null) {
    const center = args.center ?? { x: image.width / 2, y: image.height / 2 };
    return {
      x: clamp(Math.round(center.x - width / 2), area.x, right(area) - width),
      y: clamp(Math.round(center.y - height / 2), area.y, bottom(area) - height),
      width,
      height,
    };
  }

  let x = area.x + slot.padding.left;
  let y = area.y + slot.padding.top;
  const last = childrenOf(p, parent.id).at(-1);
  if (last !== undefined && slot.flow === 'row') x = right(last.rect) + slot.gap;
  else if (last !== undefined && slot.flow === 'column') y = bottom(last.rect) + slot.gap;
  const placed: Rect = { x: Math.round(x), y: Math.round(y), width, height };
  if (containsRect(area, placed)) return placed;
  const outer = parent.rect;
  return {
    x: clamp(placed.x, outer.x, right(outer) - width),
    y: clamp(placed.y, outer.y, bottom(outer) - height),
    width,
    height,
  };
}

/**
 * Cria a marcação e a anotação tipada que a desenha, numa operação só (o store faz uma
 * entrada de desfazer). O pai é o componente com slot pedido (`null` = nível da imagem), nunca o "mais
 * interno que contém". A anotação vai na camada do projeto que veio da camada da
 * especialização do tipo, com os valores de `args.values` sobre os `default`, ou, sem eles,
 * o `preview` do componente (campos `table` e `ref` ficam no `default`). O tamanho mínimo do
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
  const rect =
    args.rect ??
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
    },
    component.minSize ? { minSize: component.minSize } : undefined,
  );
  next = setMarkingParent(next, args.markingId, args.parentId);
  next = addTypedAnnotation(next, {
    id: args.annotationId,
    markingId: args.markingId,
    layerId: layer.id,
    type: { specId: args.specId, typeId: args.typeId },
  });

  if (args.values !== undefined) {
    for (const [key, value] of Object.entries(args.values)) {
      next = setFieldValue(next, args.annotationId, key, value);
    }
    return next;
  }
  for (const field of type.fields) {
    if (field.type === 'table' || field.type === 'ref') continue;
    const preview = component.preview?.[field.key];
    if (preview === undefined) continue;
    try {
      next = setFieldValue(next, args.annotationId, field.key, preview);
    } catch (error) {
      // Um `preview` que o campo não aceita fica no `default`: a criação não falha por isso.
      if (!(error instanceof ModelError)) throw error;
    }
  }
  return next;
}
