// Módulos WebAssembly dos codecs de imagem (@jsquash), por nome virtual (`import bytes from 'wasm:png'`).
// Compartilhado pelo build do servidor (mcp/build.mjs) e pelo Vitest (vite.config.ts).
export const wasmFiles = {
  'wasm:png': '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  'wasm:jpeg-decoder': '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  'wasm:jpeg-encoder': '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
  'wasm:webp-decoder': '@jsquash/webp/codec/dec/webp_dec.wasm',
  'wasm:webp-encoder': '@jsquash/webp/codec/enc/webp_enc.wasm',
};
