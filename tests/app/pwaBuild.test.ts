import { describe, expect, it } from 'vitest';
import { PREVIEW_APP_NAME, channelManifest, stampServiceWorker } from '../../pwa/build';
import manifest from '../../pwa/manifest.webmanifest?raw';

describe('arquivos do PWA por canal', () => {
  it('a versão principal publica o manifest sem mudanças', () => {
    expect(channelManifest(manifest, 'main')).toBe(manifest);
  });

  it('o preview tem nome próprio e mantém escopo e início relativos', () => {
    const preview: unknown = JSON.parse(channelManifest(manifest, 'preview'));
    expect(preview).toMatchObject({
      name: PREVIEW_APP_NAME,
      short_name: PREVIEW_APP_NAME,
      start_url: './',
      scope: './',
    });
  });

  it('carimba o sw.js com o build e o canal', () => {
    const source = "const V = '__BUILD_ID__'; const C = '__CHANNEL__'; '__BUILD_ID__';";
    expect(stampServiceWorker(source, 'abc', 'preview')).toBe(
      "const V = 'abc'; const C = 'preview'; 'abc';",
    );
  });
});
