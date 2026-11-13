import {
  isBackgroundContainer,
  projectIndex,
  type ReadingDirection,
  type Marking,
  type ProjectContainer,
} from '../src/model';
import { ToolError } from './errors';
import { encodeImage } from './image/codecs';
import { hexToRgb } from './image/compose';
import { declaredModes, paintContainerDrawings } from './image/containerDrawing';
import { MAX_PIXELS, MIME, type ImageFormat } from './image/formats';
import { clampRect, createRaster, crop, resize, type PixelRect } from './image/raster';
import { loadImage, rectJson, scaleRect, sizeWarning, urlFields } from './imageTools';
import type { ImageResult } from './imageTools';
import type { ImageServer } from './imageServer';
import type { Refs } from './items';
import type { Roots } from './paths';

// `render_marking` e `render_container` (decisão 32): o desenho dos componentes como PNG, com texto
// real, no zoom e no modo pedidos. É o desenho do servidor, não uma captura da app.

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export interface RenderOptions {
  readonly zoom?: number;
  readonly drawingMode?: string;
  /** Fixa a direção de leitura na imagem (como o `drawingMode`); ausente = a efetiva de cada container. */
  readonly direction?: ReadingDirection;
  /** `image` (padrão): o arquivo do container (ou a cor de fundo, sem arquivo); `none`: transparente. */
  readonly background?: 'image' | 'none';
  /** Margem em volta da marcação, em pixels do container (só `render_marking`). */
  readonly padding?: number;
  readonly format?: ImageFormat;
}

