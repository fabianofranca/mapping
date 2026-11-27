import type { Plugin } from 'vite';

export declare const drawingFontFiles: {
  readonly 'drawing-font:sans': string;
  readonly 'drawing-font:sans-bold': string;
  readonly 'drawing-font:mono': string;
  readonly 'drawing-font:mono-bold': string;
};
/** Wraps a TrueType file as WOFF 1.0 (zlib per table). */
export declare function ttfToWoff(ttf: Uint8Array): Buffer;
/** The module source of `id`: the WOFF as a base64 string. */
export declare function drawingFontSource(id: string): string;
/** Vite plugin serving the `drawing-font:*` modules. */
export declare function drawingFontModules(): Plugin;
/** esbuild plugin serving the same modules. */
export declare const drawingFontEsbuild: {
  readonly name: string;
  setup(esbuild: unknown): void;
};
