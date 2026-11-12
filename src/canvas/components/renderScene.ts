/**
 * Desenha uma `Scene` (a instância de um componente) com Konva.
 *
 * Cada nó da cena vira um `Konva.Group` (o "contêiner" do nó, com a transformação, a
 * opacidade e a visibilidade) que guarda as formas do próprio nó (um shape por
 * preenchimento, mais um para o traço) e, depois delas, os contêineres dos filhos. Todo
 * shape e todo contêiner levam o atributo `sceneId`, para o visualizador achar o nó da cena
 * a partir do alvo de um evento do Konva.
 */
import { growRadius, sideSegments } from '../../model/components/strokeSides';
import { gapOutlines } from '../../model/components/strokeGaps';
import {
  CUT_REACH,
  WRAP_SLACK,
  cutLineLeft,
  cutsText,
} from '../../model/components/textWrap';
import { canvasFontFamily } from '../../model/components/fontFamily';
import Konva from 'konva/lib/Core';
import { Ellipse as KonvaEllipse } from 'konva/lib/shapes/Ellipse';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { PixelRect } from './pixelRect';
import { Shape as KonvaShape } from 'konva/lib/Shape';
import { Text as KonvaText, type TextConfig } from 'konva/lib/shapes/Text';
import {
  type CornerRadius,
  type Matrix,
  type Paint,
  type Scene,
  type SceneNode,
  type SceneTextRun,
  type Shadow,
  type Stroke,
  type TextNode,
  type TextStyle,
  hasChildren,
  nodeMatrix,
} from '../../model/components/scene';
import type { ImageFit } from '../../model/components/componentFormat';
import type { RunLayout, RunPiece } from '../../model/components/richText';
import { textBoxLimits } from './textLimits';
import { wordSafeWidth } from './wordWidth';
import { capMiddleShift, lineBaseline } from '../../model/components/baseline';
import { capMetricsOf } from './capMiddle';
import { cachedEmbeddedImage, loadEmbeddedImage } from './imageLoader';
import { DEFAULT_PALETTE, type RenderPalette } from './palette';
import type { RenderWarning, RenderWarningCode } from './renderWarnings';
import type { RemoteImageView, RemoteImageViewState } from './remoteImageTypes';

/** Única origem de imagem que o renderizador carrega sozinho (herança do laboratório). */
const DATA_URL = /^data:/i;

export { DEFAULT_PALETTE, type RenderPalette };
export type { RenderWarning, RenderWarningCode };

/** O que a função de imagem remota devolve: a vista completa ou só o estado (reservado). */
export type RemoteImageResult = RemoteImageView | RemoteImageViewState;

export interface RenderOptions {
  /**
   * Resolve a URL do nó `image` do componente (RI3): já passada pela política de URL e pelo
   * consentimento, com o carregador por trás. Sem ela, toda imagem remota é o reservado. O
   * `renderScene` nunca cria `Image` para URL remota.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /**
   * `true` quando o resultado será lido de volta (`toDataURL`, `toBlob`, `getImageData`):
   * imagem `opaque` (carregada sem CORS) não é desenhada, o reservado entra no lugar dela.
   */
  readonly pixelSafe?: boolean;
  /** Uma imagem embutida (`data:`) terminou de carregar: hora de redesenhar. */
  readonly onImageLoaded?: () => void;
  /** Cores do reservado e do nó desconhecido (padrão: `DEFAULT_PALETTE`). */
  readonly palette?: Partial<RenderPalette>;
  /** Desenha o contorno do reservado de um `slot` (padrão `true`; a camada do produto usa `false`). */
  readonly showSlots?: boolean;
}

export interface RenderResult {
  readonly root: Konva.Group;
  /** Contêiner Konva de cada nó da cena, pelo id. */
  readonly byId: ReadonlyMap<string, Konva.Group>;
  /** Aproximações feitas ao desenhar (além das do conversor), com código e parâmetros. */
  readonly warnings: readonly RenderWarning[];
  /** URLs remotas (`url` do preenchimento `image`) que a cena usa, sem repetir. */
  readonly imageUrls: readonly string[];
}

export const SCENE_ID_ATTR = 'sceneId';

/** Forma que só leva uma sombra (a posição da sombra na lista fica em `shadowIndex`). */
const SHADOW_CASTER_ATTR = 'shadowCaster';
const SHADOW_INDEX_ATTR = 'shadowIndex';

/** Forma que só existe para receber o ponteiro: não pinta nem recebe sombra. */
const HIT_ONLY_ATTR = 'hitOnly';

interface Box {
  readonly width: number;
  readonly height: number;
}

type ShapeWithFill = Konva.Shape;

class Renderer {
  readonly byId = new Map<string, Konva.Group>();
  private readonly warned = new Map<string, RenderWarning>();
  readonly imageUrls = new Set<string>();

  private readonly palette: RenderPalette;

  constructor(private readonly options: RenderOptions) {
    this.palette = { ...DEFAULT_PALETTE, ...options.palette };
  }

  get warnings(): readonly RenderWarning[] {
    return [...this.warned.values()];
  }

  private warn(code: RenderWarningCode, params?: RenderWarning['params']): void {
    const key = params ? `${code}|${JSON.stringify(params)}` : code;
    if (!this.warned.has(key)) this.warned.set(key, params ? { code, params } : { code });
  }

