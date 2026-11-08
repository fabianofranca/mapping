// `import bytes from 'font:sans'` devolve os bytes do TTF embutido: o plugin do esbuild
// (mcp/build.mjs) os embute no arquivo único.
declare module 'font:*' {
  const bytes: Uint8Array;
  export default bytes;
}
