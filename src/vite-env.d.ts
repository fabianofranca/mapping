// Build environment variables (see vite.config.ts and .github/workflows/deploy.yml).
interface ImportMetaEnv {
  /** `preview` in the build of the branch published at /preview/; absent in the main version. */
  readonly VITE_CHANNEL?: string;
}

// Token CSS, generated from src/theme/tokens.ts by the `tokensCss` plugin (vite.config.ts).
declare module 'virtual:tokens.css' {}
