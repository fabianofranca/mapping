// Image formats the server reads and writes, and reading the dimensions from the header
// (before decoding: a small PNG on disk can declare billions of pixels).

import type { ImageFormat } from '../../src/model/imageHeader';

export { detectFormat, readSize } from '../../src/model/imageHeader';
export type { ImageFormat, Size } from '../../src/model/imageHeader';

export const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Image files larger than this are refused. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/**
 * Images with more pixels than this (40 megapixels) are not decoded: the memory peak of
 * a decode (WASM heap, RGBA, orientation copy and downscaling) stays below ~1 GB.
 */
export const MAX_PIXELS = 40_000_000;
/**
 * Largest image accepted as `base64` in the operations (16 MB; larger ones go through `file`). Smaller than
 * `MAX_FILE_BYTES` because the whole message goes through stdin: the SDK's read buffer copies
 * the message on every chunk received (quadratic time in the size), and 87 MB took ~90 s.
 */
export const MAX_BASE64_FILE_BYTES = 16 * 1024 * 1024;
/** Size in base64 (without the `data:` prefix or line breaks) of a file of `MAX_BASE64_FILE_BYTES`. */
export const MAX_BASE64_LENGTH = Math.ceil(MAX_BASE64_FILE_BYTES / 3) * 4;
/**
 * Cap of the `base64` text in the schema: the content with room for the `data:` prefix and line breaks
 * (CRLF every 76 characters). The exact size is checked before decoding (`mcp/batch.ts`).
 */
export const MAX_BASE64_TEXT =
  MAX_BASE64_LENGTH + Math.ceil(MAX_BASE64_LENGTH / 38) + 256;
/**
 * Largest JSON-RPC message read from stdin (the transport's `maxBufferSize`, `mcp/main.ts`): a
 * `base64` at the schema's cap plus 1 MB for the rest of the message. Above that the server exits with
 * an error on stderr.
 */
export const MAX_MESSAGE_BYTES = MAX_BASE64_TEXT + 1024 * 1024;
