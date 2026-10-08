// `import bytes from './codec.wasm?binary'` devolve os bytes do arquivo (só no build, mcp/build.mjs).
declare module '*?binary' {
  const bytes: Uint8Array<ArrayBuffer>;
  export default bytes;
}
