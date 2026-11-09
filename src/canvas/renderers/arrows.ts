// Setas (v13, ME4) no canvas: uma camada entre os desenhos dos componentes e as marcações. Todas as
// setas são um só nó do Konva que desenha, em poucas passagens, os halos, os traços (a polilinha ou
// a curva amostrada de `arrowGeometry.ts`) e as pontas: duzentas setas custam o mesmo número de
// operações de pintura que uma, e o zoom não toca nenhum nó (a espessura e a ponta, em px de tela,
// saem do zoom na hora de pintar). Só o rótulo (o `name`, no meio do traço) é um nó por seta, e só
// nas que têm nome. A seleção e as alças ficam na sobreposição (`overlay.ts`): esta camada não
// depende da seleção.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { Frame } from '../frame';
import { arrowStrokes, type ArrowShape, type ArrowStrokes } from '../arrowGeometry';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Recuo interno e largura máxima do rótulo (px de tela). */
const LABEL_PADDING = 4;
const LABEL_MAX_WIDTH = 200;

export type ArrowsFrame = Pick<Frame, 'arrows' | 'tokens' | 'viewport'>;

/** O que um quadro mexeu: a camada das marcações (onde ficam as setas) e/ou o grupo de arrasto. */
export interface ArrowChanges {
  readonly main: boolean;
  readonly drag: boolean;
}

const NO_SHAPES: readonly ArrowShape[] = [];

function sameShapes(a: readonly ArrowShape[], b: readonly ArrowShape[]): boolean {
  return a.length === b.length && a.every((shape, i) => shape === b[i]);
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
  private shapes: readonly ArrowShape[] = [];
  private tokens: CanvasTokens | null = null;
  private zoom = 1;
  private readonly strokes = new StrokeCache();
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
  private readonly dragStrokes = new StrokeCache();
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

  /** As setas desenhadas no último quadro, na ordem do projeto. */
  get drawn(): readonly ArrowShape[] {
    return this.shapes;
  }

  /** Quantas setas estão desenhadas. */
  get size(): number {
    return this.shapes.length;
  }

  /** As setas que se movem num gesto, desenhadas no grupo de arrasto (vazio fora dele). */
  get liftedDrawn(): readonly ArrowShape[] {
    return this.dragShapes;
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
  render(frame: ArrowsFrame): ArrowChanges {
    const { arrows, tokens } = frame;
    const before = { shapes: this.shapes, zoom: this.zoom, tokens: this.tokens };
    this.zoom = frame.viewport.scale;
    this.tokens = tokens;
    const dragging = this.dragIds !== null;
    if (this.dragIds) this.splitShapes(arrows, this.dragIds);
    else {
      this.shapes = arrows;
      this.dragShapes = NO_SHAPES;
    }
    const labelsMain = this.renderLabels(frame);
    // O desenho é função de `shapes`, `zoom` e `tokens`, que o Konva não enxerga: quem pede o
    // quadro (`CanvasController`) repinta a camada depois de renderizar.
    const main =
      !dragging ||
      labelsMain ||
      before.shapes !== this.shapes ||
      before.zoom !== this.zoom ||
      before.tokens !== tokens;
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
    this.paintShapes(painter, this.shapes, this.strokes);
  }

  /** Pinta as setas que se movem (o corpo do grupo de arrasto). */
  paintDragged(painter: ArrowPainter): void {
    this.paintShapes(painter, this.dragShapes, this.dragStrokes);
  }

  private paintShapes(
    painter: ArrowPainter,
    shapes: readonly ArrowShape[],
    cache: StrokeCache,
  ): void {
    const tokens = this.tokens;
    if (!tokens || shapes.length === 0) return;
    const zoom = this.zoom;
    const { arrow: style } = tokens;
    const strokes = cache.get(shapes, zoom, style.head);
    painter.setAttr('lineCap', 'round');
    // Halo: o traço mais largo e a ponta com um contorno, na cor do halo.
    strokeBodies(painter, strokes, tokens.halo, (style.width + 2 * HALO_WIDTH) / zoom);
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', tokens.halo);
    painter.setAttr('strokeStyle', tokens.halo);
    painter.setAttr('lineWidth', (2 * HALO_WIDTH) / zoom);
    painter.fill();
    painter.stroke();
    // Traço e ponta na cor da seta.
    strokeBodies(painter, strokes, style.stroke, style.width / zoom);
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', style.stroke);
    painter.fill();
  }

  /** Separa as setas que se movem das paradas; as paradas mantêm o array se nenhuma mudou. */
  private splitShapes(arrows: readonly ArrowShape[], ids: ReadonlySet<string>): void {
    const parked: ArrowShape[] = [];
    const moving: ArrowShape[] = [];
    for (const shape of arrows) (ids.has(shape.arrow.id) ? moving : parked).push(shape);
    if (!sameShapes(this.shapes, parked)) this.shapes = parked;
    this.dragShapes = moving;
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
  }

  /**
   * Rótulos: um nó por seta com nome, reaproveitado; os das setas que saíram do quadro somem. O da
   * seta que se move fica no grupo de arrasto. Devolve `true` se mexeu num rótulo das paradas.
   */
  private renderLabels(frame: ArrowsFrame): boolean {
    const { arrows, tokens } = frame;
    const zoom = frame.viewport.scale;
    const seen = new Set<string>();
    let main = false;
    for (const shape of arrows) {
      const name = shape.arrow.name;
      if (name === null || name === '') continue;
      seen.add(shape.arrow.id);
      if (this.syncLabel(shape, name, zoom, tokens)) main = true;
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
