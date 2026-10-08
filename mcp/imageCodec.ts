// Codecs de imagem em WebAssembly (os do Squoosh, empacotados pelo jSquash): PNG, JPEG e WebP.
// Os `.wasm` vão embutidos no arquivo único (`?binary`, em mcp/build.mjs) e são
// instanciados aqui a partir dos bytes: nada é baixado nem lido do disco em tempo de execução.
import jpegDecodeFactory from '@jsquash/jpeg/codec/dec/mozjpeg_dec.js';
import jpegDecodeWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?binary';
import {
  decode as pngDecode,
  initSync as initPng,
} from '@jsquash/png/codec/pkg/squoosh_png.js';
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm?binary';
import webpDecodeFactory from '@jsquash/webp/codec/dec/webp_dec.js';
import webpDecodeWasm from '@jsquash/webp/codec/dec/webp_dec.wasm?binary';
import webpEncodeFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import webpEncodeWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?binary';
import { defaultOptions as webpDefaults } from '@jsquash/webp/meta.js';
import type { Pixels } from './pixels';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export const MIME_OF: Readonly<Record<ImageFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Formato pelos primeiros bytes do arquivo (a extensão não é confiável); `null` se não for um dos três. */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  const at = (i: number, ...values: number[]) =>
    values.every((v, k) => bytes[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  // RIFF....WEBP
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

interface EmscriptenModule {
  decode?: (data: Uint8Array, preserveOrientation?: boolean) => Pixels | null;
  encode?: (
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: Record<string, number>,
  ) => Uint8Array | null;
}
type EmscriptenFactory = (options: Record<string, unknown>) => Promise<EmscriptenModule>;

/** Os decodificadores devolvem `new ImageData(...)`, que o Node não tem: só os dados bastam. */
function ensureImageData(): void {
  const scope = globalThis as Record<string, unknown>;
  if (scope.ImageData) return;
  scope.ImageData = class {
    constructor(
      readonly data: Uint8ClampedArray,
      readonly width: number,
      readonly height: number,
    ) {}
  };
}

/** Instancia um módulo do Emscripten com o `.wasm` embutido (sem `locateFile` nem rede). */
function instantiate(
  factory: unknown,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<EmscriptenModule> {
  const module = new WebAssembly.Module(bytes);
  return (factory as EmscriptenFactory)({
    noInitialRun: true,
    locateFile: (path: string) => path,
    instantiateWasm: (
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance) => void,
    ) => {
      const instance = new WebAssembly.Instance(module, imports);
      done(instance);
      return instance.exports;
    },
  });
}

interface Codecs {
  readonly jpegDecoder: EmscriptenModule;
  readonly webpDecoder: EmscriptenModule;
  readonly webpEncoder: EmscriptenModule;
}

let codecs: Promise<Codecs> | null = null;

/** Carrega os codecs na primeira imagem (o servidor só de leitura nunca paga por eles). */
function loadCodecs(): Promise<Codecs> {
  codecs ??= (async () => {
    ensureImageData();
    (initPng as unknown as (module: WebAssembly.Module) => unknown)(
      new WebAssembly.Module(pngWasm),
    );
    const [jpegDecoder, webpDecoder, webpEncoder] = await Promise.all([
      instantiate(jpegDecodeFactory, jpegDecodeWasm),
      instantiate(webpDecodeFactory, webpDecodeWasm),
      instantiate(webpEncodeFactory, webpEncodeWasm),
    ]);
    return { jpegDecoder, webpDecoder, webpEncoder };
  })();
  return codecs;
}

function checked(result: Pixels | null | undefined, format: ImageFormat): Pixels {
  if (!result || result.width <= 0 || result.height <= 0) {
    throw new Error(`não foi possível decodificar a imagem (${format})`);
  }
  return { data: result.data, width: result.width, height: result.height };
}

/** Decodifica para RGBA de 8 bits. JPEG sem aplicar a orientação EXIF (quem chama aplica). */
export async function decodeImage(
  bytes: Uint8Array,
  format: ImageFormat,
): Promise<Pixels> {
  const { jpegDecoder, webpDecoder } = await loadCodecs();
  switch (format) {
    case 'png':
      return checked(
        (pngDecode as unknown as (data: Uint8Array) => Pixels)(bytes),
        format,
      );
    case 'jpeg':
      return checked(jpegDecoder.decode?.(bytes, false), format);
    case 'webp':
      return checked(webpDecoder.decode?.(bytes), format);
  }
}

/**
 * Codifica em WebP. `quality` de 0 a 1, como o `canvas.toBlob` da app; `1` gera WebP sem
 * perdas, que é o que o Chrome faz com qualidade 1 (origem PNG: prints e texto).
 */
export async function encodeWebp(pixels: Pixels, quality: number): Promise<Uint8Array> {
  const { webpEncoder } = await loadCodecs();
  const lossless = quality >= 1;
  const options: Record<string, number> = {
    ...(webpDefaults as unknown as Record<string, number>),
    quality: lossless ? 100 : Math.round(quality * 100),
    lossless: lossless ? 1 : 0,
    // Sem perdas de verdade: mantém a cor dos pixels transparentes, como o original.
    exact: lossless ? 1 : 0,
  };
  const encoded = webpEncoder.encode?.(pixels.data, pixels.width, pixels.height, options);
  if (!encoded) throw new Error('não foi possível codificar a imagem em WebP');
  // Cópia: o resultado aponta para a memória do WebAssembly, reaproveitada na próxima chamada.
  return new Uint8Array(encoded);
}
