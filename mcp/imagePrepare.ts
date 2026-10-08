import {
  chooseOutputFormat,
  isJpegSource,
  isPngSource,
  planOutputSize,
  readExifOrientation,
  shouldUseEncoded,
  withExtension,
} from '../src/model';
import { MIME_OF, decodeImage, encodeWebp, sniffFormat } from './imageCodec';
import { ToolError } from './errors';
import { downscale, orient } from './pixels';

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

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Prepara a imagem que entra pelo MCP como a app faz ao importar: aplica a orientação EXIF,
 * limita o lado maior a `MAX_IMAGE_SIDE` e recodifica em WebP (origem PNG: sem perdas; demais:
 * com perdas, qualidade 0,85), sem os metadados. Sem redução nem rotação, só usa o recodificado
 * se ficar menor que o original. Aceita PNG, JPEG e WebP (reconhecidos pelo conteúdo).
 */
export async function prepareImage(
  bytes: Uint8Array,
  name: string,
): Promise<PreparedImage> {
  const format = sniffFormat(bytes);
  if (!format) {
    throw new ToolError(
      'unsupported-image',
      `formato de imagem não suportado: ${name} (aceitos: PNG, JPEG e WebP)`,
      { file: name },
    );
  }
  let decoded;
  try {
    decoded = await decodeImage(bytes, format);
  } catch {
    throw new ToolError('invalid-image', `não foi possível ler a imagem: ${name}`, {
      file: name,
    });
  }
  // Pelo conteúdo, não pelo nome: um `.png` que na verdade é JPEG é tratado como foto.
  const source = { type: MIME_OF[format], name: '' };
  const orientation = isJpegSource(source)
    ? readExifOrientation(arrayBufferOf(bytes))
    : 1;
  const oriented = orient(decoded, orientation);
  const original = { width: oriented.width, height: oriented.height };

  const plan = planOutputSize(original);
  const output = chooseOutputFormat({ isPng: isPngSource(source) }, true);
  const resized = downscale(oriented, plan.width, plan.height);
  const encoded = await encodeWebp(resized, output.quality ?? 1);
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
