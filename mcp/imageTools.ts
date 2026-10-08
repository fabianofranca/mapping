import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { projectIndex, type Marking, type ProjectImage } from '../src/model';
import { ToolError } from './errors';
import { decodeImage, encodeImage } from './image/codecs';
import {
  CHILD_COLORS,
  DEFAULT_MAX_SIZE,
  MARKING_OUTLINE,
  MAX_OUTLINED_CHILDREN,
  compose,
  type Outline,
} from './image/compose';
import { MIME, type ImageFormat } from './image/formats';
import { clampRect, fitSize, resize, type PixelRect, type Raster } from './image/raster';
import type { Refs } from './items';
import { resolveProjectFile, type Roots } from './paths';

export type ImageMode = 'crop' | 'context';

export interface MarkingImageOptions {
  readonly padding?: number;
  readonly mode?: ImageMode;
  readonly outlineChildren?: boolean;
  readonly maxSize?: number;
  readonly format?: ImageFormat;
}

export interface ImageFileOptions {
  readonly maxSize?: number;
  readonly format?: ImageFormat;
}

/** Texto (JSON) e a imagem que a tool devolve. */
export interface ImageResult {
  readonly json: Record<string, unknown>;
  readonly image: { readonly bytes: Uint8Array; readonly mimeType: string };
}

interface LoadedImage {
  readonly raster: Raster;
  readonly bytes: Uint8Array;
  readonly format: ImageFormat;
  readonly file: string;
  /** Razão arquivo / projeto: ≠ 1 se o arquivo não tem as dimensões gravadas no `mapping.json`. */
  readonly scaleX: number;
  readonly scaleY: number;
}

async function loadImage(
  roots: Roots,
  refs: Refs,
  image: ProjectImage,
): Promise<LoadedImage> {
  const absolute = await resolveProjectFile(roots, refs.loaded.location.dir, image.file);
  if (absolute === null) {
    throw new ToolError(
      'image-file-missing',
      `o arquivo da imagem não existe (ou está fora das raízes): ${image.file}`,
      { image: refs.ref('i', image.id), file: image.file },
    );
  }
  const bytes = new Uint8Array(await readFile(absolute));
  const { format, raster } = await decodeImage(bytes);
  return {
    raster,
    bytes,
    format,
    file: basename(absolute),
    scaleX: raster.width / image.width,
    scaleY: raster.height / image.height,
  };
}

/** Formato de saída padrão: JPEG para fotos (origem JPEG), PNG nos demais (prints e texto, sem perdas). */
function outputFormat(requested: ImageFormat | undefined, source: ImageFormat) {
  return requested ?? (source === 'jpeg' ? 'jpeg' : 'png');
}

function scaleRect(rect: PixelRect, loaded: LoadedImage): PixelRect {
  return {
    x: rect.x * loaded.scaleX,
    y: rect.y * loaded.scaleY,
    width: rect.width * loaded.scaleX,
    height: rect.height * loaded.scaleY,
  };
}

const sizeWarning = (loaded: LoadedImage, image: ProjectImage) =>
  loaded.scaleX === 1 && loaded.scaleY === 1
    ? {}
    : {
        warning: `o arquivo tem ${loaded.raster.width}×${loaded.raster.height}, mas o projeto registra ${image.width}×${image.height}: as coordenadas foram proporcionalmente ajustadas`,
      };

const rectJson = (r: PixelRect) => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

