// Variáveis de ambiente do build (ver vite.config.ts e .github/workflows/deploy.yml).
interface ImportMetaEnv {
  /** `preview` no build do branch publicado em /preview/; ausente na versão principal. */
  readonly VITE_CHANNEL?: string;
}

// CSS dos tokens, gerado de src/theme/tokens.ts pelo plugin `tokensCss` (vite.config.ts).
declare module 'virtual:tokens.css' {}
