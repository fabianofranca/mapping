// Fontes livres embutidas no servidor (`import bytes from 'font:sans'`): subconjunto Latim das
// Liberation Sans/Mono (SIL OFL 1.1), renomeado para Mapping Sans/Mono. Ver `mcp/fonts/LICENSE.txt`.
// Compartilhado pelo build do servidor (mcp/build.mjs) e pelo Vitest (vite.config.ts).
export const fontFiles = {
  'font:sans': './fonts/MappingSans-Regular.ttf',
  'font:sans-bold': './fonts/MappingSans-Bold.ttf',
  'font:mono': './fonts/MappingMono-Regular.ttf',
  'font:mono-bold': './fonts/MappingMono-Bold.ttf',
};
