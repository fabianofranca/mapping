import { clippedSlotBox, findSlot, slotBoxOfScene } from './components/arrange';
import { intersectClips } from './components/box';
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
import {
  markingComponent,
  type ComponentCatalog,
  type MarkingComponent,
} from './componentCatalog';
import { drawingValues } from './componentValues';
import type { ModelMessage } from './modelMessage';
import { DEFAULT_LABEL_TEXTS } from './refs';
import { effectiveDensity, unitSpaceOf, type UnitSpace } from './density';
import { effectiveDrawingMode } from './drawingMode';
import { topDown } from './hierarchy';
import { projectIndex } from './projectIndex';
import { multiply, type FrameNode, type Matrix } from './components/scene';
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
  /**
   * Cena instanciada na caixa da marcação **em unidades do componente**; a matriz da raiz leva
   * `translate(rect.x, rect.y) · scale(density)`, então o que se desenha sai em pixels da imagem
   * (ou unidades do canvas, onde a densidade é 1).
   */
  readonly root: FrameNode;
  /** Avisos do motor (sem código, em texto) e das referências dos valores (com código). */
  readonly warnings: readonly ModelMessage[];
  /** Não cabe: aviso "conteúdo maior que a caixa" do motor ou filha fora da caixa do slot. */
  readonly overflow: boolean;
  /**
   * Quanto falta (px da imagem) em cada "não cabe", pela mensagem do aviso do motor (em unidades
   * × a densidade); a filha fora do slot entra como `SLOT_OVERFLOW`. Vazio quando cabe ou quando o desenho é em pixels de tela.
   */
  readonly shortfalls: Readonly<Record<string, number>>;
  /**
   * Componente com `screen`: `root` mede o `size` do componente na origem, em pixels de tela, e o
   * canvas o ancora em `anchor` no `rect` (retângulo da marcação, nos pixels da imagem).
   */
  readonly screen?: { readonly anchor: ScreenAnchor; readonly rect: Rect };
  /**
   * Recorte da filha de um slot com `clip` (v4): a caixa do slot da mãe, no mesmo espaço do
   * `root.transform` (pixels da imagem ou unidades do canvas). O desenho só aparece dentro dela.
   */
  readonly clip?: Rect;
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
  /** Densidade do container da marcação (1 no canvas). */
  readonly density: number;
  /** Retângulos das filhas diretas (só containers). */
  readonly childRects: readonly Rect[];
  /** Cor herdada: só os valores oferecidos pelos ancestrais que o componente lê (`$provided`). */
  readonly provided: ProvidedValues;
  /** O que o slot desta marcação oferece às filhas (`provide`), já resolvido. */
  readonly offers: ProvidedValues | undefined;
  /** O recorte que esta marcação impõe às filhas (caixa do slot com `clip`), se houver. */
  readonly slotClip: Rect | undefined;
  /** O recorte que ela recebe da mãe (o `childClip` da mãe, mesmo objeto). */
  readonly clip: Rect | undefined;
  /** O recorte que as filhas recebem: o `slotClip` dentro do `clip` recebido (interseção). */
  readonly childClip: Rect | undefined;
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

/** O retângulo anterior quando é igual ao novo (o canvas compara o recorte por identidade). */
function stableRect(before: Rect | undefined, next: Rect | undefined): Rect | undefined {
  return before !== undefined && next !== undefined && sameRect(before, next)
    ? before
    : next;
}

/** O mesmo desenho com outro recorte da mãe (sem a chave quando não há). */
function withClip(drawing: ComponentDrawing, clip: Rect | undefined): ComponentDrawing {
  const copy: { -readonly [K in keyof ComponentDrawing]: ComponentDrawing[K] } = {
    ...drawing,
  };
  delete copy.clip;
  if (clip !== undefined) copy.clip = clip;
  return copy;
}

/** O que situa o desenho: a âncora de tela (`screen`) ou, senão, o recorte da mãe (`clip`). */
function placement(
  screen: ComponentFile['screen'],
  rect: Rect,
  clip: Rect | undefined,
): Pick<ComponentDrawing, 'screen' | 'clip'> {
  if (screen !== undefined)
    return { screen: { anchor: screen.anchor ?? 'center', rect } };
  return clip === undefined ? {} : { clip };
}

/** A matriz da raiz da cena em unidades: `translate(rect.x, rect.y) · scale(density)`. */
function rootMatrix(rect: Rect, density: number): Matrix {
  return [density, 0, 0, density, rect.x, rect.y];
}

/** Chave de `shortfalls` para a filha que passa da caixa do slot. */
export const SLOT_OVERFLOW = 'conteúdo maior que a caixa: slot';

