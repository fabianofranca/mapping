import decodeJpeg, { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import encodeJpeg, { init as initJpegEncoder } from '@jsquash/jpeg/encode.js';
import decodePng, { init as initPngDecoder } from '@jsquash/png/decode.js';
import encodePng, { init as initPngEncoder } from '@jsquash/png/encode.js';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import { defaultOptions as webpDefaults } from '@jsquash/webp/meta.js';
import { initEmscriptenModule } from '@jsquash/webp/utils.js';
import webpEncoderFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import pngWasm from 'wasm:png';
import jpegDecoderWasm from 'wasm:jpeg-decoder';
import jpegEncoderWasm from 'wasm:jpeg-encoder';
import webpDecoderWasm from 'wasm:webp-decoder';
import webpEncoderWasm from 'wasm:webp-encoder';
import { readExifOrientation, type ExifOrientation } from '../../src/model';
import { ToolError } from '../errors';
import {
  MAX_FILE_BYTES,
  MAX_PIXELS,
  detectFormat,
  readSize,
  type ImageFormat,
} from './formats';
import { orient } from './orientation';
import { flattenOnWhite, type Raster } from './raster';

// Codecs em WebAssembly (@jsquash: libpng, mozjpeg e libwebp), embutidos no arquivo único e
// instanciados sob demanda a partir dos bytes: nada é lido do disco nem da rede em runtime.
// Na decodificação do JPEG, a orientação EXIF é aplicada (`orientation.ts`), como o navegador
// faz na app.

type Wasm = WebAssembly.Module;
const modules = new Map<Uint8Array, Wasm>();
const compiled = (bytes: Uint8Array): Wasm => {
  let module = modules.get(bytes);
  if (!module) {
    module = new WebAssembly.Module(bytes as BufferSource);
    modules.set(bytes, module);
  }
  return module;
};

const ready = new Map<string, Promise<unknown>>();
function once<T>(key: string, start: () => Promise<T>): Promise<T> {
  let promise = ready.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = start();
    ready.set(key, promise);
  }
  return promise;
}

/**
 * Cópia dos bytes como `ArrayBuffer` (o que os decodificadores do @jsquash aceitam). `new
 * Uint8Array(bytes)` copia sempre; o `slice()` de um `Buffer` do Node não copia e o `.buffer`
 * seria o pool inteiro de memória compartilhada, com bytes de outros dados em volta.
 */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  new Uint8Array(bytes).buffer as ArrayBuffer;

type Encoded = { data: Uint8ClampedArray; width: number; height: number };
// Os tipos dos pacotes referenciam `ImageData` do DOM, que o tsconfig do `mcp/` não tem.
const asImageData = (r: Raster) => r as unknown as Parameters<typeof encodePng>[0];

/**
 * Decodifica PNG, JPEG ou WebP para RGBA, recusando arquivos grandes ou com pixels demais. No
 * JPEG, aplica a orientação EXIF (o mozjpeg entrega os pixels como estão no arquivo), como o
 * navegador faz na app: o `raster` está no sistema de coordenadas das marcações.
 * `orientation` é a lida do arquivo (1 = sem rotação; sempre 1 em PNG e WebP).
 */
export async function decodeImage(
  bytes: Uint8Array,
): Promise<{ format: ImageFormat; raster: Raster; orientation: ExifOrientation }> {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new ToolError(
      'image-too-large',
      `arquivo de imagem grande demais (${bytes.length} bytes; máximo ${MAX_FILE_BYTES})`,
    );
  }
  const format = detectFormat(bytes);
  if (!format) {
    throw new ToolError(
      'unsupported-image',
      'formato de imagem não suportado: só PNG, JPEG e WebP',
    );
  }
  const size = readSize(bytes, format);
  if (!size) {
    throw new ToolError('invalid-image', `cabeçalho ${format.toUpperCase()} ilegível`);
  }
  if (size.width * size.height > MAX_PIXELS) {
    throw new ToolError(
      'image-too-large',
      `imagem com pixels demais (${size.width}×${size.height}; máximo ${MAX_PIXELS})`,
    );
  }
  try {
    let decoded: Encoded;
    if (format === 'png') {
      await once('png', () => initPngDecoder(compiled(pngWasm)));
      decoded = (await decodePng(toArrayBuffer(bytes))) as Encoded;
    } else if (format === 'jpeg') {
      await once('jpeg-dec', async () => initJpegDecoder(compiled(jpegDecoderWasm)));
      decoded = (await decodeJpeg(toArrayBuffer(bytes))) as Encoded;
    } else {
      await once('webp-dec', async () => initWebpDecoder(compiled(webpDecoderWasm)));
      decoded = (await decodeWebp(toArrayBuffer(bytes))) as Encoded;
    }
    const raster = { width: decoded.width, height: decoded.height, data: decoded.data };
    const orientation = format === 'jpeg' ? readExifOrientation(toArrayBuffer(bytes)) : 1;
    return { format, raster: orient(raster, orientation), orientation };
  } catch (error) {
    throw new ToolError(
      'invalid-image',
      `não foi possível decodificar a imagem ${format.toUpperCase()}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface EncodeOptions {
  /** Qualidade (1–100) do JPEG e do WebP com perdas. */
  readonly quality?: number;
  /** WebP sem perdas (as imagens do projeto de origem PNG usam este). */
  readonly lossless?: boolean;
}

export const DEFAULT_QUALITY = 85;

/** Codifica o raster no formato pedido. JPEG não tem transparência: funde sobre branco. */
export async function encodeImage(
  raster: Raster,
  format: ImageFormat,
  options: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = options.quality ?? DEFAULT_QUALITY;
  if (format === 'png') {
    await once('png', () => initPngEncoder(compiled(pngWasm)));
    return new Uint8Array(await encodePng(asImageData(raster)));
  }
  if (format === 'jpeg') {
    await once('jpeg-enc', async () => initJpegEncoder(compiled(jpegEncoderWasm)));
    const flat = flattenOnWhite(raster);
    return new Uint8Array(await encodeJpeg(asImageData(flat), { quality }));
  }
  // O WebP é instanciado direto da fábrica do codec (sem SIMD): o `init` do pacote escolhe a
  // variante com um `import()` dinâmico que o arquivo único não carrega.
  const encoder = await once('webp-enc', () =>
    initEmscriptenModule(webpEncoderFactory, compiled(webpEncoderWasm)),
  );
  const out = encoder.encode(raster.data, raster.width, raster.height, {
    ...webpDefaults,
    quality,
    lossless: options.lossless ? 1 : 0,
  });
  if (!out) throw new ToolError('encode-failed', 'falha ao codificar a imagem WebP');
  return new Uint8Array(out);
}
