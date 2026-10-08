// Importar `?raw` devolve o texto do arquivo: o Vite faz isso nos testes e o plugin do
// esbuild (mcp/build.mjs) faz no build. No app, o tipo vem de `vite/client`.
declare module '*?raw' {
  const text: string;
  export default text;
}
