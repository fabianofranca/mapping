import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type { IconClip } from './icons';
import {
  invalidValue,
  type Problems,
  unsupportedAttribute,
  unsupportedElement,
} from './svgProblems';
import { SHAPE_ATTRIBUTES, isBasicShape, parseLength, shapePath } from './svgShapes';
import { styleDeclarations, type XmlElement } from './svgXml';

/**
 * SVG `clipPath` → the icon's `clip` (stage #2847, decision 9).
 *
 * `ClipResolver.reference(element)` reads the `clip-path` of a `g` or of a shape and returns the id
 * of its non-trivial clip (Figma's full-`viewBox` wrapper is dropped, `undefined`). The walk keeps
 * each painted shape's chain of those ids, and `settle(chains)` turns them into the one clip of the
 * whole icon, or names why they cannot be one (a clip inside another, a clip over only part of the
 * icon).
 *
 * A `clipPath` is read only when something references it: it holds one shape (`path`, `rect`,
 * `circle`, `ellipse`, `polygon` or `polyline`, closed by the clip) in `userSpaceOnUse`, with no
 * `transform`. The paint properties of that shape are ignored (Figma writes `fill="white"`), and
 * `clip-rule` becomes `fillRule`.
 *
 * Pure functions, no DOM: it runs in Node (the `import_icons` tool) and in the browser.
 */

export interface ClipEnvironment {
  /** The `viewBox` size: a clip that is a rect over all of it clips nothing. */
  readonly box: readonly [number, number];
  /** Every element of the file with an `id`: what a `url(#id)` points at. */
  readonly ids: ReadonlyMap<string, XmlElement>;
  readonly problems: Problems;
}

const CLIP_REFERENCE = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/;

/** Properties of the clip's shape that change nothing in a clip (silently ignored). */
const IGNORED_PROPERTIES: ReadonlySet<string> = new Set([
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-dasharray',
  'opacity',
]);
const NEUTRAL_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'class', 'style']);

const isXmlns = (name: string): boolean => name === 'xmlns' || name.startsWith('xmlns:');

// ---------------------------------------------------------------------------------------------
// Figma's wrapper: a clip that is a `rect` over the whole `viewBox`

const FULL_RECT_ATTRIBUTES = ['x', 'y', 'width', 'height', 'fill', 'id'];

function coversBox(rect: XmlElement, box: ClipEnvironment['box']): boolean {
  const at = (name: string, fallback: number): number | undefined => {
    const value = rect.attributes.get(name);
    const n = value === undefined ? fallback : parseLength(value);
    return typeof n === 'number' ? n : undefined;
  };
  return (
    rect.name === 'rect' &&
    [...rect.attributes.keys()].every((name) => FULL_RECT_ATTRIBUTES.includes(name)) &&
    at('x', 0) === 0 &&
    at('y', 0) === 0 &&
    at('width', NaN) === box[0] &&
    at('height', NaN) === box[1]
  );
}

/** A `clipPath` with only an `id` holding one `rect` over the whole `viewBox`. */
export function isFullClip(clip: XmlElement, box: ClipEnvironment['box']): boolean {
  const [rect] = clip.children;
  return (
    clip.children.length === 1 &&
    rect !== undefined &&
    rect.children.length === 0 &&
    [...clip.attributes.keys()].every((name) => name === 'id') &&
    coversBox(rect, box)
  );
}

// ---------------------------------------------------------------------------------------------
// The `clipPath` and its shape

/** `clip-rule` (attribute, then `style`, which wins); `undefined` after reporting a bad value. */
function clipRule(
  shape: XmlElement,
  problems: Problems,
): { readonly fillRule?: 'evenodd' } | undefined {
  let value = shape.attributes.get('clip-rule');
  const inline = shape.attributes.get('style');
  for (const [name, declared] of inline === undefined ? [] : styleDeclarations(inline))
    if (name === 'clip-rule') value = declared;
  const rule = value?.trim();
  if (rule === undefined || rule === 'nonzero') return {};
  if (rule === 'evenodd') return { fillRule: 'evenodd' };
  problems.add(invalidValue(shape.name, 'clip-rule', rule));
  return undefined;
}

/** A `style` property of the clip's shape that changes nothing in a clip. */
const isNeutralProperty = (name: string): boolean =>
  name === 'clip-rule' || IGNORED_PROPERTIES.has(name);

const isNeutralAttribute = (name: string): boolean =>
  isNeutralProperty(name) || NEUTRAL_ATTRIBUTES.has(name) || isXmlns(name);

/** Reports what the clip's shape carries that is not geometry, `clip-rule` or a paint property. */
function checkShapeAttributes(shape: XmlElement, problems: Problems): void {
  const own = shape.name === 'path' ? ['d'] : (SHAPE_ATTRIBUTES[shape.name] ?? []);
  const inline = shape.attributes.get('style');
  const declared = (inline === undefined ? [] : styleDeclarations(inline)).map(
    ([name]) => name,
  );
  const attributes = [...shape.attributes.keys()].filter(
    (name) => !own.includes(name) && !isNeutralAttribute(name),
  );
  for (const name of [...attributes, ...declared.filter((n) => !isNeutralProperty(n))])
    problems.add(unsupportedAttribute(shape.name, name));
}

