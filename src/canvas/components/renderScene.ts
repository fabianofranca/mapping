/**
 * Desenha uma `Scene` (a instância de um componente) com Konva.
 *
 * Cada nó da cena vira um `Konva.Group` (o "contêiner" do nó, com a transformação, a
 * opacidade e a visibilidade) que guarda as formas do próprio nó (um shape por
 * preenchimento, mais um para o traço) e, depois delas, os contêineres dos filhos. Todo
 * shape e todo contêiner levam o atributo `sceneId`, para o visualizador achar o nó da cena
 * a partir do alvo de um evento do Konva.
 */
import Konva from 'konva/lib/Core';
import { Ellipse as KonvaEllipse } from 'konva/lib/shapes/Ellipse';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Line as KonvaLine } from 'konva/lib/shapes/Line';
import { Path as KonvaPath } from 'konva/lib/shapes/Path';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText, type TextConfig } from 'konva/lib/shapes/Text';
import {
  type CornerRadius,
  type Matrix,
  type Paint,
  type Scene,
  type SceneNode,
  type Shadow,
  type Stroke,
  hasChildren,
} from '../../model/components/scene';
import { loadEmbeddedImage } from './imageLoader';

/** Única origem de imagem que o renderizador carrega sozinho (herança do laboratório). */
const DATA_URL = /^data:/i;

/** Cores do reservado de imagem e da caixa de nó desconhecido. */
export interface RenderPalette {
  /** Preenchimento do reservado de imagem. */
  readonly placeholderFill: string;
  /** Contorno do reservado (X, traço de imagem, slot). */
  readonly placeholderLine: string;
  /** Contorno da caixa de nó que o desenho não conhece. */
  readonly unknownLine: string;
}

/** Padrão do laboratório (sem tema próprio). O produto passa as cores dos tokens do tema. */
export const DEFAULT_PALETTE: RenderPalette = {
  placeholderFill: 'rgba(128, 128, 128, 0.25)',
  placeholderLine: 'rgba(128, 128, 128, 0.8)',
  unknownLine: '#d81b60',
};

export interface RenderOptions {
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
  /** Aproximações feitas ao desenhar (além das do conversor). */
  readonly warnings: readonly string[];
}

export const SCENE_ID_ATTR = 'sceneId';

interface Box {
  readonly width: number;
  readonly height: number;
}

type ShapeWithFill = Konva.Shape;

class Renderer {
  readonly byId = new Map<string, Konva.Group>();
  readonly warnings = new Set<string>();

  private readonly palette: RenderPalette;

  constructor(private readonly options: RenderOptions) {
    this.palette = { ...DEFAULT_PALETTE, ...options.palette };
  }

  render(node: SceneNode, pendingShadow?: Shadow): Konva.Group {
    const container = new Konva.Group({
      ...decompose(node.transform),
      opacity: node.opacity,
      visible: node.visible,
      name: node.name,
    });
    container.setAttr(SCENE_ID_ATTR, node.id);
    this.byId.set(node.id, container);

    // A sombra vai na primeira forma que a aceitar. Um grupo com efeito
    // (ex.: `filter` num grupo que envolve a forma) repassa a sombra à primeira forma descendente.
    const shadows = [...(pendingShadow ? [pendingShadow] : []), ...node.effects];
    const shadow = this.pickShadow(shadows);

    if (node.type === 'frame' && node.clip) {
      const { width, height, cornerRadius } = node;
      container.clipFunc((ctx) => {
        roundedRectPath(ctx, width, height, cornerRadius);
      });
    }

    const shapes = this.shapesOf(node);
    const shadowOwner = shadow ? shapes[0] : undefined;
    for (const shape of shapes) {
      shape.setAttr(SCENE_ID_ATTR, node.id);
      container.add(shape);
    }

    if (hasChildren(node)) {
      let forward = shadow && !shadowOwner ? shadow : undefined;
      for (const child of node.children) {
        container.add(this.render(child, forward));
        // Só o primeiro filho herda a sombra do grupo.
        forward = undefined;
      }
      if (shadow && !shadowOwner && node.children.length === 0) {
        this.warnings.add('sombra num grupo vazio foi ignorada');
      }
    }

    if (shadow && shadowOwner) applyShadow(shadowOwner, shadow);
    return container;
  }

  private pickShadow(shadows: readonly Shadow[]): Shadow | undefined {
    const outer = shadows.filter((s) => !s.inner);
    if (shadows.some((s) => s.inner)) {
      this.warnings.add('sombra interna não existe no canvas 2D: ignorada');
    }
    if (outer.length > 1) {
      this.warnings.add('só a primeira sombra externa de cada nó foi desenhada');
    }
    return outer[0];
  }