/** `get_marking_image`: recorte da marcação, ou a imagem inteira com ela destacada. */
export async function markingImage(
  roots: Roots,
  refs: Refs,
  marking: Marking,
  options: MarkingImageOptions,
): Promise<ImageResult> {
  const index = projectIndex(refs.project);
  const image = index.images.get(marking.imageId);
  if (!image) throw new ToolError('not-found', 'imagem da marcação não encontrada');
  const mode = options.mode ?? 'crop';
  const padding = options.padding ?? 0;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const loaded = await loadImage(roots, refs, image);

  const own = scaleRect(marking.rect, loaded);
  const region =
    mode === 'context'
      ? { x: 0, y: 0, width: loaded.raster.width, height: loaded.raster.height }
      : clampRect(
          {
            x: own.x - padding * loaded.scaleX,
            y: own.y - padding * loaded.scaleY,
            width: own.width + 2 * padding * loaded.scaleX,
            height: own.height + 2 * padding * loaded.scaleY,
          },
          loaded.raster,
        );
  if (!region) {
    throw new ToolError(
      'marking-outside-image',
      'a marcação está fora da imagem: nada a recortar',
      {
        rect: rectJson(marking.rect),
        image: { width: image.width, height: image.height },
      },
    );
  }

  const legend: { color: string; name: string; ref: string; rect: PixelRect }[] = [];
  const outlines: Outline[] = [];
  if (mode === 'context') outlines.push({ rect: own, color: MARKING_OUTLINE });
  let omitted = 0;
  if (options.outlineChildren) {
    const children = index.children.get(marking.id) ?? [];
    children.forEach((child, i) => {
      if (i >= MAX_OUTLINED_CHILDREN) {
        omitted++;
        return;
      }
      const color = CHILD_COLORS[i % CHILD_COLORS.length]!;
      outlines.push({ rect: scaleRect(child.rect, loaded), color });
      legend.push({
        color,
        name: refs.markingName(child.id),
        ref: refs.ref('m', child.id),
        rect: child.rect,
      });
    });
  }

  const composed = compose(loaded.raster, region, outlines, maxSize);
  const format = outputFormat(options.format, loaded.format);
  const bytes = await encodeImage(composed.raster, format);

  const markingOutline = mode === 'context' ? composed.outlines[0]! : null;
  const markingInOutput =
    markingOutline?.output ??
    ((): PixelRect => {
      const s = composed.scale;
      return {
        x: Math.round((own.x - composed.region.x) * s),
        y: Math.round((own.y - composed.region.y) * s),
        width: Math.max(1, Math.round(own.width * s)),
        height: Math.max(1, Math.round(own.height * s)),
      };
    })();

  return {
    json: {
      ref: refs.ref('m', marking.id),
      mode,
      image: { ref: refs.ref('i', image.id), file: image.file },
      format,
      width: composed.raster.width,
      height: composed.raster.height,
      scale: composed.scale,
      // A região da imagem original que a saída mostra (pixels da imagem; x = y = 0 na imagem inteira).
      region: rectJson(composed.region),
      padding,
      // Onde a marcação ficou na saída (pixels da imagem devolvida).
      markingInOutput: rectJson(markingInOutput),
      ...(mode === 'context'
        ? { markingOutline: { color: MARKING_OUTLINE, thickness: 2 } }
        : {}),
      ...(options.outlineChildren
        ? {
            childrenLegend: legend.map((l) => ({
              color: l.color,
              name: l.name,
              ref: l.ref,
              rect: rectJson(l.rect),
            })),
            ...(omitted > 0 ? { childrenNotOutlined: omitted } : {}),
          }
        : {}),
      ...sizeWarning(loaded, image),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

/** `get_image_file`: a imagem inteira, reduzida se passar de `maxSize`. */
export async function imageFile(
  roots: Roots,
  refs: Refs,
  image: ProjectImage,
  options: ImageFileOptions,
): Promise<ImageResult> {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const loaded = await loadImage(roots, refs, image);
  const { raster } = loaded;
  const target = fitSize(raster.width, raster.height, maxSize);

  const same =
    target.scale === 1 && (!options.format || options.format === loaded.format);
  const format = outputFormat(options.format, loaded.format);
  // Cabe e o formato não mudou: devolve o arquivo como está, sem recodificar.
  const bytes = same
    ? loaded.bytes
    : await encodeImage(
        target.scale === 1 ? raster : resize(raster, target.width, target.height),
        format,
      );
  return {
    json: {
      ref: refs.ref('i', image.id),
      file: image.file,
      format: same ? loaded.format : format,
      width: target.width,
      height: target.height,
      originalWidth: raster.width,
      originalHeight: raster.height,
      scale: target.scale,
      recoded: !same,
      ...sizeWarning(loaded, image),
    },
    image: { bytes, mimeType: MIME[same ? loaded.format : format] },
  };
}
