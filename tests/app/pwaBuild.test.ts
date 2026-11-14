import { describe, expect, it } from 'vitest';
import { PREVIEW_APP_NAME, channelManifest, stampServiceWorker } from '../../pwa/build';
import manifest from '../../pwa/manifest.webmanifest?raw';

describe('PWA files per channel', () => {
  it('the main version publishes the manifest unchanged', () => {
    expect(channelManifest(manifest, 'main')).toBe(manifest);
  });

  it('the preview has its own name and keeps relative scope and start', () => {
    const preview: unknown = JSON.parse(channelManifest(manifest, 'preview'));
    expect(preview).toMatchObject({
      name: PREVIEW_APP_NAME,
      short_name: PREVIEW_APP_NAME,
      start_url: './',
      scope: './',
    });
  });

  it('stamps sw.js with the build and the channel', () => {
    const source = "const V = '__BUILD_ID__'; const C = '__CHANNEL__'; '__BUILD_ID__';";
    expect(stampServiceWorker(source, 'abc', 'preview')).toBe(
      "const V = 'abc'; const C = 'preview'; 'abc';",
    );
  });
});
