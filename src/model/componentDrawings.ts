import { findSlot, slotBoxOfScene } from './components/arrange';
import type {
  ComponentFile,
  FieldValues,
  ScreenAnchor,
} from './components/componentFormat';
import {
  instantiate,
  type InstantiateOptions,
  type TextMeasurer,
} from './components/instantiate';
import type { ResolvedTokens } from './components/tokens';
import {
  NO_PROVIDED,
  extendProvided,
  pickProvided,
  sameProvided,
  type ProvidedValues,
} from './components/provided';
import type { FrameNode } from './components/scene';
import {
  markingComponent,
  type ComponentCatalog,
  type MarkingComponent,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import { rawMessage, type ModelMessage } from './modelMessage';
import { DEFAULT_LABEL_TEXTS } from './refs';
import { effectiveDrawingMode } from './drawingMode';
import { topDown } from './hierarchy';
import { projectIndex } from './projectIndex';
import type { Project, Rect } from './types';

// Desenhos dos componentes (etapa Biblioteca, B3): a cena instanciada de cada marcação que
// tem componente, derivada do projeto (retângulo da marcação, tipo e valores da anotação,
// molde da especialização) e nunca gravada. O cache só reinstancia a marcação cujas entradas
// mudaram e devolve o **mesmo objeto** nas demais: o canvas compara por identidade.

export interface ComponentDrawing {
  readonly markingId: string;
  /** Container da marcação; `null` = marcação do canvas (retângulo em unidades do canvas). */
  readonly containerId: string | null;
  readonly annotationId: string;
  /** Camada (do projeto) da anotação que desenha: o modo visualização tira o desenho por ela. */
  readonly layerId: string;
  /** Cena instanciada na caixa = retângulo da marcação (pixels da imagem ou unidades do canvas). */
  readonly root: FrameNode;
  /** Avisos do motor (sem código, em texto) e das referências dos valores (com código). */
  readonly warnings: readonly ModelMessage[];
  /** Não cabe: aviso "conteúdo maior que a caixa" do motor ou filha fora da caixa do slot. */
  readonly overflow: boolean;
  /**
   * Quanto falta (px) em cada "não cabe", pela mensagem do aviso do motor; a filha fora do slot
   * entra como `SLOT_OVERFLOW`. Vazio quando cabe ou quando o desenho é em pixels de tela.
   */
  readonly shortfalls: Readonly<Record<string, number>>;
  /**
   * Componente com `screen`: `root` mede o `size` do componente na origem, em pixels de tela, e o
   * canvas o ancora em `anchor` no `rect` (retângulo da marcação, nos pixels da imagem).
   */
  readonly screen?: { readonly anchor: ScreenAnchor; readonly rect: Rect };
}

/** Por id de marcação, inserido em ordem de desenho (pais antes das filhas; irmãs na ordem do array). */
export type ComponentDrawings = ReadonlyMap<string, ComponentDrawing>;

export const NO_DRAWINGS: ComponentDrawings = new Map();

/** Tolerância (px) entre a caixa do slot (decimal) e o retângulo inteiro de uma filha. */
const SLOT_TOLERANCE = 1;

export type DrawingCache = (
  p: Project | null,
  catalog: ComponentCatalog,
  measure: TextMeasurer,
  epoch: number,
  /** Rótulo de anotação livre sem nome nos valores `ref`; o padrão é o do MCP (pt-BR). */
  untitled?: string,
) => ComponentDrawings;

interface Entry {
  readonly markingId: string;
  readonly containerId: string | null;
  readonly annotationId: string;
  readonly rect: Rect;
  readonly component: ComponentFile;
  readonly values: FieldValues;
  readonly valueWarnings: readonly ModelMessage[];
  readonly measure: TextMeasurer;
  readonly epoch: number;
  /** Modo do desenho efetivo da marcação (`undefined` = o primeiro modo). */
  readonly mode: string | undefined;
  /** Retângulos das filhas diretas (só containers). */
  readonly childRects: readonly Rect[];
  /** Cor herdada: só os valores oferecidos pelos ancestrais que o componente lê (`$provided`). */
  readonly provided: ProvidedValues;
  /** O que o slot desta marcação oferece às filhas (`provide`), já resolvido. */
  readonly offers: ProvidedValues | undefined;
  readonly drawing: ComponentDrawing;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRect(r, b[i] as Rect));
}

