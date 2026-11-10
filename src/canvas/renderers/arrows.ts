// Setas (v13, ME4) no canvas: uma camada entre os desenhos dos componentes e as marcações. Todas as
// setas são um só nó do Konva que desenha, em poucas passagens, os halos, os traços (a polilinha ou
// a curva amostrada de `arrowGeometry.ts`) e as pontas: duzentas setas custam o mesmo número de
// operações de pintura que uma, e o zoom não toca nenhum nó (a espessura e a ponta, em px de tela,
// saem do zoom na hora de pintar). Só o rótulo (o `name`, no meio do traço) é um nó por seta, e só
// nas que têm nome e estão inteiras. De longe a seta curta é só o traço e a que liga marcações
// invisíveis some (`arrowDetail.ts`); a fora da área visível não é pintada. A seleção e o mouse só
// entram no nível de detalhe (a selecionada e as ligadas ao que se seleciona ficam inteiras); o
// realce e as alças ficam na sobreposição (`overlay.ts`).
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { projectIndex, type Placement, type Rect } from '../../model';
import { visibleArea, type Frame } from '../frame';
import {
  arrowPathLength,
  arrowStrokes,
  type ArrowShape,
  type ArrowStrokes,
} from '../arrowGeometry';
import { placementOfSpace } from '../markingGeometry';
import type { CanvasTokens } from '../theme';
import { arrowDetail, type ArrowEnd } from './arrowDetail';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Recuo interno e largura máxima do rótulo (px de tela). */
const LABEL_PADDING = 4;
const LABEL_MAX_WIDTH = 200;

/** O que o nível de detalhe lê do quadro: o zoom e a área visível, a seleção, o mouse e a revisão. */
export type ArrowsFrame = Pick<
  Frame,
  | 'arrows'
  | 'tokens'
  | 'viewport'
  | 'size'
  | 'project'
  | 'selection'
  | 'items'
  | 'hoverMarking'
  | 'review'
  | 'view'
>;

/** O que um quadro mexeu: a camada das marcações (onde ficam as setas) e/ou o grupo de arrasto. */
export interface ArrowChanges {
  readonly main: boolean;
  readonly drag: boolean;
}

const NO_SHAPES: readonly ArrowShape[] = [];
const NO_PLACEMENTS: ReadonlyMap<string, Placement> = new Map();
const NO_STROKES: ArrowStrokes = { bodies: [], corners: [], heads: [] };

function sameShapes(a: readonly ArrowShape[], b: readonly ArrowShape[]): boolean {
  return a.length === b.length && a.every((shape, i) => shape === b[i]);
}

/** As setas pintadas num quadro: as inteiras e as só com o traço. */
interface DetailSplit {
  readonly full: readonly ArrowShape[];
  readonly thin: readonly ArrowShape[];
}
const NO_SPLIT: DetailSplit = { full: NO_SHAPES, thin: NO_SHAPES };

/**
 * O tamanho de uma ponta com o zoom em 1 (o da tela é ele × o zoom; infinito sem posição: sem
 * dado, a ponta conta como visível).
 */
interface EndSize {
  readonly width: number;
  readonly height: number;
}

/** O que da seta só muda com o projeto, as posições e o tema (pan, zoom e seleção não mexem). */
interface Measured {
  readonly shape: ArrowShape;
  /** Comprimento do traço (unidades do canvas). */
  readonly length: number;
  readonly from: EndSize;
  readonly to: EndSize;
}

