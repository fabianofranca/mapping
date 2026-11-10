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
  arrivalBadgeSpot,
  arrivalBadgeWidth,
  arrivalBandLabelFit,
  arrivalBandLabelSpot,
  type ArrivalBadge,
  type ArrivalRoot,
} from '../arrivals';
import { visibleArea, type Frame } from '../frame';
import type { CanvasTokens } from '../theme';
import { HALO_WIDTH, fontStyle } from './metrics';

/** Tracejado da faixa e vão entre a faixa e o título (px de tela). */
const BAND_DASH = [6, 4];
const BAND_STROKE = 1.5;
const TITLE_GAP = 4;
const BADGE_RADIUS = 4;

export type ArrivalFrame = Pick<
  Frame,
  'arrivals' | 'tokens' | 'viewport' | 'locale' | 'size'
>;

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

/** `box` (px de tela, relativo ao canto do canvas) em unidades do canvas; `undefined` se vazio. */
function screenToCanvasRect(
  box: Rect,
  { x, y, scale }: Frame['viewport'],
): Rect | undefined {
  if (box.width === 0 || box.height === 0) return undefined;
  return {
    x: (box.x - x) / scale,
    y: (box.y - y) / scale,
    width: box.width / scale,
    height: box.height / scale,
  };
}

export class ArrivalRenderer {
  private readonly layer: Konva.Container;
  private readonly badges = new Map<string, ArrivalBadgeNode>();
  readonly band: ArrivalBandNode;
  /**
   * Retângulo do minimapa (HTML sobre o canvas) em px de tela, relativo ao canvas: guardado e
   * refeito só quando o canvas ou o próprio minimapa mudam de tamanho (nada de `querySelector`
   * nem `getBoundingClientRect` por quadro, que forçam o layout).
   */
  private minimapBox: Rect | undefined;
  private minimapStale = true;
  private measuredSize: Frame['size'] | null = null;
  private watched: Element | null = null;
  private watcher: ResizeObserver | null = null;
  /** Avisa quem desenha que o minimapa mudou de tamanho: o selo precisa de um quadro novo. */
  private readonly onMinimapResize: (() => void) | undefined;

