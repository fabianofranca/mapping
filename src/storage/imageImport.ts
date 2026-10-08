import {
  chooseOutputFormat,
  encodedAsRequested,
  isJpegSource,
  isPngSource,
  readExifOrientation,
  planOutputSize,
  shouldUseEncoded,
  withExtension,
  type OutputMime,
} from '../model';
import { reportError } from '../utils/report';

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
  mime?: OutputMime,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  if (mime === 'image/jpeg') {
    // JPEG não tem transparência: sem fundo, ela viraria preto.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: OutputMime,
  quality: number | undefined,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

let webpSupport: Promise<boolean> | null = null;

/** Detecta em runtime se `canvas.toBlob` gera WebP (senão ele devolve PNG). */
function supportsWebp(): Promise<boolean> {
  webpSupport ??= (async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const blob = await canvasToBlob(canvas, 'image/webp', 0.5);
      return blob !== null && encodedAsRequested('image/webp', blob.type);
    } catch {
      // Detecção de recurso: sem WebP o app usa JPEG, não é uma falha a registrar.
      return false;
    }
  })();
  return webpSupport;
}

/**
 * Prepara e otimiza uma imagem que entra pela app (arquivo, câmera, colar,
 * arrastar, troca): aplica a orientação EXIF, limita o lado maior a
 * `MAX_IMAGE_SIDE` e recodifica em WebP (PNG de origem: sem perdas; sem suporte
 * a WebP: JPEG ou PNG), removendo os metadados. Sem redução, só usa o
 * recodificado se ficar menor (ou se for preciso girar a foto). Se a
 * recodificação falhar (ex.: foto maior que o limite de canvas do iOS), guarda o
 * arquivo original: as coordenadas continuam corretas porque o sistema de
 * coordenadas é o da imagem com EXIF aplicado.
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
    const orientation = isJpegSource(file)
      ? readExifOrientation(await file.arrayBuffer())
      : 1;
    try {
      const plan = planOutputSize({ width, height });
      const format = chooseOutputFormat(
        { isPng: isPngSource(file) },
        await supportsWebp(),
      );
      const canvas = drawToCanvas(bitmap, plan.width, plan.height, format.mime);
      const encoded = await canvasToBlob(canvas, format.mime, format.quality);
      if (
        encoded &&
        encodedAsRequested(format.mime, encoded.type) &&
        shouldUseEncoded({
          resized: plan.resized,
          needsRotation: orientation !== 1,
          originalBytes: file.size,
          encodedBytes: encoded.size,
        })
      ) {
        return {
          name: withExtension(file.name, format.extension),
          data: encoded,
          width: plan.width,
          height: plan.height,
        };
      }
    } catch (e) {
      // Cai no arquivo original abaixo.
      reportError('image.optimize', e);
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