/** O quanto a pior filha passa da caixa do slot (com a tolerância do arredondamento); 0 = cabe. */
function slotExcess(
  root: FrameNode,
  childRects: readonly Rect[],
  toPixels: (box: Rect) => Rect,
): number {
  const unitBox = slotBoxOfScene(root);
  if (unitBox === undefined) return 0;
  const box = toPixels(unitBox);
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
  space: UnitSpace,
): Record<string, number> {
  const found: Record<string, number> = {};
  for (const w of overflowWarnings) found[w] = (shortfalls[w] ?? 0) * space.density;
  const excess = childRects.length > 0 ? slotExcess(root, childRects, space.toPixels) : 0;
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

/** Os "não cabe" de uma cena instanciada, em pixels da imagem. */
function overflowsOfScene(
  instantiated: ReturnType<typeof instantiate>,
  childRects: readonly Rect[],
  space: UnitSpace,
): Record<string, number> {
  return overflowsOf(
    instantiated.overflowWarnings ?? [],
    instantiated.shortfalls ?? {},
    instantiated.root,
    childRects,
    space,
  );
}

/** O recorte que a caixa do slot impõe às filhas, em pixels da imagem (sem recorte com `screen`). */
function slotClipOf(
  screen: ComponentFile['screen'],
  root: FrameNode,
  space: UnitSpace,
): Rect | undefined {
  const unitClip = screen === undefined ? clippedSlotBox(root) : undefined;
  return unitClip === undefined ? undefined : space.toPixels(unitClip);
}

/** A cena com a escala da densidade na raiz; com densidade 1 a própria cena (já em pixels). */
function withRootMatrix(root: FrameNode, rect: Rect, density: number): FrameNode {
  return density === 1
    ? root
    : { ...root, transform: multiply(rootMatrix(rect, density), root.transform) };
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
  clip: Rect | undefined,
  density: number,
): {
  drawing: ComponentDrawing;
  offers: ProvidedValues | undefined;
  slotClip: Rect | undefined;
} {
  const tokens =
    mode === undefined ? undefined : mc.component.resolvedTokensByMode?.[mode];
  const screen = mc.component.screen;
  // Em pixels de tela o desenho mede o `size` do componente, na origem (o canvas o ancora) e não
  // escala com a densidade, como não escala com o zoom.
  const space = unitSpaceOf(rect, screen === undefined ? density : 1);
  const box: Rect =
    screen === undefined ? space.box : { x: 0, y: 0, ...mc.component.size };
  const instantiated = instantiate(
    mc.component,
    values,
    box,
    instantiateOptions(markingId, measure, tokens, provided),
  );
  const { messages, provides } = instantiated;
  // Com `screen` o desenho pode passar do retângulo da marcação: não há pendência "não cabe".
  const found =
    screen === undefined ? overflowsOfScene(instantiated, childRects, space) : {};
  const root = withRootMatrix(instantiated.root, rect, space.density);
  const drawing: ComponentDrawing = {
    markingId,
    containerId,
    annotationId: mc.annotation.id,
    layerId: mc.annotation.layerId,
    root,
    warnings: [...messages, ...valueWarnings],
    overflow: Object.keys(found).length > 0,
    shortfalls: found,
    ...placement(screen, rect, clip),
  };
  // Com `screen` a cena está na origem (pixels de tela): a caixa do slot não está no espaço das filhas.
  const slotClip = slotClipOf(screen, instantiated.root, space);
  return { drawing, offers: provides, slotClip };
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
    // Recorte das filhas de cada marcação: a caixa do slot com `clip` dentro do recorte que a
    // própria marcação recebe (o recorte desce às netas).
    const clips = new Map<string, Rect | undefined>();
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
      const clip =
        marking.parentId === null || mc.component.screen !== undefined
          ? undefined
          : clips.get(marking.parentId);
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
      const density = effectiveDensity(p, marking.containerId);
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
        before.density === density &&
        shallowEqual(before.values, values) &&
        before.valueWarnings.length === valueWarnings.length &&
        before.valueWarnings.every((w, i) => w.text === valueWarnings[i]?.text) &&
        sameRects(before.childRects, childRects) &&
        sameProvided(before.provided, provided)
      ) {
        const kept =
          before.clip === clip
            ? before
            : {
                ...before,
                clip,
                childClip: stableRect(
                  before.childClip,
                  intersectClips(before.slotClip, clip),
                ),
                drawing: withClip(before.drawing, clip),
              };
        next.set(marking.id, kept);
        drawings.set(marking.id, kept.drawing);
        scopes.set(marking.id, extendProvided(inherited, before.offers));
        clips.set(marking.id, kept.childClip);
        continue;
      }
      const { drawing, offers, slotClip } = draw(
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
        clip,
        density,
      );
      const stableClip = stableRect(before?.slotClip, slotClip);
      const childClip = stableRect(before?.childClip, intersectClips(stableClip, clip));
      clips.set(marking.id, childClip);
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
        density,
        childRects,
        provided,
        offers,
        slotClip: stableClip,
        clip,
        childClip,
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
