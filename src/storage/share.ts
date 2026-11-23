import { reportError } from '../utils/report';

/** `true` if the browser can share this file through the Web Share API. */
export function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
    );
  } catch {
    // Feature detection: `canShare` can throw with unsupported file types.
    return false;
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed';

/** Opens the system share sheet with the file. */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    reportError('share', e);
    return 'failed';
  }
}

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface SaveHandleLike {
  createWritable(): Promise<WritableLike>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: readonly { description?: string; accept: Record<string, readonly string[]> }[];
}) => Promise<SaveHandleLike>;

function saveFilePicker(): SaveFilePicker | null {
  const picker: unknown = Reflect.get(globalThis, 'showSaveFilePicker');
  return typeof picker === 'function' ? (picker as SaveFilePicker) : null;
}

/**
 * `showSaveFilePicker` exists (Chrome and Edge) and the page is not in an iframe (where it is
 * blocked). Without it, the export uses `downloadFile`, which does not know whether the person
 * saved.
 */
export function canSaveWithPicker(): boolean {
  try {
    return saveFilePicker() !== null && window.self === window.top;
  } catch {
    return false;
  }
}

export type SaveResult = 'saved' | 'cancelled' | 'failed';

/** The file type the picker offers: the file's own (its MIME type and extension), the zip by default. */
function pickerType(file: File): { accept: Record<string, readonly string[]> } {
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot).toLowerCase() : '.zip';
  const mime = file.type.split(';')[0]?.trim() || 'application/zip';
  return { accept: { [mime]: [extension] } };
}

/**
 * Opens the system "Save as" (suggested name, the file's type) and writes the file through the
 * handle. `saved` only after `close()`, when the file is on disk; `cancelled`
 * if the person closed the picker. It must be called straight from the click (the picker requires
 * a user gesture), before any `await`.
 */
export async function saveFileWithPicker(file: File): Promise<SaveResult> {
  const picker = saveFilePicker();
  if (!picker) return 'failed';
  let handle: SaveHandleLike;
  try {
    handle = await picker.call(globalThis, {
      suggestedName: file.name,
      types: [pickerType(file)],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    reportError('export.savePicker', e);
    return 'failed';
  }
  let writable: WritableLike | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return 'saved';
  } catch (e) {
    // Discards the incomplete write: the file on disk stays as it was.
    await writable?.abort().catch(() => undefined);
    reportError('export.saveWrite', e);
    return 'failed';
  }
}

/** The picker's file type for a blob: its MIME type with the extension of the suggested name. */
function blobPickerType(
  name: string,
  mime: string,
): { accept: Record<string, readonly string[]> } {
  const dot = name.lastIndexOf('.');
  return { accept: { [mime]: [dot > 0 ? name.slice(dot).toLowerCase() : ''] } };
}

/**
 * Like `saveFileWithPicker`, for content that is produced after the click: the picker opens
 * synchronously from the call (before any `await`, as it needs the user gesture), and only then
 * is `data` awaited and written through the handle. A rejected `data` or a write error aborts
 * the writable (the file on disk stays as it was) and gives `failed`.
 */
export async function saveBlobWithPicker(
  name: string,
  mime: string,
  data: Promise<Blob>,
): Promise<SaveResult> {
  const picker = saveFilePicker();
  if (!picker) return 'failed';
  // Opened first and awaited later; a rejection of `data` is handled below, not as unhandled.
  data.catch(() => undefined);
  const opened = picker.call(globalThis, {
    suggestedName: name,
    types: [blobPickerType(name, mime)],
  });
  let handle: SaveHandleLike;
  try {
    handle = await opened;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    reportError('export.savePicker', e);
    return 'failed';
  }
  let writable: WritableLike | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(await data);
    await writable.close();
    return 'saved';
  } catch (e) {
    await writable?.abort().catch(() => undefined);
    reportError('export.saveWrite', e);
    return 'failed';
  }
}

/** Downloads the file through the browser (temporary link with `download`). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Gives the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
