// Decisões da otimização de imagens na importação (docs/history/PLAN-etapas-1-2.md 12.6). Funções puras:
// a recodificação em si (canvas, toBlob) fica em `src/storage/imageImport.ts`.

/** Lado maior máximo de uma imagem importada, em pixels. */
export const MAX_IMAGE_SIDE = 2560;
/** Qualidade do WebP/JPEG com perdas. */
export const LOSSY_QUALITY = 0.85;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export interface OutputPlan extends Dimensions {
  /** A imagem precisou ser reduzida para caber em `MAX_IMAGE_SIDE`. */
  readonly resized: boolean;
}

/** Dimensões finais: lado maior limitado a `MAX_IMAGE_SIDE`; nunca amplia. */
export function planOutputSize(size: Dimensions, maxSide = MAX_IMAGE_SIDE): OutputPlan {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxSide) return { ...size, resized: false };
  const factor = maxSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
    resized: true,
  };
}

export type OutputMime = 'image/webp' | 'image/jpeg' | 'image/png';

export interface OutputFormat {
  readonly mime: OutputMime;
  /** `undefined` para formatos sem perdas (o WebP sem perdas usa qualidade 1). */
  readonly quality: number | undefined;
  readonly extension: 'webp' | 'jpg' | 'png';
}

/**
 * Formato de saída. Origem PNG (prints, texto): WebP sem perdas, ou PNG se o
 * navegador não gerar WebP. Demais (fotos): WebP com perdas, ou JPEG.
 */
export function chooseOutputFormat(
  source: { readonly isPng: boolean },
  webpSupported: boolean,
): OutputFormat {
  if (source.isPng) {
    return webpSupported
      ? { mime: 'image/webp', quality: 1, extension: 'webp' }
      : { mime: 'image/png', quality: undefined, extension: 'png' };
  }
  return webpSupported
    ? { mime: 'image/webp', quality: LOSSY_QUALITY, extension: 'webp' }
    : { mime: 'image/jpeg', quality: LOSSY_QUALITY, extension: 'jpg' };
}

/** `true` se o navegador de fato gerou o formato pedido (o `toBlob` cai em PNG quando não sabe). */
export function encodedAsRequested(requested: OutputMime, actual: string): boolean {
  return actual === requested;
}

/**
 * Usa o arquivo recodificado? Sempre, se foi reduzido ou se o original precisa
 * de correção (orientação EXIF); senão, só se ficou menor que o original.
 */
export function shouldUseEncoded(args: {
  readonly resized: boolean;
  readonly needsRotation: boolean;
  readonly originalBytes: number;
  readonly encodedBytes: number;
}): boolean {
  if (args.resized || args.needsRotation) return true;
  return args.encodedBytes < args.originalBytes;
}

/** Troca a extensão do nome de arquivo (`foto.png` + `webp` → `foto.webp`; sem extensão, acrescenta). */
export function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

/** A origem é PNG (pelo tipo MIME ou pela extensão)? Define o formato de saída em `chooseOutputFormat`. */
export function isPngSource(file: {
  readonly type: string;
  readonly name: string;
}): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name);
}

/** A origem é JPEG (pelo tipo MIME ou pela extensão)? Só JPEG tem orientação EXIF a corrigir. */
export function isJpegSource(file: {
  readonly type: string;
  readonly name: string;
}): boolean {
  return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `img-AAAAMMDD-HHMMSS.<ext>` (hora local), para imagens coladas. */
export function pastedFileName(date: Date, extension: string): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `img-${day}-${time}.${extension}`;
}

/** Extensão de arquivo para o tipo MIME de uma imagem (`png` se desconhecido). */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'image/bmp':
      return 'bmp';
    default:
      return 'png';
  }
}
