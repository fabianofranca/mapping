// Image intake by paste and drag-and-drop (docs/ARCHITECTURE.md, "Image intake and optimization").
import { extensionForMime, pastedFileName } from '../model';
import { isImageFileName } from '../storage/types';

export interface SplitFiles {
  readonly images: readonly File[];
  /** Names of the files ignored for not being an image. */
  readonly ignored: readonly string[];
}

/** `true` if the file is an image (by MIME type or, without a type, by extension). */
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

/** Renames a pasted image to `img-YYYYMMDD-HHMMSS.<ext>`. */
export function nameForPasted(blob: Blob, now: Date = new Date()): File {
  return new File([blob], pastedFileName(now, extensionForMime(blob.type)), {
    type: blob.type,
  });
}

/** Does the drag carry files? (During `dragover` only the `types` are readable.) */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && [...dt.types].includes('Files');
}

/** Images of a `paste` event (Ctrl/Cmd+V). */
export function imagesFromPaste(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter(isImageFile).map((file) => nameForPasted(file));
}
