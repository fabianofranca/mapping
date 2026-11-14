// Importing `?raw` returns the file's text: Vite does this in the tests and the esbuild
// plugin (mcp/build.mjs) does it in the build. In the app, the type comes from `vite/client`.
declare module '*?raw' {
  const text: string;
  export default text;
}