  render(node: SceneNode, pendingShadows: readonly Shadow[] = []): Konva.Group {
    const container = new Konva.Group({
      ...decompose(nodeMatrix(node)),
      opacity: node.opacity,
      visible: node.visible,
      name: node.name,
    });
    container.setAttr(SCENE_ID_ATTR, node.id);
    this.byId.set(node.id, container);

    // A sombra vai na primeira forma que a aceitar. Um grupo com efeito
    // (ex.: `filter` num grupo que envolve a forma) repassa a sombra à primeira forma descendente.
    const shadows = this.outerShadows([...pendingShadows, ...node.effects]);

    if (node.type === 'frame' && node.clip) {
      const { width, height, cornerRadius, clipBox } = node;
      container.clipFunc((ctx) => {
        if (clipBox) {
          // Recorte ampliado (traço fora da caixa, sombra): retângulo reto, sem os cantos.
          ctx.beginPath();
          ctx.rect(clipBox.x, clipBox.y, clipBox.width, clipBox.height);
          ctx.closePath();
        } else roundedRectPath(ctx, width, height, cornerRadius);
      });
    }

    if (node.type === 'text' && cutsText(node)) {
      const { width } = node;
      // Recorte só na horizontal (a caixa do texto); na vertical, o que o texto desenha fica.
      container.clipFunc((ctx) => {
        ctx.beginPath();
        ctx.rect(0, -CUT_REACH, width, 2 * CUT_REACH);
        ctx.closePath();
      });
    }

    const shapes = this.shapesOf(node);
    // A área clicável invisível de um quadro transparente não pinta: não é dona da sombra.
    const shadowOwner =
      shadows.length > 0 ? shapes.find((s) => !s.getAttr(HIT_ONLY_ATTR)) : undefined;
    // Várias sombras (ou `spread`) num retângulo ou elipse: uma forma só de sombra por sombra, por
    // baixo das formas do nó, a última da lista primeiro (a primeira fica por cima).
    const casters = shadowOwner !== undefined && castsShadows(node, shadows);
    if (casters) {
      for (const shadow of [...shadows].reverse()) {
        const caster = shadowCaster(node, shadow);
        caster.setAttr(SCENE_ID_ATTR, node.id);
        caster.setAttr(SHADOW_CASTER_ATTR, true);
        caster.setAttr(SHADOW_INDEX_ATTR, shadows.indexOf(shadow));
        container.add(caster);
      }
    }
    for (const shape of shapes) {
      shape.setAttr(SCENE_ID_ATTR, node.id);
      container.add(shape);
    }

    if (hasChildren(node)) {
      let forward = shadows.length > 0 && !shadowOwner ? shadows : [];
      // Quadro com recorte ampliado (sombra, traço) e raio: o ampliado vale ao quadro; os filhos
      // saem num grupo recortado pela forma (o raio), e o canto deles não sai reto.
      let holder: Konva.Group = container;
      if (
        node.type === 'frame' &&
        node.clip &&
        node.clipBox &&
        !isSquare(node.cornerRadius)
      ) {
        const { width, height, cornerRadius } = node;
        holder = new Konva.Group({
          clipFunc: (ctx) => roundedRectPath(ctx, width, height, cornerRadius),
        });
        container.add(holder);
      }
      for (const child of node.children) {
        holder.add(this.render(child, forward));
        // Só o primeiro filho herda as sombras do grupo.
        forward = [];
      }
      if (shadows.length > 0 && !shadowOwner && node.children.length === 0) {
        this.warn('empty-group-shadow');
      }
    }

    const [first] = shadows;
    if (first && shadowOwner && !casters) applyShadow(shadowOwner, first);
    return container;
  }

  private hitOnly(shape: Konva.Shape): Konva.Shape {
    shape.setAttr(HIT_ONLY_ATTR, true);
    return shape;
  }

  /** As sombras externas, na ordem; a interna não existe no canvas 2D: ignorada, com aviso. */
  private outerShadows(shadows: readonly Shadow[]): Shadow[] {
    if (shadows.some((s) => s.inner)) this.warn('inner-shadow');
    return shadows.filter((s) => !s.inner);
  }

