// `mcp/harfbuzzFiles.mjs` replaces the top-level await at the end of harfbuzzjs's `dist/index.mjs` with this
// exported function, which the server calls once at startup (`initShaper`, mcp/image/harfbuzz.ts).
import 'harfbuzzjs';

declare module 'harfbuzzjs' {
  /** Options of the Emscripten module: the embedded bytes of `harfbuzz.wasm` and where its messages go. */
  export interface HarfBuzzModuleOptions {
    readonly wasmBinary?: Uint8Array;
    readonly print?: (text: string) => void;
    readonly printErr?: (text: string) => void;
  }
  /** Instantiates HarfBuzz's WebAssembly module; every other export works only after the promise resolves. */
  export function initHarfBuzz(moduleArg?: HarfBuzzModuleOptions): Promise<void>;
}
