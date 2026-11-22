import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

// Stage #2035 (CL1): the home Catalog validates a library whose format examples are not JSON
// (`.yaml`, `.csv`) like `validate_library` does (CL1-F1).

const LIBRARIES = join(process.cwd(), 'examples', 'libraries');

/** A library folder as a zip, each file passed through `edit` (path, content). */
async function packageZip(
  name: string,
  edit: (path: string, content: Buffer) => Buffer,
): Promise<Buffer> {
  const dir = join(LIBRARIES, name);
  const zip = new JSZip();
  const walk = (path: string): void => {
    for (const entry of readdirSync(join(dir, path), { withFileTypes: true })) {
      const rel = path === '' ? entry.name : `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else zip.file(rel, edit(rel, readFileSync(join(dir, rel))));
    }
  };
  walk('');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test.describe('Broken formats in the home Catalog', () => {
  test.use({ actionTimeout: 10_000 });

  test('an OpenAPI .yaml example that no longer round-trips is an error at fileFormats[0].examples[0]', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const buffer = await packageZip('data-model', (path, content) =>
      path === 'examples/shop.openapi.yaml'
        ? Buffer.from(
            content
              .toString('utf8')
              .replace(
                '      x-timeout-ms: 15000\n',
                '      x-timeout-ms: 15000\n      x-owner: shop-team\n',
              ),
          )
        : content,
    );
    await page.goto('/');
    await page.locator('input[data-library-zip]').setInputFiles({
      name: 'fpa-roundtrip.zip',
      mimeType: 'application/zip',
      buffer,
    });
    const catalog = page.getByRole('main', { name: 'Library catalog' });
    await expect(catalog).toBeVisible();
    const validation = catalog.getByRole('region', { name: 'Package validation' });
    await expect(validation).toContainText('fileFormats[0].examples[0]', {
      timeout: 30_000,
    });
    await expect(validation).toContainText(/round-trip/);
    await expect(validation).not.toContainText('Valid package');
  });
});
