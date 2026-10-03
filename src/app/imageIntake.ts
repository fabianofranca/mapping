// Entrada de imagens por colar e arrastar-e-soltar (docs/history/PLAN-etapas-1-2.md 12.6).
import { extensionForMime, pastedFileName } from '../model';
import { isImageFileName } from '../storage/types';

export interface SplitFiles {
  readonly images: readonly File[];
  /** Nomes dos arquivos ignorados por não serem imagem. */
  readonly ignored: readonly string[];
}

/** `true` se o arquivo é uma imagem (pelo tipo MIME ou, sem tipo, pela extensão). */
export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type ? file.type.startsWith('image/') : isImageFileName(file.name);
}

export function splitImageFiles(files: readonly File[]): SplitFiles {
  const images: File[] = [];
  const ignored: string[] = [];
  for (const file of files) {
    if (isImageFile(file)) images.push(file);
    else ignored.push(file.name);
  }
  return { images, ignored };
}

/** Renomeia uma imagem colada para `img-AAAAMMDD-HHMMSS.<ext>`. */
export function nameForPasted(blob: Blob, now: Date = new Date()): File {
  return new File([blob], pastedFileName(now, extensionForMime(blob.type)), {
    type: blob.type,
  });
}

/** O arrasto traz arquivos? (Durante o `dragover` só os `types` são legíveis.) */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && [...dt.types].includes('Files');
}

/** `navigator.clipboard.read()` existe (opção "Colar imagem" no celular). */
export function canReadClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
  );
}

/** Lê as imagens da área de transferência (exige gesto do usuário). */
export async function readClipboardImages(now: Date = new Date()): Promise<File[]> {
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((mime) => mime.startsWith('image/'));
    if (type) files.push(nameForPasted(await item.getType(type), now));
  }
  return files;
}

/** Imagens de um evento `paste` (Ctrl/Cmd+V). */
export function imagesFromPaste(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter(isImageFile).map((file) => nameForPasted(file));
}
