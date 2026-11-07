// Pinos das conversas (etapa Comentários, CM4): uma pílula por item que hospeda a âncora, com as
// iniciais e o número de mensagens (ou a contagem), a cor do estado mais urgente, o anel do
// selecionado e o ponto da não lida. No molde do `ReviewRenderer`: um pool de nós por chave, o
// tamanho em px de tela (escala inversa do zoom) e os nós que sobram destruídos. Cores e fonte só
// dos tokens; o desenho é do quadro de sempre (sem `requestAnimationFrame` próprio).
import Konva from 'konva/lib/Core';
import { Circle as KonvaCircle } from 'konva/lib/shapes/Circle';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import type { PinColor } from '../../model';
import type { Frame } from '../frame';
import { PIN_HEIGHT, pinBox, pinWidth, type PinPlace } from '../commentPins';
import type { CanvasTokens } from '../theme';
import type { Point } from '../viewport';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Raio do ponto de não lida (px de tela). */
const UNREAD_RADIUS = 4;
const SELECTED_STROKE = 2;
const DRAFT_DASH = [3, 2];
const DRAFT_KEY = 'draft';

export type CommentPinFrame = Pick<
  Frame,
  'pins' | 'pinSelected' | 'draftPin' | 'tokens' | 'viewport'
>;

interface PinNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly label: KonvaText;
  readonly unread: KonvaCircle;
}

function createNode(): PinNode {
  const node: PinNode = {
    group: new Konva.Group({ listening: false }),
    box: new KonvaRect(),
    label: new KonvaText({ wrap: 'none', align: 'center', verticalAlign: 'middle' }),
    unread: new KonvaCircle({ radius: UNREAD_RADIUS }),
  };
  node.group.add(node.box, node.label, node.unread);
  return node;
}

function fillOf(color: PinColor, tokens: CanvasTokens): string {
  if (color === 'awaitingHuman') return tokens.pin.human;
  return color === 'awaitingAgent' ? tokens.pin.agent : tokens.pin.resolved;
}

export class CommentPinRenderer {
  private readonly layer: Konva.Container;
  private readonly nodes = new Map<string, PinNode>();

  constructor(layer: Konva.Container) {
    this.layer = layer;
  }

  /** Quantos pinos estão desenhados (os testes e2e esperam por ele). */
  get size(): number {
    return this.nodes.size;
  }

  node(key: string): PinNode | undefined {
    return this.nodes.get(key);
  }

  /** Desenha os pinos do quadro (e o tracejado do rascunho); os que sobram são destruídos. */
  render(frame: CommentPinFrame): void {
    const { pins, tokens, draftPin } = frame;
    const zoom = frame.viewport.scale;
    const seen = new Set<string>();
    for (const place of pins) {
      seen.add(place.key);
      this.draw(place, frame.pinSelected, zoom, tokens);
    }
    if (draftPin) {
      seen.add(DRAFT_KEY);
      this.drawDraft(draftPin, zoom, tokens);
    }
    for (const [key, node] of this.nodes) {
      if (seen.has(key)) continue;
      node.group.destroy();
      this.nodes.delete(key);
    }
  }

  private nodeFor(key: string): PinNode {
    let node = this.nodes.get(key);
    if (!node) {
      node = createNode();
      this.layer.add(node.group);
      this.nodes.set(key, node);
    }
    return node;
  }

  private draw(
    place: PinPlace,
    selected: string | null,
    zoom: number,
    tokens: CanvasTokens,
  ): void {
    const node = this.nodeFor(place.key);
    const { group } = place;
    const box = pinBox(place, zoom);
    const isSelected = selected !== null && group.threadIds.includes(selected);
    node.group.setAttrs({ x: box.x, y: box.y, scaleX: 1 / zoom, scaleY: 1 / zoom });
    this.paint(node, group.label, fillOf(group.color, tokens), tokens, {
      selected: isSelected,
      dashed: false,
    });
    node.unread.visible(group.hasUnread);
    node.unread.setAttrs({
      x: pinWidth(group.label),
      y: 0,
      fill: tokens.pin.unread,
      stroke: tokens.pin.halo,
      strokeWidth: HALO_WIDTH,
    });
  }

  /** O pino tracejado da conversa nova num ponto (rascunho): nada gravado ainda. */
  private drawDraft(at: Point, zoom: number, tokens: CanvasTokens): void {
    const node = this.nodeFor(DRAFT_KEY);
    const label = '+';
    const width = pinWidth(label) / zoom;
    node.group.setAttrs({
      x: at.x - width / 2,
      y: at.y - PIN_HEIGHT / zoom / 2,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
    this.paint(node, label, tokens.pin.resolved, tokens, {
      selected: true,
      dashed: true,
    });
    node.unread.visible(false);
  }

  private paint(
    node: PinNode,
    label: string,
    fill: string,
    tokens: CanvasTokens,
    style: { readonly selected: boolean; readonly dashed: boolean },
  ): void {
    const width = pinWidth(label);
    node.box.setAttrs({
      width,
      height: PIN_HEIGHT,
      cornerRadius: PIN_HEIGHT / 2,
      fill,
      stroke: style.selected ? tokens.pin.selected : tokens.pin.halo,
      strokeWidth: style.selected ? SELECTED_STROKE : HALO_WIDTH,
      dash: style.dashed ? DRAFT_DASH : [],
    });
    node.label.setAttrs({
      width,
      height: PIN_HEIGHT,
      text: label,
      fontSize: tokens.type.name.size,
      fontFamily: tokens.fontFamily,
      fontStyle: fontStyle(tokens.type.name.weight),
      fill: tokens.pin.text,
    });
  }
}