  /** As formas do próprio nó (sem os filhos). */
  private shapesOf(node: SceneNode): Konva.Shape[] {
    const box: Box = { width: node.width, height: node.height };
    const shapes: Konva.Shape[] = [];
    switch (node.type) {
      case 'frame':
      case 'rect': {
        for (const paint of node.fills) {
          const config = {
            width: node.width,
            height: node.height,
            cornerRadius: konvaRadius(node.cornerRadius),
            listening: true,
          };
          // Cor sólida sem canto arredondado: bordas em pixels inteiros (sem fio na emenda).
          const shape =
            paint.type === 'solid' && isSquare(node.cornerRadius)
              ? new PixelRect(config)
              : new KonvaRect(config);
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          if (node.stroke.sides) shapes.push(...this.sideStrokes(node.stroke, box));
          else {
            const gapped = this.gapStrokes(node.stroke, box, node.cornerRadius);
            shapes.push(
              ...(gapped.length > 0
                ? gapped
                : [this.rectStroke(node.stroke, box, node.cornerRadius)]),
            );
          }
        }
        if (node.fills.length === 0 && !node.stroke && node.type === 'frame') {
          // Quadro transparente: uma área clicável invisível, para o hover achar o quadro.
          shapes.push(
            this.hitOnly(
              new KonvaRect({
                width: node.width,
                height: node.height,
                fill: 'transparent',
              }),
            ),
          );
        }
        return shapes;
      }
      case 'ellipse': {
        const geometry = {
          x: node.width / 2,
          y: node.height / 2,
          radiusX: node.width / 2,
          radiusY: node.height / 2,
        };
        for (const paint of node.fills) {
          shapes.push(...this.fillShape(new KonvaEllipse(geometry), paint, box));
        }
        if (node.stroke) {
          const inset = strokeInset(node.stroke) - (node.stroke.offset ?? 0);
          const shape = new KonvaEllipse({
            ...geometry,
            radiusX: Math.max(0, geometry.radiusX - inset),
            radiusY: Math.max(0, geometry.radiusY - inset),
          });
          this.applyStroke(shape, node.stroke);
          shapes.push(shape);
        }
        return shapes;
      }
      case 'line': {
        const points = node.points.flatMap((p) => [p.x, p.y]);
        for (const paint of node.fills) {
          const shape = new KonvaLine({ points, closed: node.closed });
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          const shape = new KonvaLine({ points, closed: node.closed });
          this.applyStroke(shape, node.stroke, 'line');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'path': {
        for (const paint of node.fills) {
          const shape = new KonvaPath({ data: node.d, fillRule: node.fillRule });
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke) {
          const shape = new KonvaPath({ data: node.d });
          this.applyStroke(shape, node.stroke, 'path');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'text': {
        if (node.runs && node.runLayout) return this.richTextShapes(node, node.runs);
        const { style } = node;
        const attrs: TextConfig = {
          text: node.text,
          fontFamily: canvasFontFamily(style.fontFamily),
          fontSize: style.fontSize,
          fontStyle: fontStyle(style.fontWeight, style.italic),
          align: style.align,
          // `cap-middle` é do `capMiddleY`: o Konva desenha em `top` e o nó desce o deslocamento.
          verticalAlign:
            style.verticalAlign === 'cap-middle' ? 'top' : style.verticalAlign,
          lineHeight: style.lineHeight ? style.lineHeight / style.fontSize : 1.2,
          letterSpacing: style.letterSpacing ?? 0,
          textDecoration: style.decoration ?? '',
          wrap: style.wrap === 'none' ? 'none' : 'word',
          ellipsis: style.ellipsis === true,
        };
        // `wrap: none` sem `ellipsis` numa caixa fixa: o Text não leva `width` (o Konva tiraria a
        // letra inteira) e o grupo recorta por pixel na caixa; o `align` é do `x` (decisão 19).
        const cut = cutsText(node);
        if (node.width > 0 && !cut) {
          // A folga da quebra (0,5 px), a mesma do medidor; o `x` desfaz o deslocamento do `align`.
          // Uma palavra mais larga que a caixa fica inteira na linha, como no modelo e no medidor.
          const breaks = style.wrap !== 'none' && style.ellipsis !== true;
          attrs.width =
            (breaks ? wordSafeWidth(node.text, attrs, node.width) : node.width) +
            WRAP_SLACK;
          attrs.x = slackShift(style.align);
        }
        if (node.height > 0) attrs.height = node.height;
        const clipped = maxLinesBox(attrs, node, style);
        if (clipped) {
          attrs.height = clipped.height;
          attrs.y = clipped.offsetY;
        }
        if (style.verticalAlign === 'cap-middle')
          attrs.y = capMiddleY(attrs, node, style);
        if (style.baselineTop !== undefined)
          attrs.y = baselineY(attrs, style.baselineTop);
        // Texto do SVG sem largura: o x é a âncora (`text-anchor`), então o texto centrado
        // ou à direita cresce para a esquerda a partir dela.
        const anchor = (shape: KonvaText): KonvaText => {
          if (cut) {
            // O bloco (a linha mais larga) se alinha na caixa; o Konva alinha as linhas dentro dele.
            shape.x(cutLineLeft(style.align, node.width, shape.width(), shape.width()));
            return shape;
          }
          if (node.width > 0 || style.align === 'left' || style.align === 'justify')
            return shape;
          shape.offsetX(style.align === 'center' ? shape.width() / 2 : shape.width());
          return shape;
        };
        for (const paint of node.fills) {
          shapes.push(...this.fillShape(anchor(new KonvaText(attrs)), paint, box));
        }
        if (node.stroke) {
          const shape = anchor(new KonvaText(attrs));
          this.applyStroke(shape, node.stroke, 'path');
          shapes.push(shape);
        }
        return shapes;
      }
      case 'group':
        return shapes;
      case 'unknown': {
        // Um `slot` (laboratório de componentes) é um espaço reservado, não uma falha:
        // contorno discreto e sem aviso.
        const slot = node.sourceType === 'slot';
        if (slot && this.options.showSlots === false) return shapes;
        // O ícone desconhecido já levou o aviso do motor (`ícone desconhecido: <nome>`).
        if (!slot && node.sourceType !== 'icon') {
          this.warn('unknown-node', { type: node.sourceType });
        }
        shapes.push(
          new KonvaRect({
            width: node.width,
            height: node.height,
            stroke: slot ? this.palette.placeholderLine : this.palette.unknownLine,
            strokeWidth: 1,
            dash: slot ? [3, 5] : [4, 4],
            opacity: slot ? this.palette.slotOpacity : 1,
            strokeScaleEnabled: false,
          }),
        );
        return shapes;
      }
    }
  }

  /**
   * Texto rico (`runs`): um fundo (`KonvaRect`) por caixa em linha e um `KonvaText` por pedaço de
   * texto, nas posições do `runLayout` da cena, deslocadas pelo `verticalAlign` do nó. O fundo
   * vem antes do texto do chip; o traço do nó vale para cada pedaço de texto.
   */
  private richTextShapes(node: TextNode, runs: readonly SceneTextRun[]): Konva.Shape[] {
    const shapes: Konva.Shape[] = [];
    const layout = node.runLayout;
    if (!layout) return shapes;
    const shift = richShift(node, layout);
    for (const line of layout.lines) {
      for (const piece of line.pieces) {
        const run = runs[piece.run];
        if (!run) continue;
        const top = line.y + (line.height - piece.height) / 2 + shift;
        if (piece.chip) shapes.push(chipShape(piece, run, top));
        shapes.push(runTextShape(node, run, piece, top));
        if (node.stroke) {
          // Como no texto simples: o preenchimento e o contorno são formas separadas.
          const outline = runTextShape(node, run, piece, top);
          this.applyStroke(outline, node.stroke, 'path');
          shapes.push(outline);
        }
      }
    }
    return shapes;
  }

  /** Aplica um preenchimento a uma forma; uma imagem vira a própria forma (`KonvaImage`). */
  private fillShape(shape: ShapeWithFill, paint: Paint, box: Box): Konva.Shape[] {
    shape.opacity(paint.opacity ?? 1);
    switch (paint.type) {
      case 'solid':
        shape.fill(paint.color);
        return [shape];
      case 'linear':
        shape.fillPriority('linear-gradient');
        shape.fillLinearGradientStartPoint(paint.start);
        shape.fillLinearGradientEndPoint(paint.end);
        shape.fillLinearGradientColorStops(flattenStops(paint.stops));
        return [shape];
      case 'radial':
        shape.fillPriority('radial-gradient');
        shape.fillRadialGradientStartPoint(paint.center);
        shape.fillRadialGradientEndPoint(paint.center);
        shape.fillRadialGradientStartRadius(0);
        shape.fillRadialGradientEndRadius(paint.radius);
        shape.fillRadialGradientColorStops(flattenStops(paint.stops));
        return [shape];
      case 'image':
        return this.imageFill(shape, paint, box);
    }
  }

  private imageFill(shape: ShapeWithFill, paint: Paint & { type: 'image' }, box: Box) {
    // `paint.url` é a imagem remota do nó `image` do componente: o renderizador não a baixa; a
    // função das opções devolve o estado (e a imagem pronta, já passada pela política e pelo
    // consentimento). Tudo menos `loaded`/`opaque` é o reservado, sem aviso (estado normal).
    if (!paint.src && paint.url !== undefined) {
      this.imageUrls.add(paint.url);
      return this.remoteImageFill(shape, paint, paint.url, box);
    }
    // Só a imagem embutida (`data:`) é carregada aqui; qualquer outro esquema vira reservado.
    if (!paint.src || !DATA_URL.test(paint.src)) {
      this.warn('image-without-pixels');
      return placeholder(shape, box, this.palette);
    }
    if (shape instanceof KonvaRect) {
      const fit = paint.fit ?? 'cover';
      const image = new KonvaImage({
        image: undefined,
        width: box.width,
        height: box.height,
        cornerRadius: shape.cornerRadius(),
        opacity: paint.opacity ?? 1,
      });
      const apply = (element: HTMLImageElement): void => {
        const size = { width: element.naturalWidth, height: element.naturalHeight };
        image.setAttrs({
          image: element,
          ...(size.width > 0 && size.height > 0 ? imageFit(fit, box, size) : {}),
        });
      };
      const ready = cachedEmbeddedImage(paint.src);
      if (ready) {
        // Já decodificada: usa de imediato (sem pedir quadro, senão o desenho se repetiria).
        apply(ready);
        return [image];
      }
      loadEmbeddedImage(paint.src, {
        onLoad: (element) => {
          apply(element);
          this.options.onImageLoaded?.();
        },
        onError: () => {
          this.warn('image-decode-failed');
        },
      });
      return [image];
    }
    // Imagem como preenchimento de elipse/caminho: o Konva usa `fillPatternImage`.
    loadEmbeddedImage(paint.src, {
      onLoad: (element) => {
        shape.fillPriority('pattern');
        shape.fillPatternImage(element);
        shape.fillPatternScale({
          x: box.width / Math.max(1, element.naturalWidth),
          y: box.height / Math.max(1, element.naturalHeight),
        });
        this.options.onImageLoaded?.();
      },
    });
    shape.fill(this.palette.placeholderFill);
    return [shape];
  }

  private remoteImageFill(
    shape: ShapeWithFill,
    paint: Paint & { type: 'image' },
    url: string,
    box: Box,
  ): Konva.Shape[] {
    const view = this.resolveRemote(url);
    const drawable =
      view.image !== undefined &&
      (view.state === 'loaded' || (view.state === 'opaque' && !this.options.pixelSafe));
    if (!drawable || view.image === undefined || !(shape instanceof KonvaRect)) {
      return placeholder(shape, box, this.palette);
    }
    const size = sourceSize(view);
    if (size === null) return placeholder(shape, box, this.palette);
    const image = new KonvaImage({
      image: view.image,
      ...imageFit(paint.fit ?? 'cover', box, size),
      cornerRadius: shape.cornerRadius(),
      opacity: paint.opacity ?? 1,
      listening: true,
    });
    return [image];
  }

  /** A função das opções pode lançar ou devolver só o estado: nenhum dos dois derruba o desenho. */
  private resolveRemote(url: string): RemoteImageView {
    const resolve = this.options.remoteImage;
    if (!resolve) return { state: 'invalid' };
    try {
      const result = resolve(url);
      return typeof result === 'string' ? { state: result } : result;
    } catch {
      return { state: 'failed' };
    }
  }

  /** `stroke.sides`: uma linha reta por lado pedido (sem arco no canto, mesmo com raio). */
  private sideStrokes(stroke: Stroke, box: Box): Konva.Shape[] {
    return sideSegments(stroke, box.width, box.height).map((seg) => {
      const line = new KonvaLine({ points: [seg.x1, seg.y1, seg.x2, seg.y2] });
      this.applyStroke(line, stroke, 'line', true);
      return line;
    });
  }

  /** `stroke.gap`: o contorno com o raio de cada canto, em linhas abertas que pulam os vãos. */
  private gapStrokes(stroke: Stroke, box: Box, radius: CornerRadius): Konva.Shape[] {
    return gapOutlines(stroke, box.width, box.height, radius).map((points) => {
      const line = new KonvaLine({ points: points.flatMap((p) => [p.x, p.y]) });
      this.applyStroke(line, stroke, 'line', true);
      return line;
    });
  }

  private rectStroke(stroke: Stroke, box: Box, radius: CornerRadius): Konva.Shape {
    // `offset`: o contorno afastado da forma (o anel cresce de cada lado, com o raio + offset).
    const offset = stroke.offset ?? 0;
    const align = strokeInset(stroke);
    const inset = align - offset;
    const shape = new KonvaRect({
      x: inset,
      y: inset,
      width: Math.max(0, box.width - inset * 2),
      height: Math.max(0, box.height - inset * 2),
      cornerRadius: konvaRadius(shrinkRadius(growRadius(radius, offset), align)),
    });
    this.applyStroke(shape, stroke);
    return shape;
  }

  private applyStroke(
    shape: Konva.Shape,
    stroke: Stroke,
    kind: 'box' | 'line' | 'path' = 'box',
    sideLine = false,
  ): void {
    const [paint, ...rest] = stroke.paints;
    if (rest.length > 0) this.warn('stroke-extra-paints');
    if (kind !== 'box' && !sideLine && stroke.align !== 'center') {
      this.warn('stroke-align-centered');
    }
    shape.strokeWidth(stroke.width);
    // `scale: false`: a largura é em pixels de tela, em qualquer zoom.
    if (stroke.scale === false) shape.strokeScaleEnabled(false);
    shape.lineCap(stroke.cap ?? 'butt');
    shape.lineJoin(stroke.join ?? 'miter');
    if (stroke.dash && stroke.dash.length > 0) shape.dash([...stroke.dash]);
    shape.fillEnabled(false);
    if (!paint) return;
    shape.opacity(paint.opacity ?? 1);
    switch (paint.type) {
      case 'solid':
        shape.stroke(paint.color);
        return;
      case 'linear':
        shape.strokeLinearGradientStartPoint(paint.start);
        shape.strokeLinearGradientEndPoint(paint.end);
        shape.strokeLinearGradientColorStops(flattenStops(paint.stops));
        return;
      case 'radial': {
        this.warn('stroke-radial-first-color');
        shape.stroke(paint.stops[0]?.color ?? this.palette.placeholderLine);
        return;
      }
      case 'image':
        this.warn('stroke-image-gray');
        shape.stroke(this.palette.placeholderLine);
        return;
    }
  }
}

/** Deslocamento vertical do texto rico na caixa do nó: folga × 0, ½ ou 1 (`verticalAlign`). */
function verticalShift(node: TextNode, contentHeight: number): number {
  if (node.height <= 0) return 0;
  const free = node.height - contentHeight;
  switch (node.style.verticalAlign) {
    case 'middle':
      return free / 2;
    case 'bottom':
      return free;
    default:
      return 0;
  }
}

/**
 * `cap-middle` no texto simples: o `y` do nó para o bloco (topo da maiúscula da primeira linha à
 * base da última) ficar no centro da caixa. `attrs` já traz a largura, a altura (a do `maxLines`,
 * se cortou) e `verticalAlign: top`; as linhas são as que o Konva desenha com eles.
 */
function capMiddleY(attrs: TextConfig, node: TextNode, style: TextStyle): number {
  if (node.height <= 0) return 0;
  const probe = new KonvaText(attrs);
  const metrics = capMetricsOf(probe, style.fontSize);
  const lines = Math.max(1, probe.textArr.length);
  probe.destroy();
  const lineHeight = (attrs.lineHeight ?? 1.2) * style.fontSize;
  const first = lineBaseline(0, lineHeight, metrics);
  return capMiddleShift({
    boxHeight: node.height,
    capHeight: metrics.capHeight,
    firstBaseline: first,
    lastBaseline: first + (lines - 1) * lineHeight,
  });
}

/**
 * `baselinePadding.top`: o `y` do nó para a primeira linha de base ficar a `top` do topo dele. A
 * linha de base é a da fonte do nó, pelas mesmas medidas do `cap-middle` e do `konvaMeasurer`.
 */
function baselineY(attrs: TextConfig, top: number): number {
  const probe = new KonvaText(attrs);
  const fontSize = attrs.fontSize ?? 12;
  const metrics = capMetricsOf(probe, fontSize);
  probe.destroy();
  const lineHeight = (attrs.lineHeight ?? 1.2) * fontSize;
  return top - lineBaseline(0, lineHeight, metrics);
}

/** Deslocamento vertical do texto rico: `baselinePadding.top`, `cap-middle` ou o `verticalAlign`. */
function richShift(node: TextNode, layout: RunLayout): number {
  const top = node.style.baselineTop;
  if (top !== undefined) {
    const first = layout.lines[0];
    return first ? top - baseOfLine(node, first) : 0;
  }
  return node.style.verticalAlign === 'cap-middle'
    ? capMiddleRunsShift(node, layout)
    : verticalShift(node, layout.height);
}

/** A linha de base de uma linha do `runLayout`, com a fonte base do nó. */
function baseOfLine(node: TextNode, line: { y: number; height: number }): number {
  const { style } = node;
  const sample = new KonvaText({
    text: 'M',
    fontFamily: canvasFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    fontStyle: fontStyle(style.fontWeight, style.italic),
  });
  const metrics = capMetricsOf(sample, style.fontSize);
  sample.destroy();
  return lineBaseline(line.y, line.height, metrics);
}

/**
 * `cap-middle` nos trechos: a mesma regra com o `capHeight` da fonte base do nó e as linhas de
 * base da primeira e da última linha do `runLayout` (o pedaço fica centrado na altura da linha,
 * então a base é a do pedaço com a fonte base).
 */
function capMiddleRunsShift(node: TextNode, layout: RunLayout): number {
  const first = layout.lines[0];
  const last = layout.lines[layout.lines.length - 1];
  if (node.height <= 0 || !first || !last) return 0;
  const { style } = node;
  const sample = new KonvaText({
    text: 'M',
    fontFamily: canvasFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    fontStyle: fontStyle(style.fontWeight, style.italic),
  });
  const metrics = capMetricsOf(sample, style.fontSize);
  sample.destroy();
  const baseline = (line: { y: number; height: number }): number =>
    lineBaseline(line.y, line.height, metrics);
  return capMiddleShift({
    boxHeight: node.height,
    capHeight: metrics.capHeight,
    firstBaseline: baseline(first),
    lastBaseline: baseline(last),
  });
}

/** A cor do trecho como preenchimento do Konva (`none` = sem preenchimento). */
function runFill(color: string): string | undefined {
  return /^(none|transparent)$/i.test(color.trim()) ? undefined : color;
}

/** O fundo de uma caixa em linha: a caixa inteira do pedaço, com o raio do trecho. */
function chipShape(piece: RunPiece, run: SceneTextRun, top: number): KonvaRect {
  return new KonvaRect({
    x: piece.x,
    y: top,
    width: piece.width,
    height: piece.height,
    cornerRadius: run.radius ?? 0,
    fill: run.background,
  });
}

/**
 * O texto de um pedaço: uma linha só, sem largura (o espaço inicial do chip fica) e na fonte do
 * trecho. No chip o texto fica `padding` para dentro da caixa; a altura de linha vem da altura do
 * pedaço (a do trecho, sem o respiro vertical do chip).
 */
function runTextShape(
  node: TextNode,
  run: SceneTextRun,
  piece: RunPiece,
  top: number,
): KonvaText {
  const [padV, padH] = piece.chip ? (run.padding ?? [0, 0]) : [0, 0];
  const lineHeight = piece.height - 2 * (padV ?? 0);
  return new KonvaText({
    x: piece.x + (padH ?? 0),
    y: top + (padV ?? 0),
    text: piece.text,
    fontFamily: canvasFontFamily(run.fontFamily),
    fontSize: run.fontSize,
    fontStyle: fontStyle(run.fontWeight, run.italic),
    lineHeight: run.fontSize > 0 ? lineHeight / run.fontSize : 1.2,
    letterSpacing: node.style.letterSpacing ?? 0,
    textDecoration: run.decoration ?? '',
    wrap: 'none',
    fill: runFill(run.color),
  });
}

/** Largura e altura da fonte de uma imagem pronta; `null` se não houver como saber. */
function sourceSize(view: RemoteImageView): { width: number; height: number } | null {
  let width = view.width;
  let height = view.height;
  const image = view.image;
  if ((width === undefined || height === undefined) && image) {
    if ('naturalWidth' in image) {
      width = image.naturalWidth;
      height = image.naturalHeight;
    } else if ('width' in image && typeof image.width === 'number') {
      width = image.width;
      height = (image as { height: number }).height;
    }
  }
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Posição, tamanho e recorte do `KonvaImage` para o `fit`: `cover` recorta o centro da fonte para
 * cobrir a caixa, `contain` encaixa a fonte inteira no centro, `fill` estica.
 */
export function imageFit(
  fit: ImageFit,
  box: Box,
  source: { width: number; height: number },
): {
  x: number;
  y: number;
  width: number;
  height: number;
  crop?: { x: number; y: number; width: number; height: number };
} {
  if (fit === 'fill') return { x: 0, y: 0, width: box.width, height: box.height };
  if (fit !== 'cover' && fit !== 'contain') return placedFit(fit, box, source);
  if (fit === 'contain') {
    const scale = Math.min(box.width / source.width, box.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const cropWidth = box.width / scale;
  const cropHeight = box.height / scale;
  return {
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}

const EPSILON = 1e-9;

/**
 * `fill-width`, `fill-height`, `scale-down` e `none` (formato 4): a imagem na escala do `fit`,
 * centrada na caixa e recortada onde passa dela (o `ContentScale` `FillWidth`, `FillHeight`,
 * `Inside` e `None`). `scale-down` nunca amplia; `none` e `scale-down` usam o tamanho natural.
 */
function placedFit(
  fit: Exclude<ImageFit, 'cover' | 'contain' | 'fill'>,
  box: Box,
  source: { width: number; height: number },
): ReturnType<typeof imageFit> {
  if (box.width <= 0 || box.height <= 0 || source.width <= 0 || source.height <= 0)
    return { x: 0, y: 0, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  const scale =
    fit === 'fill-width'
      ? box.width / source.width
      : fit === 'fill-height'
        ? box.height / source.height
        : fit === 'none'
          ? 1
          : Math.min(1, box.width / source.width, box.height / source.height);
  const width = Math.min(source.width * scale, box.width);
  const height = Math.min(source.height * scale, box.height);
  const placed = {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  if (cropWidth >= source.width - EPSILON && cropHeight >= source.height - EPSILON)
    return placed;
  return {
    ...placed,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}

/** Reservado de imagem: a forma em cinza, com um X. */
function placeholder(
  shape: Konva.Shape,
  box: Box,
  palette: RenderPalette,
): Konva.Shape[] {
  shape.fill(palette.placeholderFill);
  const cross = new KonvaLine({
    points: [0, 0, box.width, box.height, box.width, 0, 0, box.height],
    stroke: palette.placeholderLine,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
  });
  // Um polígono com dois segmentos cruzados: desenha 0→fim, fim→(w,0), (w,0)→(0,h).
  return [shape, cross];
}

/**
 * Sombra totalmente transparente ou sem desfoque, deslocamento nem `spread` que cresça a forma:
 * não custa desenhar.
 */
export function isInvisibleShadow(shadow: Shadow): boolean {
  if (
    shadow.blur <= 0 &&
    shadow.offset.x === 0 &&
    shadow.offset.y === 0 &&
    (shadow.spread ?? 0) <= 0
  )
    return true;
  const color = shadow.color.trim().toLowerCase();
  if (color === 'transparent' || color === 'none') return true;
  const rgba = /^rgba?\(([^)]*)\)$/.exec(color);
  if (rgba) {
    const parts = (rgba[1] ?? '').split(',').map((p) => p.trim());
    return parts.length === 4 && Number(parts[3]) === 0;
  }
  const hex8 = /^#([0-9a-f]{8})$/.exec(color);
  if (hex8) return (hex8[1] ?? '').endsWith('00');
  const hex4 = /^#([0-9a-f]{4})$/.exec(color);
  if (hex4) return (hex4[1] ?? '').endsWith('0');
  return false;
}

/**
 * `maxLines`: se o texto tem mais linhas que o limite, a caixa do Konva encolhe para `maxLines`
 * linhas (ele corta, e põe o … com `ellipsis`) e desce `offsetY` para manter o alinhamento
 * vertical da caixa do nó. `null` = a caixa do nó serve.
 */
function maxLinesBox(
  attrs: TextConfig,
  node: TextNode,
  style: TextStyle,
): { height: number; offsetY: number } | null {
  if (style.maxLines === undefined || node.height <= 0) return null;
  const lineHeight = (attrs.lineHeight ?? 1.2) * style.fontSize;
  const probe = new KonvaText({ ...attrs, height: undefined });
  const natural = probe.height();
  probe.destroy();
  const { height, cut } = textBoxLimits(natural, style.maxLines, lineHeight);
  if (!cut || height >= node.height) return null;
  const free = node.height - height;
  const offsetY =
    style.verticalAlign === 'middle'
      ? free / 2
      : style.verticalAlign === 'bottom'
        ? free
        : 0;
  return { height, offsetY };
}

/** A sombra desta lista pede formas à parte (várias sombras ou `spread`) e o nó as aceita? */
function castsShadows(node: SceneNode, shadows: readonly Shadow[]): boolean {
  const boxed = node.type === 'frame' || node.type === 'rect' || node.type === 'ellipse';
  return boxed && (shadows.length > 1 || shadows.some((s) => (s.spread ?? 0) !== 0));
}

/** O raio de um canto da sombra: o do nó mais o `spread`, sem passar de 0 (canto reto continua reto). */
function spreadRadius(radius: CornerRadius, spread: number): CornerRadius {
  const grow = (r: number): number => (r > 0 ? Math.max(0, r + spread) : 0);
  return typeof radius === 'number'
    ? grow(radius)
    : [grow(radius[0]), grow(radius[1]), grow(radius[2]), grow(radius[3])];
}

/**
 * A forma que só leva uma sombra: desenha a silhueta do nó (crescida de `spread`) bem longe da
 * tela e traz a sombra de volta pelo deslocamento da sombra, que o canvas 2D aplica em pixels de
 * tela (não gira nem escala com a matriz). Assim a forma nunca aparece e a cor do nó não muda,
 * com preenchimento translúcido ou não.
 */
function shadowCaster(node: SceneNode, shadow: Shadow): Konva.Shape {
  return new KonvaShape({
    width: node.width,
    height: node.height,
    listening: false,
    sceneFunc: (ctx) => castShadow(ctx._context, node, shadow),
  });
}

function castShadow(
  native: CanvasRenderingContext2D,
  node: SceneNode,
  shadow: Shadow,
): void {
  if (isInvisibleShadow(shadow)) return;
  const spread = shadow.spread ?? 0;
  const width = node.width + 2 * spread;
  const height = node.height + 2 * spread;
  if (width <= 0 || height <= 0) return;
  const m = native.getTransform();
  const sx = Math.hypot(m.a, m.b) || 1;
  const sy = Math.hypot(m.c, m.d) || 1;
  // Quanto a forma sai para o lado: mais que a tela, a forma e o desfoque juntos.
  const reach =
    native.canvas.width +
    native.canvas.height +
    Math.hypot(width * sx, height * sy) +
    2 * shadow.blur * Math.max(sx, sy) +
    1000;
  const away = reach / sx;
  native.save();
  native.shadowColor = shadow.color;
  native.shadowBlur = shadow.blur * Math.min(sx, sy);
  native.shadowOffsetX = shadow.offset.x * sx + away * m.a;
  native.shadowOffsetY = shadow.offset.y * sy + away * m.b;
  native.translate(-away - spread, -spread);
  if (node.type === 'ellipse') {
    native.beginPath();
    native.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (node.type === 'frame' || node.type === 'rect')
    roundedRectPath(native, width, height, spreadRadius(node.cornerRadius, spread));
  native.fillStyle = '#000000';
  native.fill();
  native.restore();
}

function applyShadow(shape: Konva.Shape, shadow: Shadow): void {
  // Uma sombra invisível ainda custa um `shadowBlur` do canvas por desenho: fica de fora.
  if (isInvisibleShadow(shadow)) return;
  shape.shadowColor(shadow.color);
  shape.shadowBlur(shadow.blur);
  shape.shadowOffset(shadow.offset);
  shape.shadowOpacity(1);
  shape.shadowEnabled(true);
}

/** A largura do Text leva a folga da quebra; o `x` volta o que o `align` desloca por causa dela. */
function slackShift(align: TextStyle['align']): number {
  if (align === 'center') return -WRAP_SLACK / 2;
  return align === 'right' ? -WRAP_SLACK : 0;
}

/** Metade do traço que entra na caixa: por dentro, o traço inteiro fica dentro; por fora, nada. */
function strokeInset(stroke: Stroke): number {
  switch (stroke.align) {
    case 'inside':
      return stroke.width / 2;
    case 'outside':
      return -stroke.width / 2;
    case 'center':
      return 0;
  }
}

function shrinkRadius(radius: CornerRadius, by: number): CornerRadius {
  if (typeof radius === 'number') return Math.max(0, radius - by);
  return [
    Math.max(0, radius[0] - by),
    Math.max(0, radius[1] - by),
    Math.max(0, radius[2] - by),
    Math.max(0, radius[3] - by),
  ];
}

function isSquare(radius: CornerRadius): boolean {
  return typeof radius === 'number' ? radius === 0 : radius.every((r) => r === 0);
}

function konvaRadius(radius: CornerRadius): number | number[] {
  return typeof radius === 'number' ? radius : [...radius];
}

function flattenStops(
  stops: readonly { offset: number; color: string }[],
): Array<number | string> {
  return stops.flatMap((s) => [s.offset, s.color]);
}

/** `fontStyle` do Konva: "italic 600", "bold", "normal"… (ele monta a fonte do canvas com isso). */
export function fontStyle(weight: number, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push('italic');
  if (weight !== 400) parts.push(weight === 700 ? 'bold' : String(weight));
  return parts.length > 0 ? parts.join(' ') : 'normal';
}

/** Decompõe a matriz do nó em x, y, rotação, escala e inclinação, como o Konva espera. */
export function decompose(m: Matrix): {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
} {
  return new Konva.Transform([...m]).decompose();
}

/** O que `roundedRectPath` usa do contexto: serve ao do Konva e ao nativo do canvas 2D. */
type PathContext = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'arcTo' | 'closePath'
>;

/** Caminho de retângulo arredondado no contexto (para o clip dos quadros). */
function roundedRectPath(
  ctx: PathContext,
  width: number,
  height: number,
  radius: CornerRadius,
): void {
  const [tl, tr, br, bl] =
    typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
  const clamp = (r: number) => Math.max(0, Math.min(r, width / 2, height / 2));
  const [a, b, c, d] = [clamp(tl), clamp(tr), clamp(br), clamp(bl)];
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.lineTo(width - b, 0);
  ctx.arcTo(width, 0, width, b, b);
  ctx.lineTo(width, height - c);
  ctx.arcTo(width, height, width - c, height, c);
  ctx.lineTo(d, height);
  ctx.arcTo(0, height, 0, height - d, d);
  ctx.lineTo(0, a);
  ctx.arcTo(0, 0, a, 0, a);
  ctx.closePath();
}

export function renderScene(scene: Scene, options: RenderOptions = {}): RenderResult {
  const renderer = new Renderer(options);
  const root = renderer.render(scene.root);
  return {
    root,
    byId: renderer.byId,
    warnings: renderer.warnings,
    imageUrls: [...renderer.imageUrls],
  };
}

/** O id do nó da cena dono de um alvo de evento do Konva (forma ou contêiner), se houver. */
export function sceneIdOf(target: Konva.Node | null | undefined): string | undefined {
  let node: Konva.Node | null | undefined = target;
  while (node) {
    const id: unknown = node.getAttr(SCENE_ID_ATTR);
    if (typeof id === 'string') return id;
    node = node.getParent();
  }
  return undefined;
}
