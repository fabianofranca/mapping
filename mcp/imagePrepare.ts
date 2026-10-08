import {
  chooseOutputFormat,
  isPngSource,
  planOutputSize,
  shouldUseEncoded,
  withExtension,
} from '../src/model';
import { decodeImage, encodeImage } from './image/codecs';
import { MIME } from './image/formats';
import { resize } from './image/raster';

/** Imagem pronta para `images/`, com as mesmas decisões da app (`src/storage/imageImport.ts`). */
export interface PreparedImage {
  /** Nome sugerido (a colisão em `images/` é resolvida pelo modelo). */
  readonly name: string;
  readonly data: Uint8Array;
  /** Dimensões com a orientação EXIF aplicada (o sistema de coordenadas das marcações). */
  readonly width: number;
  readonly height: number;
  /** O arquivo foi recodificado (WebP) ou guardado como veio. */
  readonly optimized: boolean;
  /** Dimensões do arquivo recebido (com a orientação aplicada), antes da redução. */
  readonly original: { readonly width: number; readonly height: number };
}

/**
 * Prepara a imagem que entra pelo MCP como a app faz ao importar: aplica a orientação EXIF,
 * limita o lado maior a `MAX_IMAGE_SIDE` e recodifica em WebP (origem PNG: sem perdas; demais:
 * com perdas, qualidade 0,85), sem os metadados. Sem redução nem rotação, só usa o recodificado
 * se ficar menor que o original. Aceita PNG, JPEG e WebP (reconhecidos pelo conteúdo, com os
 * limites e os erros de `decodeImage`).
 */
export async function prepareImage(
  bytes: Uint8Array,
  name: string,
): Promise<PreparedImage> {
  // A orientação EXIF já vem aplicada; `orientation` diz se a foto precisou girar.
  const { format, raster: oriented, orientation } = await decodeImage(bytes);
  // Pelo conteúdo, não pelo nome: um `.png` que na verdade é JPEG é tratado como foto.
  const source = { type: MIME[format], name: '' };
  const original = { width: oriented.width, height: oriented.height };

  const plan = planOutputSize(original);
  const output = chooseOutputFormat({ isPng: isPngSource(source) }, true);
  const resized = resize(oriented, plan.width, plan.height);
  // Qualidade 1 do `canvas.toBlob` (origem PNG) é o WebP sem perdas do Chrome.
  const lossless = (output.quality ?? 1) >= 1;
  const encoded = await encodeImage(resized, 'webp', {
    lossless,
    quality: lossless ? 100 : Math.round((output.quality ?? 1) * 100),
  });
  if (
    shouldUseEncoded({
      resized: plan.resized,
      needsRotation: orientation !== 1,
      originalBytes: bytes.byteLength,
      encodedBytes: encoded.byteLength,
    })
  ) {
    return {
      name: withExtension(name, output.extension),
      data: encoded,
      width: plan.width,
      height: plan.height,
      optimized: true,
      original,
    };
  }
  return { name, data: bytes, ...original, optimized: false, original };
}
