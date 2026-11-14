// @vitest-environment node
// The package version quoted in the usage guide comes from the manifest: bumping `VIEWER_VERSION`
// without updating `PACKAGE-README.md` (the `npm pack` and `npm install ./…tgz` of the examples)
// breaks here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error build .mjs module, without declarations
import { VIEWER_VERSION } from '../../viewer/packageManifest.mjs';

const version = VIEWER_VERSION as string;
const readme = readFileSync(join(__dirname, '../../viewer/PACKAGE-README.md'), 'utf8');

describe('PACKAGE-README.md', () => {
  it('quotes the manifest version in every package name', () => {
    const versions = [...readme.matchAll(/mapping-viewer-(\d+\.\d+\.\d+)\.tgz/g)].map(
      (match) => match[1],
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([version]));
  });
});
