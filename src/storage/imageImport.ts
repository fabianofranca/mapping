import { readExifOrientation } from './exif';

/** Qualidade JPEG usada ao recodificar uma foto com orientação EXIF. */
export const NORMALIZED_JPEG_QUALITY = 0.92;
/** Lado maior do bitmap usado para exibir a imagem (as coordenadas não mudam). */
export const DISPLAY_MAX_SIDE = 2048;

export interface PreparedImage {
  /** Nome sugerido para `images/` (a colisão é resolvida pelo modelo). */
  readonly name: string;
  readonly data: Blob;
  /** Dimensões já com a orientação EXIF aplicada. */
  readonly width: number;
  readonly height: number;
}

export class ImageDecodeError extends Error {
  constructor(readonly fileName: string) {
    super(`cannot decode image: ${fileName}`);
    this.name = 'ImageDecodeError';
  }
}

function decode(data: Blob, options: ImageBitmapOptions = {}): Promise<ImageBitmap> {
  return createImageBitmap(data, { imageOrientation: 'from-image', ...options });
}

function drawToCanvas(
  source: ImageBitmap,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', NORMALIZED_JPEG_QUALITY),
  );
}

function withJpegExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`;
}

/**
 * Prepara uma imagem escolhida pelo usuário: lê as dimensões com a orientação
 * EXIF aplicada e, se a orientação for diferente de 1, recodifica em JPEG já
 * rotacionado. Se a recodificação falhar (ex.: foto maior que o limite de canvas
 * do iOS), guarda o arquivo original: as coordenadas continuam corretas porque
 * o sistema de coordenadas é o da imagem com EXIF aplicado.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new ImageDecodeError(file.name);
  }
  const { width, height } = bitmap;
  try {
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    const orientation = isJpeg ? readExifOrientation(await file.arrayBuffer()) : 1;
    if (orientation !== 1) {
      try {
        const jpeg = await canvasToJpeg(drawToCanvas(bitmap, width, height));
        if (jpeg)
          return { name: withJpegExtension(file.name), data: jpeg, width, height };
      } catch {
        // Cai no arquivo original abaixo.
      }
    }
    return { name: file.name, data: file, width, height };
  } finally {
    bitmap.close();
  }
}

/** Dimensões (com EXIF aplicado) de uma imagem já gravada no projeto. */
export async function readImageSize(
  data: Blob,
  name: string,
): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await decode(data);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    throw new ImageDecodeError(name);
  }
}

/** Tamanho do bitmap de exibição para uma imagem de `width` × `height`. */
export function displaySize(
  width: number,
  height: number,
): { width: number; height: number } {
  const factor = Math.min(1, DISPLAY_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * Bitmap reduzido (lado maior até `DISPLAY_MAX_SIDE`) para exibir no canvas.
 * Com o tamanho original conhecido (`size`, vindo do projeto), pede o tamanho
 * final direto ao decodificador, sem decodificar a foto inteira. Se o navegador
 * ignorar `resizeWidth`, reduz desenhando num canvas.
 */
export async function createDisplayBitmap(
  data: Blob,
  size?: { width: number; height: number },
): Promise<ImageBitmap> {
  let original = size;
  if (!original) {
    const probe = await decode(data);
    original = { width: probe.width, height: probe.height };
    if (Math.max(probe.width, probe.height) <= DISPLAY_MAX_SIDE) return probe;
    probe.close();
  }
  const target = displaySize(original.width, original.height);
  if (target.width === original.width && target.height === original.height) {
    return decode(data);
  }
  const resized = await decode(data, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
  if (resized.width === target.width && resized.height === target.height) return resized;
  try {
    return await createImageBitmap(drawToCanvas(resized, target.width, target.height));
  } finally {
    resized.close();
  }
}
