// `import bytes from 'font:sans'` returns the bytes of the embedded TTF: the esbuild plugin
// (mcp/build.mjs) embeds them in the single file.
declare module 'font:*' {
  const bytes: Uint8Array;
  export default bytes;
}
