import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  approximateMeasurer,
  createDrawingCache,
  isBackgroundContainer,
  projectIndex,
  type Marking,
  type ProjectContainer,
} from '../src/model';
import { ToolError } from './errors';
import { decodeImage, encodeImage } from './image/codecs';
import {
  CHILD_COLORS,
  DEFAULT_MAX_SIZE,
  MARKING_OUTLINE,
  MAX_OUTLINED_CHILDREN,
  compose,
  hexToRgb,
  type Outline,
} from './image/compose';
import { MIME, type ImageFormat } from './image/formats';
import {
  clampRect,
  createRaster,
  fitSize,
  resize,
  type PixelRect,
  type Raster,
} from './image/raster';
import { paintScene } from './image/sceneRaster';
import type { ImageServer } from './imageServer';
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
  readonly file: string | null;
  /** Razão arquivo / projeto: ≠ 1 se o arquivo não tem as dimensões gravadas no `mapping.json`. */
  readonly scaleX: number;
  readonly scaleY: number;
}

const EXTENSION: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

/**
 * `url` (HTTP local) e `markdown` da imagem devolvida. Sem servidor, ou se ele não subir
 * (aviso no stderr), a tool responde sem esses campos.
 */
async function urlFields(
  images: ImageServer | null,
  bytes: Uint8Array,
  format: ImageFormat,
  alt: string,
): Promise<{ url?: string; markdown?: string }> {
  if (!images) return {};
  try {
    const url = await images.publish(bytes, MIME[format], EXTENSION[format]);
    const cleanAlt = alt.replace(/[\]\r\n]+/g, ' ').trim();
    return { url, markdown: `![${cleanAlt}](${url})` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mapping-mcp: servidor de imagens indisponível: ${message}\n`);
    return {};
  }
}

/** Mais pixels que isso, o container sem arquivo é rasterizado reduzido (é uma cor só). */
const MAX_BACKGROUND_PIXELS = 4096 * 4096;

/**
 * Container sem arquivo: um raster liso com a cor `background`, no tamanho da imagem
 * (o desenho dos componentes é pintado por cima depois, só na região pedida) (reduzido se for enorme: `scaleX`/`scaleY` ≠ 1 já são tratados).
 */
function blankImage(image: ProjectContainer): LoadedImage {
  const shrink = Math.min(1, Math.sqrt(MAX_BACKGROUND_PIXELS / (image.width * image.height)));
  const raster = createRaster(
    Math.max(1, Math.round(image.width * shrink)),
    Math.max(1, Math.round(image.height * shrink)),
  );
  const [r, g, b] = hexToRgb(image.background ?? '#FFFFFF');
  for (let i = 0; i < raster.data.length; i += 4) {
    raster.data[i] = r;
    raster.data[i + 1] = g;
    raster.data[i + 2] = b;
    raster.data[i + 3] = 255;
  }
  return {
    raster,
    bytes: new Uint8Array(),
    format: 'png',
    file: null,
    scaleX: raster.width / image.width,
    scaleY: raster.height / image.height,
  };
}

async function loadImage(
  roots: Roots,
  refs: Refs,
  image: ProjectContainer,
): Promise<LoadedImage> {
  if (image.file === null) return blankImage(image);
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

const sizeWarning = (loaded: LoadedImage, image: ProjectContainer) =>
  (loaded.scaleX === 1 && loaded.scaleY === 1) || loaded.file === null
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
  images: ImageServer | null = null,
): Promise<ImageResult> {
  const index = projectIndex(refs.project);
  const image = index.containers.get(marking.containerId);
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

  // Container sem arquivo: pinta o desenho simplificado dos componentes (cena instanciada com o
  // medidor aproximado; o servidor não tem fontes) na região que a saída mostra.
  const blank = isBackgroundContainer(image);
  if (blank) {
    const drawings = createDrawingCache()(
      refs.project,
      refs.loaded.catalog,
      approximateMeasurer,
      0,
    );
    paintScene(
      loaded.raster,
      [...drawings.values()].filter((d) => d.containerId === image.id),
      approximateMeasurer,
      { scaleX: loaded.scaleX, scaleY: loaded.scaleY, clip: region },
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
      image: {
        ref: refs.ref('i', image.id),
        file: image.file,
        ...(blank ? { blank: true, background: image.background } : {}),
      },
      ...(blank
        ? {
            drawing: 'simplified',
            drawingNote:
              'texto em barras; cores sólidas (sem gradiente, sombra nem fontes)',
          }
        : {}),
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
      ...(await urlFields(images, bytes, format, refs.markingName(marking.id))),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

/** `get_image_file`: a imagem inteira, reduzida se passar de `maxSize`. */
export async function imageFile(
  roots: Roots,
  refs: Refs,
  image: ProjectContainer,
  options: ImageFileOptions,
  images: ImageServer | null = null,
): Promise<ImageResult> {
  if (isBackgroundContainer(image)) {
    throw new ToolError(
      'container-without-file',
      'O container não tem arquivo: use get_marking_image para ver o desenho.',
      { image: refs.ref('i', image.id) },
    );
  }
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
      ...(await urlFields(
        images,
        bytes,
        same ? loaded.format : format,
        image.file ?? '',
      )),
    },
    image: { bytes, mimeType: MIME[same ? loaded.format : format] },
  };
}