  constructor(layer: Konva.Container, onMinimapResize?: () => void) {
    this.layer = layer;
    this.onMinimapResize = onMinimapResize;
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

  /** Desenha a faixa e os selos do quadro; os selos que sobram são destruídos. */
  render(frame: ArrivalFrame): void {
    const { arrivals, tokens } = frame;
    const zoom = frame.viewport.scale;
    const view = visibleArea(frame.size, frame.viewport);
    const avoid = this.minimapArea(frame);
    // A faixa primeiro: o título dela (que muda de lado com a vista) é um lugar a evitar.
    const label = this.drawBand(arrivals?.band ?? null, zoom, tokens, view);
    const seen = new Set<string>();
    for (const badge of arrivals?.badges ?? []) {
      seen.add(badge.root);
      this.drawBadge(badge, zoom, tokens, view, avoid, arrivals?.roots, label);
    }
    for (const [root, node] of this.badges) {
      if (seen.has(root)) continue;
      node.group.destroy();
      this.badges.delete(root);
    }
  }

  /** O minimapa (HTML sobre o canvas) em unidades do canvas, ou `undefined` sem ele. */
  private minimapArea(frame: ArrivalFrame): Rect | undefined {
    if (!frame.arrivals?.badges.length) return undefined;
    if (this.measuredSize !== frame.size) {
      this.measuredSize = frame.size;
      this.minimapStale = true;
    }
    if (this.minimapStale || (this.watched === null && this.minimapBox === undefined)) {
      this.measureMinimap();
    }
    return this.minimapBox && screenToCanvasRect(this.minimapBox, frame.viewport);
  }

  private measureMinimap(): void {
    this.minimapStale = false;
    const host = this.layer.getStage()?.container();
    const map = host?.parentElement?.querySelector('.minimap') ?? null;
    this.watch(map);
    if (!host || !map) {
      this.minimapBox = undefined;
      return;
    }
    const origin = host.getBoundingClientRect();
    const box = map.getBoundingClientRect();
    this.minimapBox = {
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    };
  }

  /** Acompanha o tamanho do elemento do minimapa: ele cresce e encolhe com a vista. */
  private watch(map: Element | null): void {
    if (map === this.watched) return;
    this.watcher?.disconnect();
    this.watched = map;
    if (!map || typeof ResizeObserver === 'undefined') return;
    this.watcher ??= new ResizeObserver(() => {
      this.minimapStale = true;
      this.onMinimapResize?.();
    });
    this.watcher.observe(map);
  }

  /** Solta o acompanhamento do minimapa. */
  destroy(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.watched = null;
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

  private drawBadge(
    badge: ArrivalBadge,
    zoom: number,
    tokens: CanvasTokens,
    view: Rect,
    avoid: Rect | undefined,
    roots: readonly ArrivalRoot[] | undefined,
    label: Rect | null,
  ): void {
    const node = this.badgeFor(badge.root);
    const text = t('perspective.canvas.cameFrom', { name: badge.name });
    // A fonte do token entra antes de medir: o primeiro desenho mediria com a fonte padrão.
    node.label.setAttrs({
      ...textAttrs(tokens, tokens.line, tokens.type.name.weight),
      text,
    });
    // O texto medido pode passar da estimativa (letras largas): o selo cresce com ele.
    const width = Math.max(
      arrivalBadgeWidth(text, tokens.arrival),
      node.label.getTextWidth() + 2 * tokens.arrival.pad,
    );
    const at = arrivalBadgeSpot(
      badge.rect,
      zoom,
      width,
      tokens.arrival,
      view,
      avoid,
      roots,
      badge.root,
      label ? [label] : [],
    );
    node.group.setAttrs({ x: at.x, y: at.y, scaleX: 1 / zoom, scaleY: 1 / zoom });
    node.box.setAttrs({
      width,
      height: tokens.arrival.height,
      cornerRadius: BADGE_RADIUS,
      fill: tokens.badge,
      stroke: tokens.halo,
      strokeWidth: HALO_WIDTH,
    });
    node.label.setAttrs({
      ...textAttrs(tokens, tokens.line, tokens.type.name.weight),
      width,
      height: tokens.arrival.height,
      text,
    });
  }

  /** Desenha a faixa e devolve o retângulo do título dela (canvas), ou `null` sem faixa. */
  private drawBand(
    band: Rect | null,
    zoom: number,
    tokens: CanvasTokens,
    view: Rect,
  ): Rect | null {
    const node = this.band;
    node.group.visible(band !== null);
    if (!band) return null;
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
    // Título e subtítulo (px de tela) ficam acima da faixa e da linha do nome dos containers; sem
    // espaço, abaixo dela; sempre dentro da área visível.
    node.title.setAttrs({
      ...textAttrs(tokens, tokens.text, tokens.type.name.weight),
      text: t('perspective.canvas.arrivalArea'),
      x: 0,
      y: 0,
    });
    node.hint.setAttrs({
      ...textAttrs(tokens, tokens.textMuted, 400),
      text: t('perspective.canvas.arrivalAreaHint'),
      x: 0,
      y: line,
    });
    // Largura natural do texto (sem depender de `width`, que as reticências encurtam).
    const natural = Math.max(
      node.title.measureSize(node.title.text()).width,
      node.hint.measureSize(node.hint.text()).width,
    );
    const size = { width: natural, height: 2 * line };
    const fit = arrivalBandLabelFit(natural, zoom, view, tokens.arrival);
    // Sem `width` o Konva mede o texto inteiro; com ela, uma linha só, cortada com reticências.
    const clip = { width: fit ?? undefined, ellipsis: fit !== null };
    const at = arrivalBandLabelSpot(
      band,
      zoom,
      size,
      view,
      line + TITLE_GAP,
      tokens.arrival,
    );
    node.title.setAttrs({ scaleX: 1 / zoom, scaleY: 1 / zoom, ...clip });
    node.hint.setAttrs({ scaleX: 1 / zoom, scaleY: 1 / zoom, ...clip });
    node.title.x(at.x - band.x);
    node.title.y(at.y - band.y);
    node.hint.x(at.x - band.x);
    node.hint.y(at.y - band.y + line / zoom);
    return {
      x: at.x,
      y: at.y,
      width: (fit ?? natural) / zoom,
      height: size.height / zoom,
    };
  }
}