/** Mesmo valor; as linhas de uma tabela (listas recriadas a cada leitura) comparam célula a célula. */
function sameFieldValue(a: FieldValues[string], b: FieldValues[string]): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    if (row === other) return true;
    if (other === undefined) return false;
    const keys = Object.keys(row);
    return (
      keys.length === Object.keys(other).length &&
      keys.every((key) => key in other && Object.is(row[key], other[key]))
    );
  });
}

function shallowEqual(a: FieldValues, b: FieldValues): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => key in b && sameFieldValue(a[key], b[key]));
}

/** Chave de `shortfalls` para a filha que passa da caixa do slot. */
export const SLOT_OVERFLOW = 'conteúdo maior que a caixa: slot';

/** O quanto a pior filha passa da caixa do slot (com a tolerância do arredondamento); 0 = cabe. */
function slotExcess(root: FrameNode, childRects: readonly Rect[]): number {
  const box = slotBoxOfScene(root);
  if (box === undefined) return 0;
  let worst = 0;
  for (const r of childRects) {
    const excess = Math.max(
      box.x - SLOT_TOLERANCE - r.x,
      box.y - SLOT_TOLERANCE - r.y,
      r.x + r.width - (box.x + box.width + SLOT_TOLERANCE),
      r.y + r.height - (box.y + box.height + SLOT_TOLERANCE),
    );
    worst = Math.max(worst, excess);
  }
  return worst > 0 ? worst + SLOT_TOLERANCE : 0;
}

/** Os "não cabe" do desenho: o aviso do motor (com quanto falta) e a filha fora do slot. */
function overflowsOf(
  overflowWarnings: readonly string[],
  shortfalls: Readonly<Record<string, number>>,
  root: FrameNode,
  childRects: readonly Rect[],
): Record<string, number> {
  const found: Record<string, number> = {};
  for (const w of overflowWarnings) found[w] = shortfalls[w] ?? 0;
  const excess = childRects.length > 0 ? slotExcess(root, childRects) : 0;
  if (excess > 0) found[SLOT_OVERFLOW] = excess;
  return found;
}

/** As opções do `instantiate` de uma marcação: só leva `tokens` e `provided` quando há. */
function instantiateOptions(
  markingId: string,
  measure: TextMeasurer,
  tokens: ResolvedTokens | undefined,
  provided: ProvidedValues,
): InstantiateOptions {
  return {
    measure,
    idPrefix: markingId,
    ...(tokens === undefined ? {} : { tokens }),
    ...(provided === NO_PROVIDED ? {} : { provided }),
  };
}

function draw(
  mc: MarkingComponent,
  markingId: string,
  containerId: string | null,
  rect: Rect,
  values: FieldValues,
  valueWarnings: readonly ModelMessage[],
  childRects: readonly Rect[],
  measure: TextMeasurer,
  mode: string | undefined,
  provided: ProvidedValues,
): { drawing: ComponentDrawing; offers: ProvidedValues | undefined } {
  const tokens =
    mode === undefined ? undefined : mc.component.resolvedTokensByMode?.[mode];
  const screen = mc.component.screen;
  // Em pixels de tela o desenho mede o `size` do componente, na origem (o canvas o ancora).
  const box: Rect = screen === undefined ? rect : { x: 0, y: 0, ...mc.component.size };
  const { root, warnings, shortfalls, overflowWarnings, provides } = instantiate(
    mc.component,
    values,
    box,
    instantiateOptions(markingId, measure, tokens, provided),
  );
  // Com `screen` o desenho pode passar do retângulo da marcação: não há pendência "não cabe".
  const found =
    screen === undefined
      ? overflowsOf(overflowWarnings ?? [], shortfalls ?? {}, root, childRects)
      : {};
  const drawing: ComponentDrawing = {
    markingId,
    containerId,
    annotationId: mc.annotation.id,
    layerId: mc.annotation.layerId,
    root,
    warnings: [...warnings.map(rawMessage), ...valueWarnings],
    overflow: Object.keys(found).length > 0,
    shortfalls: found,
    ...(screen === undefined
      ? {}
      : { screen: { anchor: screen.anchor ?? 'center', rect } }),
  };
  return { drawing, offers: provides };
}