/** Os ids da marcação e de todas as suas descendentes. */
function subtree(refs: Refs, marking: Marking): Set<string> {
  const children = projectIndex(refs.project).children;
  const ids = new Set<string>();
  const visit = (id: string) => {
    ids.add(id);
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  visit(marking.id);
  return ids;
}

function checkMode(refs: Refs, mode: string | undefined): void {
  if (mode === undefined) return;
  const modes = declaredModes(refs.project);
  if (!modes.includes(mode)) {
    throw new ToolError(
      'invalid-arguments',
      `modo do desenho não declarado por nenhuma especialização aplicada: ${mode}`,
      { drawingMode: mode, declared: modes },
    );
  }
}

/** O fundo da região: o arquivo do container recortado e escalado, a cor de fundo ou nada. */
async function backdrop(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  region: PixelRect,
  size: { width: number; height: number },
  background: 'image' | 'none',
) {
  const out = createRaster(size.width, size.height);
  if (background === 'none') return { raster: out, warning: undefined };
  if (isBackgroundContainer(container)) {
    const [r, g, b] = hexToRgb(container.background ?? '#FFFFFF');
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
    return { raster: out, warning: undefined };
  }
  const loaded = await loadImage(roots, refs, container);
  const warning = sizeWarning(loaded, container).warning;
  const scaled = scaleRect(region, loaded);
  const source = clampRect(scaled, loaded.raster);
  if (source === null) return { raster: out, warning };
  const cut = crop(loaded.raster, source);
  // A janela fracionária dentro do recorte inteiro: o fundo alinha com o desenho em qualquer escala.
  const area = {
    x: scaled.x - source.x,
    y: scaled.y - source.y,
    width: Math.min(scaled.width, source.width - (scaled.x - source.x)),
    height: Math.min(scaled.height, source.height - (scaled.y - source.y)),
  };
  const raster = resize(cut, size.width, size.height, area);
  return { raster, warning };
}

/** Recusa a saída com pixels demais ou o fundo transparente em JPEG. */
function checkLimits(
  size: { width: number; height: number; zoom: number },
  background: 'image' | 'none',
  format: ImageFormat,
): void {
  if (size.width * size.height > MAX_PIXELS) {
    throw new ToolError(
      'image-too-large',
      `imagem com pixels demais (${size.width}×${size.height}; máximo ${MAX_PIXELS}): reduza o zoom ou a região`,
      size,
    );
  }
  if (background === 'none' && format === 'jpeg') {
    throw new ToolError(
      'invalid-arguments',
      'fundo transparente (`background: "none"`) pede png ou webp: o jpeg não tem transparência',
    );
  }
}

async function renderRegion(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  region: PixelRect,
  options: RenderOptions,
  markingIds: ReadonlySet<string> | undefined,
  images: ImageServer | null,
): Promise<{ json: Record<string, unknown>; image: ImageResult['image'] }> {
  checkMode(refs, options.drawingMode);
  const zoom = options.zoom ?? 1;
  const width = Math.max(1, Math.round(region.width * zoom));
  const height = Math.max(1, Math.round(region.height * zoom));
  const background = options.background ?? 'image';
  const format = options.format ?? 'png';
  checkLimits({ width, height, zoom }, background, format);
  const { raster, warning } = await backdrop(
    roots,
    refs,
    container,
    region,
    { width, height },
    background,
  );
  const scaleX = width / region.width;
  const scaleY = height / region.height;
  const drawn = paintContainerDrawings(
    raster,
    { project: refs.project, catalog: refs.loaded.catalog, fonts: refs.loaded.fonts },
    container.id,
    {
      scaleX,
      scaleY,
      originX: -region.x * scaleX,
      originY: -region.y * scaleY,
      clip: { x: 0, y: 0, width, height },
    },
    {
      ...(markingIds === undefined ? {} : { markingIds }),
      ...(options.drawingMode === undefined ? {} : { drawingMode: options.drawingMode }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    },
  );
  const bytes = await encodeImage(raster, format);
  return {
    json: {
      container: { ref: refs.ref('i', container.id), file: container.file },
      format,
      width,
      height,
      zoom,
      background,
      drawingMode: options.drawingMode ?? null,
      direction: options.direction ?? null,
      region: rectJson(region),
      drawings: drawn,
      ...(warning === undefined ? {} : { warning }),
      note: 'desenho do servidor (fonte livre embutida ou a da biblioteca), não uma captura da app; imagem remota vira um reservado e o gradiente vale a primeira cor',
      ...(await urlFields(images, bytes, format, 'desenho')),
    },
    image: { bytes, mimeType: MIME[format] },
  };
}

/** `render_marking`: o desenho da marcação e da subárvore dela. */
export async function renderMarking(
  roots: Roots,
  refs: Refs,
  marking: Marking,
  options: RenderOptions,
  images: ImageServer | null = null,
): Promise<ImageResult> {
  const container =
    marking.containerId === null
      ? undefined
      : projectIndex(refs.project).containers.get(marking.containerId);
  if (!container)
    throw new ToolError('not-found', 'container da marcação não encontrado');
  const padding = options.padding ?? 0;
  const region = clampRect(
    {
      x: marking.rect.x - padding,
      y: marking.rect.y - padding,
      width: marking.rect.width + 2 * padding,
      height: marking.rect.height + 2 * padding,
    },
    container,
  );
  if (!region) {
    throw new ToolError(
      'marking-outside-image',
      'a marcação está fora do container: nada a desenhar',
      {
        rect: rectJson(marking.rect),
        container: { width: container.width, height: container.height },
      },
    );
  }
  const result = await renderRegion(
    roots,
    refs,
    container,
    region,
    options,
    subtree(refs, marking),
    images,
  );
  return {
    json: { ref: refs.ref('m', marking.id), ...result.json },
    image: result.image,
  };
}

/** `render_container`: o desenho dos componentes do container inteiro. */
export async function renderContainer(
  roots: Roots,
  refs: Refs,
  container: ProjectContainer,
  options: RenderOptions,
  images: ImageServer | null = null,
): Promise<ImageResult> {
  const region = { x: 0, y: 0, width: container.width, height: container.height };
  const result = await renderRegion(
    roots,
    refs,
    container,
    region,
    options,
    undefined,
    images,
  );
  return {
    json: { ref: refs.ref('i', container.id), ...result.json },
    image: result.image,
  };
}