/** Reports the attributes of the `clipPath` itself: `id`, `class` and `userSpaceOnUse` units. */
function checkClipPathAttributes(clip: XmlElement, problems: Problems): void {
  for (const [name, value] of clip.attributes) {
    if (name === 'id' || name === 'class' || isXmlns(name)) continue;
    if (name !== 'clipPathUnits' || value.trim() !== 'userSpaceOnUse')
      problems.add(unsupportedAttribute('clipPath', name));
  }
}

/** The `d` of a `path`; `undefined` after reporting that it is missing or blank. */
function pathData(shape: XmlElement, problems: Problems): string | undefined {
  const d = shape.attributes.get('d');
  if (d !== undefined && d.trim() !== '') return d;
  problems.add(invalidValue('path', 'd', d ?? ''));
  return undefined;
}

/** The problem of a basic shape whose attribute is missing, wrong or in another unit. */
function shapeProblem(
  shape: XmlElement,
  failure: { readonly attribute: string; readonly unit: boolean },
): ModelMessage {
  const { attribute, unit } = failure;
  return unit
    ? unsupportedAttribute(shape.name, attribute)
    : invalidValue(shape.name, attribute, shape.attributes.get(attribute) ?? '');
}

/** The path data of the clip's shape; a polyline is closed. `undefined` after reporting. */
function shapeData(shape: XmlElement, problems: Problems): string | undefined {
  if (shape.name === 'path') return pathData(shape, problems);
  const result = shapePath(shape.name, (name) => shape.attributes.get(name));
  if (result === undefined) return undefined;
  if (result.ok) return shape.name === 'polyline' ? `${result.d}Z` : result.d;
  problems.add(shapeProblem(shape, result));
  return undefined;
}

/** The only shape of the `clipPath`; `undefined` after reporting what is wrong with its content. */
function onlyShape(
  id: string,
  clip: XmlElement,
  problems: Problems,
): XmlElement | undefined {
  if (clip.children.length > 1) {
    problems.add(templateMessage('svgIcon.clipShapes', { id }));
    return undefined;
  }
  const [shape] = clip.children;
  if (shape === undefined) problems.add(unsupportedElement('clipPath'));
  else if (shape.name === 'line' || (shape.name !== 'path' && !isBasicShape(shape.name)))
    problems.add(unsupportedElement(shape.name));
  else return shape;
  return undefined;
}

/** The icon clip of one `clipPath`; `undefined` once the problems are reported. */
function convertClipPath(
  id: string,
  clip: XmlElement,
  problems: Problems,
): IconClip | undefined {
  const before = problems.size;
  checkClipPathAttributes(clip, problems);
  const shape = onlyShape(id, clip, problems);
  if (shape === undefined) return undefined;
  checkShapeAttributes(shape, problems);
  const d = shapeData(shape, problems);
  const rule = clipRule(shape, problems);
  if (d === undefined || rule === undefined || problems.size > before) return undefined;
  return { d, ...rule };
}

// ---------------------------------------------------------------------------------------------
// The references and the chains

export class ClipResolver {
  /** The icon clip of every referenced `clipPath`, converted once (`undefined`: it had problems). */
  private readonly converted = new Map<string, IconClip | undefined>();

  constructor(private readonly env: ClipEnvironment) {}

  /**
   * The id of the non-trivial clip that `element`'s `clip-path` points at; `undefined` without a
   * `clip-path`, with `none`, with Figma's full-`viewBox` clip, or after reporting a bad reference.
   */
  reference(element: XmlElement): string | undefined {
    const value = element.attributes.get('clip-path')?.trim();
    if (value === undefined || value === 'none') return undefined;
    const id = CLIP_REFERENCE.exec(value)?.[1];
    const target = id === undefined ? undefined : this.env.ids.get(id);
    if (id === undefined || target?.name !== 'clipPath') {
      this.env.problems.add(invalidValue(element.name, 'clip-path', value));
      return undefined;
    }
    return this.convert(id, target);
  }

  /** Converts the `clipPath` once; its id, or `undefined` for the full-`viewBox` clip. */
  private convert(id: string, target: XmlElement): string | undefined {
    if (isFullClip(target, this.env.box)) return undefined;
    if (!this.converted.has(id))
      this.converted.set(id, convertClipPath(id, target, this.env.problems));
    return id;
  }

  /**
   * The one clip of the icon from the chain of clip ids of each painted shape (outermost first).
   * `undefined` when no shape is clipped, or after reporting a clip inside another clip, or clips
   * that differ between shapes (a clipped shape next to an unclipped one included).
   */
  settle(chains: readonly (readonly string[])[]): IconClip | undefined {
    const unique = chains.map((chain) => [...new Set(chain)]);
    const nested = unique.find((chain) => chain.length > 1);
    if (nested !== undefined) {
      const id = nested[nested.length - 1] as string;
      this.env.problems.add(templateMessage('svgIcon.clipNested', { id }));
      return undefined;
    }
    const ids = new Set(unique.map((chain) => chain[0]));
    if (ids.size > 1) {
      const id = [...ids].find((item) => item !== undefined) as string;
      this.env.problems.add(templateMessage('svgIcon.clipPartial', { id }));
      return undefined;
    }
    const [only] = ids;
    return only === undefined ? undefined : this.converted.get(only);
  }
}
