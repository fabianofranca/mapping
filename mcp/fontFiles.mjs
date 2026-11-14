// Free fonts embedded in the server (`import bytes from 'font:sans'`): Latin subset of
// Liberation Sans/Mono (SIL OFL 1.1), renamed to Mapping Sans/Mono. See `mcp/fonts/LICENSE.txt`.
// Shared by the server build (mcp/build.mjs) and by Vitest (vite.config.ts).
export const fontFiles = {
  'font:sans': './fonts/MappingSans-Regular.ttf',
  'font:sans-bold': './fonts/MappingSans-Bold.ttf',
  'font:mono': './fonts/MappingMono-Regular.ttf',
  'font:mono-bold': './fonts/MappingMono-Bold.ttf',
};
