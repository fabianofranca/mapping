// `import bytes from 'wasm:png'` returns the bytes of the WebAssembly module: the esbuild plugin
// (mcp/build.mjs) embeds them in the single file.
declare module 'wasm:*' {
  const bytes: Uint8Array;
  export default bytes;
}
