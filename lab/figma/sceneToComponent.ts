/**
 * Laboratório: transforma uma cena importada (SVG do Figma ou JSON da API) num arquivo de
 * componente do laboratório "Componentes" (`mapping-component`). É um ponto de partida: o
 * template fica com `layout: none` e âncoras à esquerda/em cima (posições fixas), os textos
 * viram campos (`{"$field": "<nome>"}` com o texto atual como `default`) e o resto é estático.
 * Quem edita o arquivo troca âncoras e liga cores e visibilidade aos campos.
 */
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSION,
  type ComponentFile,
  type FillSpec,
  type FrameTemplate,
  type ShadowSpec,
  type StrokeSpec,
  type TemplateNode,
} from '../components/componentFormat';
import type { CornerRadius, Paint, Scene, SceneNode } from '../scene/scene';

export interface ConversionResult {
  readonly component: ComponentFile;
  /** Campos criados a partir dos textos: chave → texto de exemplo. */
  readonly fields: readonly { readonly key: string; readonly sample: string }[];
  readonly warnings: readonly string[];
}

/** `Button/label` → `button_label`; vazio → `text_<n>`. */
export function fieldKey(name: string, taken: Set<string>): string {
  let base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (base === '' || /^[0-9]/.test(base)) base = `text_${base}`.replace(/_$/, '');
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
}

function paintToFill(
  paint: Paint | undefined,
  warnings: Set<string>,
): FillSpec | undefined {
  if (!paint) return undefined;
  switch (paint.type) {
    case 'solid':
      return withOpacity(paint.color, paint.opacity);
    case 'linear': {
      const dx = paint.end.x - paint.start.x;
      const dy = paint.end.y - paint.start.y;
      const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      return { type: 'linear', angle, stops: paint.stops.map((s) => ({ ...s })) };
    }
    case 'radial':
      warnings.add(
        'gradiente radial virou linear (o formato de componente só tem linear)',
      );
      return { type: 'linear', angle: 90, stops: paint.stops.map((s) => ({ ...s })) };
    case 'image':
      warnings.add('imagem descartada: o componente não guarda pixels');
      return '#E5E7EB';
  }
}

