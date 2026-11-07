// Marcas de chegada (etapa #659, PE3, decisão 8): o selo "Veio de <nome>" sobre cada raiz que chegou
// à Principal e a faixa tracejada "Área de chegada" com o título e o subtítulo. No molde do
// `CommentPinRenderer`: um pool de nós por raiz, tamanho em px de tela (escala inversa do zoom) e os
// nós que sobram destruídos. Cores e fonte só dos tokens; o desenho é do quadro de sempre.
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { t } from '../../i18n';
import type { Rect } from '../../model';
import {
  ARRIVAL_BADGE_HEIGHT,
  arrivalBadgeSpot,
  arrivalBadgeWidth,
  type ArrivalBadge,
} from '../arrivals';
import type { Frame } from '../frame';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Tracejado da faixa e vão entre a faixa e o título (px de tela). */
const BAND_DASH = [6, 4];
const BAND_STROKE = 1.5;
const TITLE_GAP = 4;
const BADGE_RADIUS = 4;

export type ArrivalFrame = Pick<Frame, 'arrivals' | 'tokens' | 'viewport' | 'locale'>;

export interface ArrivalBadgeNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly label: KonvaText;
}

export interface ArrivalBandNode {
  readonly group: Konva.Group;
  readonly box: KonvaRect;
  readonly title: KonvaText;
  readonly hint: KonvaText;
}

function textAttrs(tokens: CanvasTokens, fill: string, weight: number) {
  return {
    wrap: 'none',
    fontSize: tokens.type.name.size,
    fontFamily: tokens.fontFamily,
    fontStyle: fontStyle(weight),
    fill,
  };
}

export class ArrivalRenderer {
  private readonly layer: Konva.Container;
  private readonly badges = new Map<string, ArrivalBadgeNode>();
  readonly band: ArrivalBandNode;

  constructor(layer: Konva.Container) {
    this.layer = layer;
    this.band = {
      group: new Konva.Group({ listening: false, visible: false }),
      box: new KonvaRect({ listening: false }),
      title: new KonvaText({ listening: false }),
      hint: new KonvaText({ listening: false }),
    };
    this.band.group.add(this.band.box, this.band.title, this.band.hint);
    layer.add(this.band.group);
  }

  /** Quantos selos estão desenhados (os testes esperam por ele). */
  get badgeCount(): number {
    return this.badges.size;
  }

  get bandVisible(): boolean {
    return this.band.group.visible();
  }

  badge(root: string): ArrivalBadgeNode | undefined {
    return this.badges.get(root);
  }

  /** Desenha os selos e a faixa do quadro; os selos que sobram são destruídos. */
  render(frame: ArrivalFrame): void {
    const { arrivals, tokens } = frame;
    const zoom = frame.viewport.scale;
    const seen = new Set<string>();
    for (const badge of arrivals?.badges ?? []) {
      seen.add(badge.root);
      this.drawBadge(badge, zoom, tokens);
    }
    for (const [root, node] of this.badges) {
      if (seen.has(root)) continue;
      node.group.destroy();
      this.badges.delete(root);
    }
    this.drawBand(arrivals?.band ?? null, zoom, tokens);
  }

  private badgeFor(root: string): ArrivalBadgeNode {
    let node = this.badges.get(root);
    if (!node) {
      const group = new Konva.Group({ listening: false });
      const box = new KonvaRect({ listening: false });
      const label = new KonvaText({
        listening: false,
        align: 'center',
        verticalAlign: 'middle',
      });
      group.add(box, label);
      this.layer.add(group);
      node = { group, box, label };
      this.badges.set(root, node);
    }
    return node;
  }

  private drawBadge(badge: ArrivalBadge, zoom: number, tokens: CanvasTokens): void {
    const node = this.badgeFor(badge.root);
    const text = t('perspective.canvas.cameFrom', { name: badge.name });
    const width = arrivalBadgeWidth(text);
    const at = arrivalBadgeSpot(badge.rect, zoom, width);
    node.group.setAttrs({ x: at.x, y: at.y, scaleX: 1 / zoom, scaleY: 1 / zoom });
    node.box.setAttrs({
      width,
      height: ARRIVAL_BADGE_HEIGHT,
      cornerRadius: BADGE_RADIUS,
      fill: tokens.badge,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
    });
    node.label.setAttrs({
      ...textAttrs(tokens, tokens.line, tokens.type.name.weight),
      width,
      height: ARRIVAL_BADGE_HEIGHT,
      text,
    });
  }

  private drawBand(band: Rect | null, zoom: number, tokens: CanvasTokens): void {
    const node = this.band;
    node.group.visible(band !== null);
    if (!band) return;
    const line = tokens.type.name.line;
    node.group.setAttrs({ x: band.x, y: band.y });
    node.box.setAttrs({
      width: band.width,
      height: band.height,
      fill: tokens.selectFill,
      stroke: tokens.selectSecondary,
      strokeWidth: BAND_STROKE / zoom,
      dash: BAND_DASH.map((d) => d / zoom),
    });
    // Título e subtítulo ficam acima da faixa, em px de tela.
    const lift = (2 * line + TITLE_GAP) / zoom;
    node.title.setAttrs({
      ...textAttrs(tokens, tokens.text, tokens.type.name.weight),
      text: t('perspective.canvas.arrivalArea'),
      x: 0,
      y: -lift,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
    node.hint.setAttrs({
      ...textAttrs(tokens, tokens.textMuted, 400),
      text: t('perspective.canvas.arrivalAreaHint'),
      x: 0,
      y: -lift + line / zoom,
      scaleX: 1 / zoom,
      scaleY: 1 / zoom,
    });
  }
}