/**
 * Cache dos desenhos de um projeto. A cada chamada devolve, em ordem de desenho, um desenho
 * por marcação com componente. Uma marcação só é reinstanciada quando muda algo de que o
 * desenho dela depende: o retângulo, o componente (por identidade), os valores resolvidos
 * (comparação rasa), o medidor, a época das fontes e, nos containers, os retângulos das
 * filhas; senão volta o mesmo `ComponentDrawing`. Mesmas entradas devolvem o mesmo `Map`.
 */
export function createDrawingCache(): DrawingCache {
  let entries = new Map<string, Entry>();
  let last: {
    p: Project | null;
    catalog: ComponentCatalog;
    measure: TextMeasurer;
    epoch: number;
    untitled: string;
    result: ComponentDrawings;
  } | null = null;

  return (p, catalog, measure, epoch, untitled = DEFAULT_LABEL_TEXTS.untitled) => {
    if (
      last !== null &&
      last.p === p &&
      last.catalog === catalog &&
      last.measure === measure &&
      last.epoch === epoch &&
      last.untitled === untitled
    ) {
      return last.result;
    }
    if (p === null) {
      entries = new Map();
      last = { p, catalog, measure, epoch, untitled, result: NO_DRAWINGS };
      return NO_DRAWINGS;
    }

    const children = projectIndex(p).children;
    const next = new Map<string, Entry>();
    const drawings = new Map<string, ComponentDrawing>();
    // Cor herdada: o que as filhas de cada marcação herdam (o do pai, com o que ele oferece por
    // cima), de cima para baixo; o mais próximo vale e quem não oferece é atravessado.
    const scopes = new Map<string, ProvidedValues>();
    const scopeOf = (parentId: string | null): ProvidedValues =>
      parentId === null ? NO_PROVIDED : (scopes.get(parentId) ?? NO_PROVIDED);
    for (const marking of topDown(p.markings)) {
      const inherited = scopeOf(marking.parentId);
      const mc = markingComponent(p, catalog, marking.id);
      if (mc === null) {
        scopes.set(marking.id, inherited);
        continue;
      }
      const provided = pickProvided(inherited, mc.component);
      const { values, warnings: valueWarnings } = drawingValues(
        p,
        mc.annotation,
        mc.type,
        { ...DEFAULT_LABEL_TEXTS, untitled },
      );
      const childRects =
        findSlot(mc.component) === undefined
          ? []
          : (children.get(marking.id) ?? []).map((c) => c.rect);
      const mode = effectiveDrawingMode(p, marking.containerId);
      const before = entries.get(marking.id);
      if (
        before !== undefined &&
        before.annotationId === mc.annotation.id &&
        before.drawing.layerId === mc.annotation.layerId &&
        before.containerId === marking.containerId &&
        sameRect(before.rect, marking.rect) &&
        before.component === mc.component &&
        before.measure === measure &&
        before.epoch === epoch &&
        before.mode === mode &&
        shallowEqual(before.values, values) &&
        before.valueWarnings.length === valueWarnings.length &&
        before.valueWarnings.every((w, i) => w.text === valueWarnings[i]?.text) &&
        sameRects(before.childRects, childRects) &&
        sameProvided(before.provided, provided)
      ) {
        next.set(marking.id, before);
        drawings.set(marking.id, before.drawing);
        scopes.set(marking.id, extendProvided(inherited, before.offers));
        continue;
      }
      const { drawing, offers } = draw(
        mc,
        marking.id,
        marking.containerId,
        marking.rect,
        values,
        valueWarnings,
        childRects,
        measure,
        mode,
        provided,
      );
      scopes.set(marking.id, extendProvided(inherited, offers));
      next.set(marking.id, {
        markingId: marking.id,
        containerId: marking.containerId,
        annotationId: mc.annotation.id,
        rect: marking.rect,
        component: mc.component,
        values,
        valueWarnings,
        measure,
        epoch,
        mode,
        childRects,
        provided,
        offers,
        drawing,
      });
      drawings.set(marking.id, drawing);
    }
    entries = next;

    // Nada mudou nos desenhos (mesmos objetos, mesma ordem): mantém o mesmo mapa.
    const previous = last?.result;
    let result: ComponentDrawings = drawings.size === 0 ? NO_DRAWINGS : drawings;
    if (previous !== undefined && previous.size === drawings.size) {
      const before = [...previous];
      const same = [...drawings].every(
        ([id, drawing], i) => before[i]?.[0] === id && before[i]?.[1] === drawing,
      );
      if (same) result = previous;
    }
    last = { p, catalog, measure, epoch, untitled, result };
    return result;
  };
}