/** Opacidade do paint entra na cor (o template não tem opacidade por preenchimento). */
function withOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined || opacity >= 1) return color;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const a = Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${hex[1]}${a}`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgb) {
    const [r, g, b, a = '1'] = (rgb[1] ?? '').split(',').map((s) => s.trim());
    return `rgba(${r}, ${g}, ${b}, ${Math.round(Number(a) * opacity * 1000) / 1000})`;
  }
  return color;
}

/** Caixa do nó no espaço do pai (só translação; rotação/escala são avisadas e ignoradas). */
function placement(node: SceneNode, warnings: Set<string>) {
  const [a, b, c, d, e, f] = node.transform;
  if (
    Math.abs(a - 1) > 1e-3 ||
    Math.abs(d - 1) > 1e-3 ||
    Math.abs(b) > 1e-3 ||
    Math.abs(c) > 1e-3
  ) {
    warnings.add(`rotação/escala ignorada em "${node.name}"`);
  }
  return { x: Math.round(e * 100) / 100, y: Math.round(f * 100) / 100 };
}

function strokeOf(node: SceneNode, warnings: Set<string>): StrokeSpec | undefined {
  if (!node.stroke) return undefined;
  const fill = paintToFill(node.stroke.paints[0], warnings);
  let color = '#9CA3AF';
  if (typeof fill === 'string') color = fill;
  else if (fill) warnings.add(`traço com gradiente em "${node.name}" virou cinza`);
  return {
    color,
    width: node.stroke.width,
    align: node.stroke.align,
    ...(node.stroke.dash ? { dash: [...node.stroke.dash] } : {}),
  };
}

function shadowOf(node: SceneNode): ShadowSpec | undefined {
  const shadow = node.effects.find((e) => !e.inner);
  if (!shadow) return undefined;
  return {
    color: shadow.color,
    x: shadow.offset.x,
    y: shadow.offset.y,
    blur: shadow.blur,
  };
}

function radius(r: CornerRadius): number | readonly [number, number, number, number] {
  return typeof r === 'number' ? r : [r[0], r[1], r[2], r[3]];
}

/** Atributos comuns a todo nó do template, a partir do nó da cena. */
function baseOf(node: SceneNode, warnings: Set<string>) {
  const { x, y } = placement(node, warnings);
  if (node.fills.length > 1) {
    warnings.add(`só o primeiro preenchimento de "${node.name}" foi mantido`);
  }
  const fill = paintToFill(node.fills[0], warnings);
  const stroke = strokeOf(node, warnings);
  const shadow = shadowOf(node);
  return {
    name: node.name,
    anchors: { left: x, top: y },
    width: Math.round(node.width * 100) / 100,
    height: Math.round(node.height * 100) / 100,
    ...(node.opacity < 1 ? { opacity: node.opacity } : {}),
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(shadow ? { shadow } : {}),
  };
}

function convertNode(
  node: SceneNode,
  taken: Set<string>,
  fields: { key: string; sample: string }[],
  warnings: Set<string>,
): TemplateNode | undefined {
  if (!node.visible) return undefined;
  const base = baseOf(node, warnings);
  switch (node.type) {
    case 'frame':
    case 'group': {
      const children = node.children
        .map((child) => convertNode(child, taken, fields, warnings))
        .filter((c): c is TemplateNode => c !== undefined);
      return {
        ...base,
        type: 'frame',
        layout: { type: 'none' },
        ...(node.type === 'frame' && node.clip ? { clip: true } : {}),
        ...(node.type === 'frame' ? { cornerRadius: radius(node.cornerRadius) } : {}),
        children,
      };
    }
    case 'rect':
      return { ...base, type: 'rect', cornerRadius: radius(node.cornerRadius) };
    case 'ellipse':
      return { ...base, type: 'ellipse' };
    case 'path':
      return {
        ...base,
        type: 'path',
        d: node.d,
        viewBox: [Math.max(1, node.width), Math.max(1, node.height)],
        fillRule: node.fillRule,
        ...(base.fill === undefined ? { fill: 'none' } : {}),
      };
    case 'line':
      warnings.add(`linha "${node.name}" virou caminho`);
      return {
        ...base,
        type: 'path',
        d:
          node.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('') +
          (node.closed ? 'Z' : ''),
        viewBox: [Math.max(1, node.width), Math.max(1, node.height)],
        ...(base.fill === undefined ? { fill: 'none' } : {}),
      };
    case 'text': {
      const key = fieldKey(node.name, taken);
      fields.push({ key, sample: node.text });
      const { fill, ...rest } = base;
      return {
        ...rest,
        type: 'text',
        width: node.width > 0 ? base.width : 'hug',
        height: 'hug',
        text: { $field: key, default: node.text },
        color: typeof fill === 'string' ? fill : '#000000',
        font: {
          family: node.style.fontFamily,
          size: node.style.fontSize,
          weight: node.style.fontWeight,
          ...(node.style.italic ? { italic: true } : {}),
          ...(node.style.lineHeight ? { lineHeight: node.style.lineHeight } : {}),
          ...(node.style.letterSpacing
            ? { letterSpacing: node.style.letterSpacing }
            : {}),
          align: node.style.align === 'justify' ? 'left' : node.style.align,
          verticalAlign: node.style.verticalAlign,
          ...(node.style.decoration ? { decoration: node.style.decoration } : {}),
        },
      };
    }
    case 'unknown':
      warnings.add(`nó não suportado descartado: "${node.name}" (${node.sourceType})`);
      return undefined;
  }
}

/** Converte a cena num componente com o `id` dado; a raiz vira o template (ocupa a caixa). */
export function sceneToComponent(scene: Scene, id: string, name = id): ConversionResult {
  const taken = new Set<string>();
  const fields: { key: string; sample: string }[] = [];
  const warnings = new Set<string>(scene.warnings);
  const root = convertNode(scene.root, taken, fields, warnings);
  if (!root || root.type !== 'frame')
    throw new Error('A raiz da cena precisa ser um quadro ou grupo visível.');
  // A raiz ocupa a caixa da instância: sem âncoras nem tamanho próprios.
  const rootRest: FrameTemplate = { ...root };
  delete (rootRest as { anchors?: unknown }).anchors;
  delete (rootRest as { width?: unknown }).width;
  delete (rootRest as { height?: unknown }).height;
  const template: FrameTemplate = { ...rootRest, type: 'frame', clip: true };
  const preview: Record<string, string> = {};
  for (const field of fields) preview[field.key] = field.sample;
  const component: ComponentFile = {
    format: COMPONENT_FORMAT,
    formatVersion: COMPONENT_FORMAT_VERSION,
    id,
    name,
    description: `Gerado pelo laboratório a partir de ${scene.source === 'svg' ? 'um SVG' : 'JSON do Figma'}.`,
    size: { width: Math.round(scene.root.width), height: Math.round(scene.root.height) },
    preview,
    template,
  };
  return { component, fields, warnings: [...warnings] };
}