const UNKNOWN_END: EndSize = {
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

/** Os itens que deixam a seta inteira: setas selecionadas e marcações selecionadas ou sob o mouse. */
interface Exceptions {
  readonly arrows: ReadonlySet<string>;
  readonly markings: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

function exceptionsOf(frame: ArrowsFrame): Exceptions {
  // No modo visualização não há seleção nem mouse: vale só o tamanho.
  if (frame.view !== null) return { arrows: NO_IDS, markings: NO_IDS };
  const arrows = new Set<string>();
  const markings = new Set<string>();
  for (const item of [...frame.items, frame.selection]) {
    if (item?.kind === 'arrow') arrows.add(item.id);
    else if (item?.kind === 'marking') markings.add(item.id);
  }
  if (frame.hoverMarking !== null) markings.add(frame.hoverMarking);
  return { arrows, markings };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/** A área visível com a folga do rótulo (o maior pedaço da seta que pode sobrar da caixa do traço). */
function paddedArea(frame: ArrowsFrame): Rect {
  const area = visibleArea(frame.size, frame.viewport);
  const margin = LABEL_MAX_WIDTH / frame.viewport.scale;
  return {
    x: area.x - margin,
    y: area.y - margin,
    width: area.width + 2 * margin,
    height: area.height + 2 * margin,
  };
}

/**
 * O nível de detalhe das setas (decisão 7 da etapa canvas-desempenho): a medida de cada seta fica
 * guardada até o projeto, as posições ou o tema mudarem, e cada quadro só confere o zoom, a área
 * visível e as exceções (seleção e mouse). Os arrays se repetem enquanto as setas pintadas forem
 * as mesmas, para o desenho dos traços e dos halos não ser refeito.
 */
class DetailPlan {
  private measured: {
    readonly arrows: readonly ArrowShape[];
    readonly project: ArrowsFrame['project'];
    readonly placements: ReadonlyMap<string, Placement>;
    readonly tokens: CanvasTokens;
    readonly value: readonly Measured[];
  } | null = null;
  private last: DetailSplit = NO_SPLIT;

  classify(frame: ArrowsFrame, placements: ReadonlyMap<string, Placement>): DetailSplit {
    const measured = this.measure(frame, placements);
    const zoom = frame.viewport.scale;
    const area = paddedArea(frame);
    const { arrows, markings } = exceptionsOf(frame);
    const marks = frame.view === null ? frame.review?.markings : undefined;
    const { lodMinMarking: minFull, lodHideMarking: hide } = frame.tokens;
    const always = (id: string) => markings.has(id) || marks?.has(id) === true;
    const full: ArrowShape[] = [];
    const thin: ArrowShape[] = [];
    for (const item of measured) {
      const { shape } = item;
      if (!overlaps(shape.bounds, area)) continue;
      const detail = arrowDetail({
        screenLength: item.length * zoom,
        always: arrows.has(shape.arrow.id),
        from: onScreen(item.from, zoom, always(shape.arrow.from)),
        to: onScreen(item.to, zoom, always(shape.arrow.to)),
        minFull,
        hide,
      });
      if (detail === 'full') full.push(shape);
      else if (detail === 'thin') thin.push(shape);
    }
    return this.keep(full, thin);
  }

  private keep(full: ArrowShape[], thin: ArrowShape[]): DetailSplit {
    const previous = this.last;
    const next: DetailSplit = {
      full: sameShapes(previous.full, full) ? previous.full : full,
      thin: sameShapes(previous.thin, thin) ? previous.thin : thin,
    };
    const same = next.full === previous.full && next.thin === previous.thin;
    this.last = same ? previous : next;
    return this.last;
  }

  private measure(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement>,
  ): readonly Measured[] {
    const { arrows, project, tokens } = frame;
    const cached = this.measured;
    if (
      cached &&
      cached.arrows === arrows &&
      cached.project === project &&
      cached.placements === placements &&
      cached.tokens === tokens
    ) {
      return cached.value;
    }
    const value = measureArrows(frame, placements);
    this.measured = { arrows, project, placements, tokens, value };
    return value;
  }
}

/** O tamanho na tela da marcação que a ponta liga. */
function endSize(
  frame: ArrowsFrame,
  placements: ReadonlyMap<string, Placement>,
  id: string,
): EndSize {
  const marking = frame.project
    ? projectIndex(frame.project).markings.get(id)
    : undefined;
  const placement = marking
    ? placementOfSpace(placements, marking.containerId)
    : undefined;
  if (!marking || !placement) return UNKNOWN_END;
  return {
    width: marking.rect.width * placement.scale,
    height: marking.rect.height * placement.scale,
  };
}

/** A ponta com o tamanho na tela no zoom `zoom`. */
function onScreen(end: EndSize, zoom: number, always: boolean): ArrowEnd {
  return { screenWidth: end.width * zoom, screenHeight: end.height * zoom, always };
}

function measureArrows(
  frame: ArrowsFrame,
  placements: ReadonlyMap<string, Placement>,
): readonly Measured[] {
  return frame.arrows.map((shape) => ({
    shape,
    length: arrowPathLength(shape),
    from: endSize(frame, placements, shape.arrow.from),
    to: endSize(frame, placements, shape.arrow.to),
  }));
}

/** Separa `shapes` entre as que se movem (`ids`) e as paradas. */
function splitMoving(
  shapes: readonly ArrowShape[],
  ids: ReadonlySet<string>,
): { parked: ArrowShape[]; moving: ArrowShape[] } {
  const parked: ArrowShape[] = [];
  const moving: ArrowShape[] = [];
  for (const shape of shapes) (ids.has(shape.arrow.id) ? moving : parked).push(shape);
  return { parked, moving };
}

/** Os corpos de `a` e de `b` juntos, na mesma passagem do traço (o mesmo objeto enquanto os dois forem). */
class BodiesMerge {
  private entry: {
    readonly a: ArrowStrokes;
    readonly b: ArrowStrokes;
    readonly value: ArrowStrokes;
  } | null = null;

  get(a: ArrowStrokes, b: ArrowStrokes): ArrowStrokes {
    if (b.bodies.length === 0 && b.corners.length === 0) return a;
    const cached = this.entry;
    if (cached && cached.a === a && cached.b === b) return cached.value;
    const value: ArrowStrokes = {
      bodies: [...a.bodies, ...b.bodies],
      corners: [...a.corners, ...b.corners],
      heads: a.heads,
    };
    this.entry = { a, b, value };
    return value;
  }
}

/** O desenho calculado para (`shapes`, `zoom`, ponta): quadros iguais o reaproveitam. */
class StrokeCache {
  private entry: {
    readonly shapes: readonly ArrowShape[];
    readonly zoom: number;
    readonly head: number;
    readonly value: ArrowStrokes;
  } | null = null;

  get(shapes: readonly ArrowShape[], zoom: number, head: number): ArrowStrokes {
    const cached = this.entry;
    if (
      cached &&
      cached.shapes === shapes &&
      cached.zoom === zoom &&
      cached.head === head
    ) {
      return cached.value;
    }
    const value = arrowStrokes(shapes, zoom, head);
    this.entry = { shapes, zoom, head, value };
    return value;
  }
}

/** As operações de pintura que o desenho usa (o contexto do Konva as tem; os testes gravam). */
export interface ArrowPainter {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  setAttr(attr: string, value: unknown): void;
}

interface LabelNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly text: KonvaText;
  /** O que o nó mostra: iguais ao quadro, ele já está certo. */
  shape: ArrowShape | null;
  zoom: number;
  tokens: CanvasTokens | null;
}

export class ArrowRenderer {
  private readonly body: Konva.Shape;
  private readonly labelsGroup = new Konva.Group({ listening: false });
  private readonly labels = new Map<string, LabelNode>();
  /** As setas inteiras (paradas) e as só com o traço, escolhidas pelo `DetailPlan`. */
  private shapes: readonly ArrowShape[] = [];
  private thinShapes: readonly ArrowShape[] = NO_SHAPES;
  private tokens: CanvasTokens | null = null;
  private zoom = 1;
  private readonly plan = new DetailPlan();
  private readonly strokes = new StrokeCache();
  private readonly thinStrokes = new StrokeCache();
  private readonly merge = new BodiesMerge();
  private readonly dragMerge = new BodiesMerge();
  /**
   * As setas que se movem num gesto (decisões 5 e 7): têm um corpo e um grupo de rótulos próprios,
   * no grupo de arrasto, e `shapes` fica só com as paradas (o mesmo array enquanto elas não mudam,
   * então o corpo das paradas não é refeito nem repintado).
   */
  private dragIds: ReadonlySet<string> | null = null;
  private dragGroup: Konva.Group | null = null;
  private dragBody: Konva.Shape | null = null;
  private dragLabels: Konva.Group | null = null;
  private dragShapes: readonly ArrowShape[] = NO_SHAPES;
  private dragThin: readonly ArrowShape[] = NO_SHAPES;
  private readonly dragStrokes = new StrokeCache();
  private readonly dragThinStrokes = new StrokeCache();
  private wasDragging = false;

  constructor(parent: Konva.Container) {
    this.body = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => this.paint(context),
    });
    parent.add(this.body, this.labelsGroup);
  }

  /** O nó que pinta as setas. */
  get node(): Konva.Shape {
    return this.body;
  }

  /** As setas pintadas no último quadro (inteiras e depois as só com o traço), fora o grupo de arrasto. */
  get drawn(): readonly ArrowShape[] {
    return this.thinShapes.length === 0
      ? this.shapes
      : [...this.shapes, ...this.thinShapes];
  }

  /** As setas curtas do último quadro, pintadas só com o traço (sem halo, ponta nem rótulo). */
  get thin(): readonly ArrowShape[] {
    return this.thinShapes;
  }

  /** Quantas setas estão pintadas (fora o grupo de arrasto). */
  get size(): number {
    return this.shapes.length + this.thinShapes.length;
  }

  /** Quantas setas estão pintadas, contando as do grupo de arrasto (o `data-arrows`). */
  get painted(): number {
    return this.size + this.dragShapes.length + this.dragThin.length;
  }

  /** As setas que se movem num gesto, desenhadas no grupo de arrasto (vazio fora dele). */
  get liftedDrawn(): readonly ArrowShape[] {
    return this.dragThin.length === 0
      ? this.dragShapes
      : [...this.dragShapes, ...this.dragThin];
  }

  /** O nó do rótulo da seta (`undefined` se ela não tem nome ou não está à vista). */
  label(id: string): LabelNode | undefined {
    return this.labels.get(id);
  }

  /**
   * Leva as setas de `ids` para o grupo de arrasto no próximo `render` (o corpo e os rótulos delas
   * saem do desenho das paradas), ou as devolve com `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    const next = ids && ids.size > 0 ? ids : null;
    if (next && !this.dragGroup) this.mountDragGroup(target);
    if (!next && this.dragGroup) this.unmountDragGroup();
    this.dragIds = next;
  }

  /**
   * Refaz os rótulos e guarda o que as passagens de pintura desenham. Devolve o que mexeu: com um
   * gesto em andamento, a camada das paradas só quando as setas paradas, o zoom ou o tema mudam.
   */
  render(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement> = NO_PLACEMENTS,
  ): ArrowChanges {
    const { tokens } = frame;
    const restyled = this.zoom !== frame.viewport.scale || this.tokens !== tokens;
    this.zoom = frame.viewport.scale;
    this.tokens = tokens;
    return this.update(frame, placements, restyled);
  }

  /**
   * Pan (e posições novas): o zoom e o tema são os mesmos, então só se confere quais setas estão na
   * área visível e de que nível de detalhe, sem tocar no resto.
   */
  reveal(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement> = NO_PLACEMENTS,
  ): ArrowChanges {
    return this.update(frame, placements, false);
  }

  private update(
    frame: ArrowsFrame,
    placements: ReadonlyMap<string, Placement>,
    restyled: boolean,
  ): ArrowChanges {
    const before = { shapes: this.shapes, thin: this.thinShapes };
    const dragging = this.dragIds !== null;
    this.place(this.plan.classify(frame, placements));
    const labelsMain = this.renderLabels(frame.tokens);
    // O desenho é função de `shapes`, `zoom` e `tokens`, que o Konva não enxerga: quem pede o
    // quadro (`CanvasController`) repinta a camada depois de renderizar.
    const main =
      labelsMain ||
      restyled ||
      before.shapes !== this.shapes ||
      before.thin !== this.thinShapes;
    const drag = dragging || this.wasDragging;
    this.wasDragging = dragging;
    return { main, drag };
  }

  destroy(): void {
    this.body.destroy();
    this.labelsGroup.destroy();
    this.dragGroup?.destroy();
    this.dragGroup = null;
    this.labels.clear();
  }

  /**
   * Pinta todas as setas: os halos (traços e pontas), os traços e as pontas, cada passagem num só
   * caminho. A espessura, o halo e a ponta são de tela, divididos pelo zoom.
   */
  paint(painter: ArrowPainter): void {
    this.paintShapes(painter, this.shapes, this.thinShapes, {
      full: this.strokes,
      thin: this.thinStrokes,
      merge: this.merge,
    });
  }

  /** Pinta as setas que se movem (o corpo do grupo de arrasto). */
  paintDragged(painter: ArrowPainter): void {
    this.paintShapes(painter, this.dragShapes, this.dragThin, {
      full: this.dragStrokes,
      thin: this.dragThinStrokes,
      merge: this.dragMerge,
    });
  }

  /**
   * As inteiras levam halo, traço e ponta; as curtas (`thin`) só entram na passagem do traço,
   * junto com os corpos das inteiras: sem halo e sem ponta.
   */
  private paintShapes(
    painter: ArrowPainter,
    shapes: readonly ArrowShape[],
    thin: readonly ArrowShape[],
    caches: { full: StrokeCache; thin: StrokeCache; merge: BodiesMerge },
  ): void {
    const tokens = this.tokens;
    if (!tokens || (shapes.length === 0 && thin.length === 0)) return;
    const zoom = this.zoom;
    const { arrow: style } = tokens;
    const strokes =
      shapes.length > 0 ? caches.full.get(shapes, zoom, style.head) : NO_STROKES;
    const slim = thin.length > 0 ? caches.thin.get(thin, zoom, 0) : NO_STROKES;
    painter.setAttr('lineCap', 'round');
    if (shapes.length > 0) {
      // Halo: o traço mais largo e a ponta com um contorno, na cor do halo.
      strokeBodies(painter, strokes, tokens.halo, (style.width + 2 * HALO_WIDTH) / zoom);
      painter.beginPath();
      for (const head of strokes.heads) polyline(painter, head, true);
      painter.setAttr('fillStyle', tokens.halo);
      painter.setAttr('strokeStyle', tokens.halo);
      painter.setAttr('lineWidth', (2 * HALO_WIDTH) / zoom);
      painter.fill();
      painter.stroke();
    }
    // Traço (das inteiras e das curtas) e ponta na cor da seta.
    strokeBodies(
      painter,
      caches.merge.get(strokes, slim),
      style.stroke,
      style.width / zoom,
    );
    if (shapes.length === 0) return;
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', style.stroke);
    painter.fill();
  }

  /** Guarda as setas pintadas; as paradas mantêm o array se nenhuma mudou. */
  private place(detail: DetailSplit): void {
    const ids = this.dragIds;
    if (!ids) {
      this.shapes = detail.full;
      this.thinShapes = detail.thin;
      this.dragShapes = NO_SHAPES;
      this.dragThin = NO_SHAPES;
      return;
    }
    const full = splitMoving(detail.full, ids);
    const thin = splitMoving(detail.thin, ids);
    if (!sameShapes(this.shapes, full.parked)) this.shapes = full.parked;
    if (!sameShapes(this.thinShapes, thin.parked)) this.thinShapes = thin.parked;
    this.dragShapes = full.moving;
    this.dragThin = thin.moving;
  }

  private mountDragGroup(target: Konva.Container): void {
    const group = new Konva.Group({ listening: false });
    this.dragBody = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => this.paintDragged(context),
    });
    this.dragLabels = new Konva.Group({ listening: false });
    group.add(this.dragBody, this.dragLabels);
    target.add(group);
    this.dragGroup = group;
  }

  /** Devolve os rótulos ao grupo de sempre e desfaz o grupo de arrasto. */
  private unmountDragGroup(): void {
    for (const node of this.labels.values()) {
      if (node.group.getParent() === this.dragLabels) this.labelsGroup.add(node.group);
    }
    this.dragGroup?.destroy();
    this.dragGroup = null;
    this.dragBody = null;
    this.dragLabels = null;
    this.dragShapes = NO_SHAPES;
    this.dragThin = NO_SHAPES;
  }

  /**
   * Rótulos: um nó por seta com nome, reaproveitado; os das setas que saíram do quadro somem. O da
   * seta que se move fica no grupo de arrasto. Devolve `true` se mexeu num rótulo das paradas.
   */
  private renderLabels(tokens: CanvasTokens): boolean {
    const zoom = this.zoom;
    const seen = new Set<string>();
    let main = false;
    // Só as inteiras têm rótulo (as curtas e as que somem não).
    for (const shapes of [this.shapes, this.dragShapes]) {
      for (const shape of shapes) {
        const name = shape.arrow.name;
        if (name === null || name === '') continue;
        seen.add(shape.arrow.id);
        if (this.syncLabel(shape, name, zoom, tokens)) main = true;
      }
    }
    for (const [id, node] of this.labels) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.labels.delete(id);
      main = true;
    }
    return main;
  }

  /** O grupo do rótulo: o de arrasto se a seta se move, senão o de sempre. */
  private labelHome(id: string): Konva.Group {
    const lifted = this.dragIds?.has(id) === true;
    return lifted && this.dragLabels ? this.dragLabels : this.labelsGroup;
  }

  /** Põe o rótulo da seta no grupo certo e o refaz se mudou. `true` se mexeu num rótulo das paradas. */
  private syncLabel(
    shape: ArrowShape,
    name: string,
    zoom: number,
    tokens: CanvasTokens,
  ): boolean {
    const id = shape.arrow.id;
    const home = this.labelHome(id);
    const node = this.labels.get(id) ?? this.createLabel(id, home);
    const moved = node.group.getParent() !== home;
    if (moved) node.group.moveTo(home);
    const same = node.shape === shape && node.zoom === zoom && node.tokens === tokens;
    if (!same) this.updateLabel(node, shape, name, zoom, tokens);
    return moved || (!same && home === this.labelsGroup);
  }

  private createLabel(id: string, home: Konva.Group): LabelNode {
    const group = new Konva.Group({ listening: false, name: `arrow-label:${id}` });
    const box = new KonvaRect({ listening: false });
    const text = new KonvaText({ listening: false, wrap: 'none', ellipsis: true });
    group.add(box, text);
    home.add(group);
    const node: LabelNode = { group, box, text, shape: null, zoom: 0, tokens: null };
    this.labels.set(id, node);
    return node;
  }

  /** Rótulo no meio do traço, centrado, em tamanho de tela. */
  private updateLabel(
    node: LabelNode,
    shape: ArrowShape,
    name: string,
    zoom: number,
    tokens: CanvasTokens,
  ): void {
    const { size, line, weight } = tokens.type.name;
    const height = line + 2 * HALO_WIDTH;
    node.text.setAttrs({
      text: name,
      fontSize: size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(weight),
      fill: tokens.arrow.label,
      x: LABEL_PADDING,
      y: (height - size) / 2,
      width: undefined,
    });
    const width = Math.min(node.text.width() + 2 * LABEL_PADDING, LABEL_MAX_WIDTH);
    node.text.width(width - 2 * LABEL_PADDING);
    node.text.height(size);
    node.box.setAttrs({
      width,
      height,
      fill: tokens.arrow.labelBg,
      stroke: tokens.arrow.stroke,
      strokeWidth: HALO_WIDTH,
      cornerRadius: tokens.radius.sm,
    });
    node.group.setAttrs({
      x: shape.label.x - width / 2 / zoom,
      y: shape.label.y - height / 2 / zoom,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
    node.shape = shape;
    node.zoom = zoom;
    node.tokens = tokens;
  }
}

/**
 * Traça os corpos das setas numa cor e espessura: o traço com junção redonda (reta e curva) e,
 * depois, o das setas `elbow` com junção em esquadro, para a dobra sair viva. Deixa a junção
 * redonda ao fim (a das pontas).
 */
function strokeBodies(
  painter: ArrowPainter,
  strokes: ArrowStrokes,
  color: string,
  width: number,
): void {
  painter.setAttr('lineJoin', 'round');
  painter.beginPath();
  for (const body of strokes.bodies) polyline(painter, body, false);
  painter.setAttr('strokeStyle', color);
  painter.setAttr('lineWidth', width);
  painter.stroke();
  if (strokes.corners.length === 0) return;
  painter.setAttr('lineJoin', 'miter');
  painter.beginPath();
  for (const body of strokes.corners) polyline(painter, body, false);
  painter.setAttr('strokeStyle', color);
  painter.setAttr('lineWidth', width);
  painter.stroke();
  painter.setAttr('lineJoin', 'round');
}

/** Acrescenta ao caminho a lista plana de pontos (`closed` fecha o triângulo da ponta). */
function polyline(painter: ArrowPainter, flat: readonly number[], closed: boolean): void {
  const x0 = flat[0];
  const y0 = flat[1];
  if (x0 === undefined || y0 === undefined) return;
  painter.moveTo(x0, y0);
  for (let i = 2; i + 1 < flat.length; i += 2) {
    painter.lineTo(flat[i] as number, flat[i + 1] as number);
  }
  // Um ponto só (seta menor que a ponta): um ponto redondo, para o traço não sumir.
  if (flat.length === 2) painter.lineTo(x0, y0);
  if (closed) painter.closePath();
}