  /** As formas do próprio nó (sem os filhos). */
  private shapesOf(node: SceneNode): Konva.Shape[] {
    const box: Box = { width: node.width, height: node.height };
    const shapes: Konva.Shape[] = [];
    switch (node.type) {
      case 'frame':
      case 'rect': {
        for (const paint of node.fills) {
          const shape = new KonvaRect({
            width: node.width,
            height: node.height,
            cornerRadius: konvaRadius(node.cornerRadius),
            listening: true,
          });
          shapes.push(...this.fillShape(shape, paint, box));
        }
        if (node.stroke)
          shapes.push(this.rectStroke(node.stroke, box, node.cornerRadius));
        if (node.fills.length === 0 && !node.stroke && node.type === 'frame') {
          // Quadro transparente: uma área clicável invisível, para o hover achar o quadro.
          shapes.push(
            new KonvaRect({
              width: node.width,
              height: node.height,
              fill: 'transparent',
            }),
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
          const inset = strokeInset(node.stroke);
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
        const { style } = node;
        const attrs: TextConfig = {
          text: node.text,
          fontFamily: `"${style.fontFamily}", sans-serif`,
          fontSize: style.fontSize,
          fontStyle: fontStyle(style.fontWeight, style.italic),
          align: style.align,
          verticalAlign: style.verticalAlign,
          lineHeight: style.lineHeight ? style.lineHeight / style.fontSize : 1.2,
          letterSpacing: style.letterSpacing ?? 0,
          textDecoration: style.decoration ?? '',
          wrap: 'word',
        };
        if (node.width > 0) attrs.width = node.width;
        if (node.height > 0) attrs.height = node.height;
        // Texto do SVG sem largura: o x é a âncora (`text-anchor`), então o texto centrado
        // ou à direita cresce para a esquerda a partir dela.
        const anchor = (shape: KonvaText): KonvaText => {
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
        if (!slot) this.warnings.add(`nó não desenhado (${node.sourceType}): só a caixa`);
        shapes.push(
          new KonvaRect({
            width: node.width,
            height: node.height,
            stroke: slot ? this.palette.placeholderLine : this.palette.unknownLine,
            strokeWidth: 1,
            dash: slot ? [3, 5] : [4, 4],
            opacity: slot ? 0.6 : 1,
            strokeScaleEnabled: false,
          }),
        );
        return shapes;
      }
    }
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
    // `paint.url` é a imagem remota do nó `image` do componente: nesta fase ela fica sempre no
    // reservado (é o estado normal, sem aviso). A RI3 entrega a imagem pronta (já passada pela
    // política e pelo consentimento) por uma função das opções; o renderizador nunca cria
    // `Image` com URL remota.
    if (!paint.src && paint.url !== undefined)
      return placeholder(shape, box, this.palette);
    // Só a imagem embutida (`data:`) é carregada aqui; qualquer outro esquema vira reservado.
    if (!paint.src || !DATA_URL.test(paint.src)) {
      this.warnings.add('imagem sem pixels desenhada como reservado');
      return placeholder(shape, box, this.palette);
    }
    if (shape instanceof KonvaRect) {
      const image = new KonvaImage({
        image: undefined,
        width: box.width,
        height: box.height,
        cornerRadius: shape.cornerRadius(),
        opacity: paint.opacity ?? 1,
      });
      loadEmbeddedImage(paint.src, {
        onLoad: (element) => {
          image.image(element);
          this.options.onImageLoaded?.();
        },
        onError: () => {
          this.warnings.add('uma imagem embutida não pôde ser decodificada');
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

  private rectStroke(stroke: Stroke, box: Box, radius: CornerRadius): Konva.Shape {
    const inset = strokeInset(stroke);
    const shape = new KonvaRect({
      x: inset,
      y: inset,
      width: Math.max(0, box.width - inset * 2),
      height: Math.max(0, box.height - inset * 2),
      cornerRadius: konvaRadius(shrinkRadius(radius, inset)),
    });
    this.applyStroke(shape, stroke);
    return shape;
  }

  private applyStroke(
    shape: Konva.Shape,
    stroke: Stroke,
    kind: 'box' | 'line' | 'path' = 'box',
  ): void {
    const [paint, ...rest] = stroke.paints;
    if (rest.length > 0)
      this.warnings.add('só o primeiro preenchimento do traço foi usado');
    if (kind !== 'box' && stroke.align !== 'center') {
      this.warnings.add('traço por dentro/por fora em caminho ou linha foi centralizado');
    }
    shape.strokeWidth(stroke.width);
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
        this.warnings.add('traço com gradiente radial desenhado com a primeira cor');
        shape.stroke(paint.stops[0]?.color ?? this.palette.placeholderLine);
        return;
      }
      case 'image':
        this.warnings.add('traço com imagem desenhado em cinza');
        shape.stroke(this.palette.placeholderLine);
        return;
    }
  }
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

/** Sombra totalmente transparente ou sem desfoque nem deslocamento: não custa desenhar. */
export function isInvisibleShadow(shadow: Shadow): boolean {
  if (shadow.blur <= 0 && shadow.offset.x === 0 && shadow.offset.y === 0) return true;
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

function applyShadow(shape: Konva.Shape, shadow: Shadow): void {
  // Uma sombra invisível ainda custa um `shadowBlur` do canvas por desenho: fica de fora.
  if (isInvisibleShadow(shadow)) return;
  shape.shadowColor(shadow.color);
  shape.shadowBlur(shadow.blur);
  shape.shadowOffset(shadow.offset);
  shape.shadowOpacity(1);
  shape.shadowEnabled(true);
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

/** Caminho de retângulo arredondado no contexto (para o clip dos quadros). */
function roundedRectPath(
  ctx: Konva.Context,
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
  return { root, byId: renderer.byId, warnings: [...renderer.warnings] };
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
