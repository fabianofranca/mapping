import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Audit of pixel reads (docs/ARCHITECTURE.md, "Remote images: policy, consent and loader"): an `opaque` image
// (loaded without CORS) taints the canvas, so everything that reads pixels back (`toDataURL`,
// `toBlob`, `getImageData`, `toCanvas`, `toImage` of Konva) may only run on scenes that never
// receive an `opaque` remote image. This test scans the code and fails if a new read shows up
// outside the list below: whoever adds one must say why it is safe.

const ROOTS = ['src', 'viewer', 'mcp'];

/** Pixel reads of Konva and of the 2D canvas. */
const PIXEL_READ =
  /\b(toDataURL|toBlob|getImageData)\b|\.toImage\(|\.toCanvas\(\s*(\{|\))/g;

/** Audited files and the reason each read is safe. */
const AUDITED: Readonly<Record<string, string>> = {
  'src/canvas/components/exampleImages.ts':
    'Catalog gallery: `renderScene` with `pixelSafe: true` (an `opaque` image becomes a placeholder) and crossOrigin on the others; proved in tests/canvas/exampleImages.test.ts',
  'src/storage/imageCrop.ts':
    '`toBlob` of the crop of a project image (local `blob:`), with no component layer',
  'src/storage/imageImport.ts':
    '`toBlob` of the optimization of an imported image (user file), with no component layer',
  'src/canvas/viewportController.ts':
    '`toCanvas` of the viewport (converts a screen point into a canvas point), not the Konva one; it reads no pixel',
  'viewer/viewer.ts':
    'embeddable viewer: `ScreenRenderer` always with `pixelSafe: true`, and the `remoteImages` option (off by default) never turns on the retry without CORS, so no `opaque` image exists; proved in tests/viewer/remoteImages.test.ts',
};

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

/** The code without comments (a comment may mention `toBlob` freely). */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

describe('pixel reads (audit of decision 17)', () => {
  const reads = ROOTS.flatMap(sources)
    .map((path) => ({ path, matches: [...code(path).matchAll(PIXEL_READ)] }))
    .filter((file) => file.matches.length > 0);

  it('every pixel read is in the list of audited files', () => {
    const unknown = reads.map((f) => f.path).filter((path) => !(path in AUDITED));
    expect(
      unknown,
      `New pixel read outside the audited list (tests/canvas/pixelReads.test.ts): ${unknown.join(', ')}. ` +
        'An `opaque` remote image taints the canvas; use `pixelSafe: true` and record the reason.',
    ).toEqual([]);
  });

  it('the list holds no file that no longer reads pixels', () => {
    const found = new Set(reads.map((f) => f.path));
    const stale = Object.keys(AUDITED).filter((path) => !found.has(path));
    expect(stale).toEqual([]);
  });

  it('the minimap reads no pixel (it is DOM)', () => {
    for (const path of ['src/canvas/minimap.ts', 'src/ui/Minimap.tsx']) {
      expect(code(path).match(PIXEL_READ), path).toBeNull();
    }
  });
});
