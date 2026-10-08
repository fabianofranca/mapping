// `import bytes from 'wasm:png'` devolve os bytes do módulo WebAssembly: o plugin do esbuild
// (mcp/build.mjs) os embute no arquivo único.
declare module 'wasm:*' {
  const bytes: Uint8Array;
  export default bytes;
}
