// WebAssembly modules (the image codecs of @jsquash and HarfBuzz), by virtual name (`import bytes from 'wasm:png'`).
// Shared by the server build (mcp/build.mjs) and by Vitest (vite.config.ts).
export const wasmFiles = {
  'wasm:png': '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  'wasm:jpeg-decoder': '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  'wasm:jpeg-encoder': '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
  'wasm:webp-decoder': '@jsquash/webp/codec/dec/webp_dec.wasm',
  'wasm:webp-encoder': '@jsquash/webp/codec/enc/webp_enc.wasm',
  // HarfBuzz, the text shaper (harfbuzzjs); `harfbuzz-subset.wasm` is not used.
  'wasm:harfbuzz': 'harfbuzzjs/dist/harfbuzz.wasm',
};
