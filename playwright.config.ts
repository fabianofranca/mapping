import { defineConfig } from '@playwright/test';

/**
 * Testes ponta a ponta: rodam contra o `dist/index.html` final (`npm run build`),
 * servido localmente. Só no CI (ver .github/workflows/ci.yml); o ambiente cloud do
 * Claude Code pode não ter o navegador. Para rodar fora do CI, aponte um Chromium
 * já instalado com `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/caminho/do/chrome`.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Uma repetição no CI, com trace só nela (a primeira falha fica no relatório).
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    trace: 'on-first-retry',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      // Celular emulado: 380 px de largura (CLAUDE.md) e toque.
      name: 'mobile',
      use: {
        viewport: { width: 380, height: 760 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
  webServer: {
    // Serve o dist/ gerado pelo build (o CI já o gerou antes).
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
