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
  /** O desenho calculado para (`shapes`, `zoom`, ponta): pan e quadros iguais o reaproveitam. */
  private strokes: {
    readonly shapes: readonly ArrowShape[];
    readonly zoom: number;
    readonly head: number;
    readonly value: ArrowStrokes;
  } | null = null;

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

  /** O nó do rótulo da seta (`undefined` se ela não tem nome ou não está à vista). */
  label(id: string): LabelNode | undefined {
    return this.labels.get(id);
  }

  render(frame: ArrowsFrame): void {
    const { arrows, tokens } = frame;
    this.zoom = frame.viewport.scale;
    this.shapes = arrows;
    this.tokens = tokens;
    this.renderLabels(frame);
    // O desenho é função de `shapes`, `zoom` e `tokens`, que o Konva não enxerga: quem pede o
    // quadro (`CanvasController`) repinta o stage depois de renderizar.
  }

  destroy(): void {
    this.body.destroy();
    this.labelsGroup.destroy();
    this.labels.clear();
  }

  /**
   * Pinta todas as setas: os halos (traços e pontas), os traços e as pontas, cada passagem num só
   * caminho. A espessura, o halo e a ponta são de tela, divididos pelo zoom.
   */
  paint(painter: ArrowPainter): void {
    const tokens = this.tokens;
    if (!tokens || this.shapes.length === 0) return;
    const zoom = this.zoom;
    const { arrow: style } = tokens;
    const strokes = this.strokesFor(style.head);
    painter.setAttr('lineCap', 'round');
    painter.setAttr('lineJoin', 'round');
    // Halo: o traço mais largo e a ponta com um contorno, na cor do halo.
    painter.beginPath();
    for (const body of strokes.bodies) polyline(painter, body, false);
    painter.setAttr('strokeStyle', tokens.halo);
    painter.setAttr('lineWidth', (style.width + 2 * HALO_WIDTH) / zoom);
    painter.stroke();
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', tokens.halo);
    painter.setAttr('strokeStyle', tokens.halo);
    painter.setAttr('lineWidth', (2 * HALO_WIDTH) / zoom);
    painter.fill();
    painter.stroke();
    // Traço e ponta na cor da seta.
    painter.beginPath();
    for (const body of strokes.bodies) polyline(painter, body, false);
    painter.setAttr('strokeStyle', style.stroke);
    painter.setAttr('lineWidth', style.width / zoom);
    painter.stroke();
    painter.beginPath();
    for (const head of strokes.heads) polyline(painter, head, true);
    painter.setAttr('fillStyle', style.stroke);
    painter.fill();
  }

  /** O desenho das setas atuais no zoom atual (calculado de novo só quando eles mudam). */
  private strokesFor(head: number): ArrowStrokes {
    const cached = this.strokes;
    if (
      cached &&
      cached.shapes === this.shapes &&
      cached.zoom === this.zoom &&
      cached.head === head
    ) {
      return cached.value;
    }
    const value = arrowStrokes(this.shapes, this.zoom, head);
    this.strokes = { shapes: this.shapes, zoom: this.zoom, head, value };
    return value;
  }

  /** Rótulos: um nó por seta com nome, reaproveitado; os das setas que saíram do quadro somem. */
  private renderLabels(frame: ArrowsFrame): void {
    const { arrows, tokens } = frame;
    const zoom = frame.viewport.scale;
    const seen = new Set<string>();
    for (const shape of arrows) {
      const name = shape.arrow.name;
      if (name === null || name === '') continue;
      const id = shape.arrow.id;
      seen.add(id);
      const node = this.labels.get(id) ?? this.createLabel(id);
      if (node.shape === shape && node.zoom === zoom && node.tokens === tokens) continue;
      this.updateLabel(node, shape, name, zoom, tokens);
    }
    for (const [id, node] of this.labels) {
      if (seen.has(id)) continue;
      node.group.destroy();
      this.labels.delete(id);
    }
  }

  private createLabel(id: string): LabelNode {
    const group = new Konva.Group({ listening: false, name: `arrow-label:${id}` });
    const box = new KonvaRect({ listening: false });
    const text = new KonvaText({ listening: false, wrap: 'none', ellipsis: true });
    group.add(box, text);
    this.labelsGroup.add(group);
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
