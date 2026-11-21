import { isRecord } from './isRecord';
import { detectFormat, readSize, type ImageFormat } from './imageHeader';
import { isPackageImagePath } from './components/imagePath';
import type { ModelMessageTemplateCode } from './messages';

// Package images in the library validator (`library.ts`, `libraryDrawing.ts`): which `image`
// nodes cite a package file, and what a cited file has to satisfy. Pure: no DOM, no Node APIs.

/** A cited image over this many bytes is an error. */
export const MAX_IMAGE_BYTES = 1024 * 1024;
/** A cited image over this many pixels on a side is an error. */
export const MAX_IMAGE_SIDE = 2048;
/** The distinct cited images of a package over this many bytes in all is an error. */
export const MAX_IMAGES_TOTAL_BYTES = 8 * 1024 * 1024;

/** An `image` node of a template: its path, its raw `src` and the `repeat` that wraps it. */
export interface ImageNodeRef {
  readonly path: string;
  readonly src: unknown;
  readonly repeat: Record<string, unknown> | undefined;
}

/**
 * Every `image` node of the template's JSON, with the node path and the `repeat` that wraps it
 * (`undefined` outside a `repeat`).
 */
export function imageNodes(
  node: unknown,
  path: string,
  repeat: Record<string, unknown> | undefined,
  out: ImageNodeRef[] = [],
): ImageNodeRef[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => imageNodes(item, `${path}[${i}]`, repeat, out));
    return out;
  }
  if (!isRecord(node)) return out;
  if (node.type === 'image') {
    out.push({ path, src: node.src, repeat });
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    // `repeat`: the `template` reads columns of the row; the nodes inside have the `repeat` as context.
    const inner = node.type === 'repeat' && key === 'template' ? node : repeat;
    imageNodes(value, `${path}.${key}`, inner, out);
  }
  return out;
}

/** The literal results of a `$switch` (`cases`, `default`) or `$if` (`then`, `else`), with their paths. */
function expressionResults(
  src: Record<string, unknown>,
  at: string,
): { path: string; value: unknown }[] {
  if ('$switch' in src) {
    const cases = isRecord(src.cases) ? Object.entries(src.cases) : [];
    return [
      ...cases.map(([key, value]) => ({ path: `${at}.cases.${key}`, value })),
      ...('default' in src ? [{ path: `${at}.default`, value: src.default }] : []),
    ];
  }
  if ('$if' in src) {
    return [
      { path: `${at}.then`, value: src.then },
      ...('else' in src ? [{ path: `${at}.else`, value: src.else }] : []),
    ];
  }
  return [];
}

/** A package image path cited by a literal in a template, with the JSON path of the literal. */
export interface CitedImage {
  readonly path: string;
  readonly ref: string;
}

/**
 * The package image paths a template cites: the literal `src` of each `image` node and every
 * literal result of a `$switch` or `$if` `src`. A `$field` `src`, a URL and anything that is not
 * a package image path are not cited here.
 */
export function citedImages(template: unknown): CitedImage[] {
  const out: CitedImage[] = [];
  for (const node of imageNodes(template, 'template', undefined)) {
    const at = `${node.path}.src`;
    const literals =
      typeof node.src === 'string'
        ? [{ path: at, value: node.src as unknown }]
        : isRecord(node.src)
          ? expressionResults(node.src, at)
          : [];
    for (const { path, value } of literals) {
      if (typeof value === 'string' && isPackageImagePath(value))
        out.push({ path, ref: value });
    }
  }
  return out;
}

/** What a template reads as image text: a type field or a column of the `repeat`'s table. */
export interface ImageFieldRef {
  readonly key: string;
  /** The `table` field of the wrapping `repeat` (`undefined` outside a `repeat`). */
  readonly table: string | undefined;
}

/** The `image` nodes bound to a field (`src: { "$field": k }`). */
export function imageFieldRefs(template: unknown): ImageFieldRef[] {
  const out: ImageFieldRef[] = [];
  for (const node of imageNodes(template, 'template', undefined)) {
    const src = node.src;
    if (!isRecord(src) || typeof src.$field !== 'string') continue;
    out.push({
      key: src.$field,
      table: typeof node.repeat?.field === 'string' ? node.repeat.field : undefined,
    });
  }
  return out;
}

const FORMAT_OF_EXTENSION: readonly (readonly [string, ImageFormat])[] = [
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
  ['.webp', 'webp'],
];

/** The format the extension names (any case); `null` when it is not an image extension. */
export function formatOfExtension(path: string): ImageFormat | null {
  const lower = path.toLowerCase();
  return FORMAT_OF_EXTENSION.find(([ext]) => lower.endsWith(ext))?.[1] ?? null;
}

/** A problem of a cited image file: the message code and its parameters. */
export interface ImageProblem {
  readonly code: ModelMessageTemplateCode;
  readonly params: Readonly<Record<string, string | number>>;
}

/** What the validator knows about a cited image file. */
export interface ImageFileFacts {
  readonly bytes?: Uint8Array | undefined;
  /** Byte length of a file read without content. */
  readonly size?: number | undefined;
}

/** Byte length of the file (the content's, or the size passed alone); `undefined` if unknown. */
export function imageSize(file: ImageFileFacts): number | undefined {
  return file.bytes?.length ?? file.size;
}

/** More than 2048 px on a side (read from the header); nothing when the size cannot be read. */
function oversize(path: string, bytes: Uint8Array, format: ImageFormat): ImageProblem[] {
  const size = readSize(bytes, format);
  if (size === null || Math.max(size.width, size.height) <= MAX_IMAGE_SIDE) return [];
  return [
    {
      code: 'library.imageTooWide',
      params: { path, width: size.width, height: size.height },
    },
  ];
}

/**
 * The problems of an existing cited image: the content does not match the extension's format,
 * more than 1 MB, more than 2048 px on a side. Without bytes only the size can be checked (when
 * known).
 */
export function imageProblems(path: string, file: ImageFileFacts): ImageProblem[] {
  const { bytes } = file;
  const format = bytes === undefined ? null : detectFormat(bytes);
  if (bytes !== undefined && format !== formatOfExtension(path)) {
    return [{ code: 'library.imageBadFormat', params: { path } }];
  }
  const out: ImageProblem[] = [];
  const size = imageSize(file);
  if (size !== undefined && size > MAX_IMAGE_BYTES) {
    out.push({ code: 'library.imageTooHeavy', params: { path } });
  }
  if (bytes !== undefined && format !== null) out.push(...oversize(path, bytes, format));
  return out;
}
