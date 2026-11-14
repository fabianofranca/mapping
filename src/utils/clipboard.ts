// Writing to the clipboard (async API). Works on `file://` and on `https:`: Chrome
// treats both as a secure context. Call it from a user gesture (key,
// click); without the API or without permission, it returns `false`.
//
// Permission rule (Chrome): writing text (`writeText`) and PNG is always allowed, with no prompt.
// Writing a custom web format (`web <mime>`) requires the `clipboard-read` permission, which the
// browser does not grant by itself: without it the `write` opens a permission prompt and, if
// denied, rejects. That is why the text always goes first and the custom format is only added
// when the permission is already granted: copying never opens a permission prompt.

import { reportError } from './report';

/** Does the browser accept custom web formats (`web <mime>`) in the `ClipboardItem`? */
function supportsCustomFormat(mime: string): boolean {
  if (typeof ClipboardItem === 'undefined') return false;
  const supports: unknown = Reflect.get(ClipboardItem, 'supports');
  return typeof supports === 'function' && supports.call(ClipboardItem, `web ${mime}`);
}

/**
 * Is the `clipboard-read` permission already granted? It never opens a prompt; any error is "no".
 */
async function clipboardReadGranted(): Promise<boolean> {
  try {
    // `clipboard-read` is not in TypeScript's `PermissionName` type.
    const name = 'clipboard-read' as unknown as PermissionName;
    const status = await navigator.permissions.query({ name });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Writes `text` (`text/plain`) with `writeText`, called synchronously inside the user's
 * gesture. Then, only if `custom` was passed, the browser supports the format and the
 * `clipboard-read` permission is already granted, it writes text and `data` together over it in a
 * custom web format (other programs only see the text). A failure in this second write is
 * ignored: the text is already on the clipboard. An error writing the text goes to the
 * Diagnostics and returns `false`.
 */
export async function writeClipboardText(
  text: string,
  custom?: { readonly mime: string; readonly data: string },
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    reportError('clipboard.write', e);
    return false;
  }
  if (custom && supportsCustomFormat(custom.mime) && (await clipboardReadGranted())) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          [`web ${custom.mime}`]: new Blob([custom.data], { type: custom.mime }),
        }),
      ]);
    } catch {
      // The text was already written; the custom format is an extra.
    }
  }
  return true;
}

/**
 * Writes a PNG image. It receives the blob's promise (not the blob) so the `write` starts
 * inside the user's gesture, before the crop is ready (a Safari requirement).
 */
export async function writeClipboardPng(png: Promise<Blob>): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch (e) {
    reportError('clipboard.write', e);
    return false;
  }
}
