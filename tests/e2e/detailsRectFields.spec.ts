import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  addContainer,
  buildProposal,
  createMarking,
  createProject,
  proposalFilePath,
  renameContainer,
  renameMarking,
  serialize,
  serializeProposal,
} from '../../src/model';
import { blocksPng } from './png';

// Position and Size of Details in a narrow panel (900 px): X, Y, W and H show the whole
// value (4 digits in review, 3 digits outside it), without the field cutting it (#465, AC1).

test.use({ viewport: { width: 900, height: 720 } });

const NOW = '2026-11-05T12:00:00.000Z';

/** Zip with a marking with 4-digit coordinates and a proposal that renames it. */
async function bigNumbersZip(): Promise<Buffer> {
  let base = createProject({
    name: 'Big',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  base = addContainer(base, {
    id: 'I1',
    file: 'images/g.png',
    width: 3000,
    height: 3000,
  });
  base = renameContainer(base, 'I1', 'Big screen');
  base = createMarking(base, {
    id: 'M1',
    containerId: 'I1',
    name: 'Strip',
    rect: { x: 1234, y: 1345, width: 1456, height: 1567 },
  });
  const proposal = buildProposal(base, renameMarking(base, 'M1', 'New strip'), {
    id: 'big',
    title: 'Rename',
    description: '',
    origin: 'test',
    author: 'test',
    createdAt: NOW,
  });
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(base), opts);
  zip.file('images/g.png', blocksPng(3000, 3000, [240, 240, 240], []), opts);
  zip.file(proposalFilePath(proposal.id), serializeProposal(proposal), opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

/** The four fields do not cut the value and fit 5 digits. */
async function expectFieldsFit(page: Page, digits: number): Promise<void> {
  const fields = page.locator('.props-pair-item .input');
  expect(await fields.count()).toBe(4);
  for (const field of await fields.all()) {
    const m = await field.evaluate((e) => {
      const input = e as HTMLInputElement;
      const probe = document.createElement('span');
      const style = getComputedStyle(input);
      probe.style.font = style.font;
      probe.style.visibility = 'hidden';
      probe.style.position = 'absolute';
      probe.textContent = '0'.repeat(5);
      document.body.append(probe);
      const fiveDigits = probe.getBoundingClientRect().width;
      probe.remove();
      const inner =
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      return {
        value: input.value,
        scroll: input.scrollWidth,
        client: input.clientWidth,
        inner,
        fiveDigits,
      };
    });
    expect(m.value.length).toBeGreaterThanOrEqual(digits);
    expect(m.scroll, `field ${m.value}`).toBeLessThanOrEqual(m.client);
    // Usable width for 5 digits (minus the spinner slack, which the theme hides).
    expect(m.inner, `field ${m.value}`).toBeGreaterThanOrEqual(m.fiveDigits);
  }
}

test('review at 900 px: X, Y, W and H with 4 digits fit whole', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'big.zip',
      mimeType: 'application/zip',
      buffer: await bigNumbersZip(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await page.locator('.tree-row', { hasText: 'Strip' }).first().click();
  await expect(page.locator('.props-pair-item .input').first()).toBeVisible();
  await expectFieldsFit(page, 4);
});

test('outside review, in a 280 px panel, the 3-digit Y fits whole', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit2');
  // pt-BR kept: shared fixture data (examples/exemplo-completo.zip) asserted by other tests
  await page.locator('.tree-row', { hasText: 'Cadastrar' }).first().click();
  const y = page.getByRole('spinbutton', { name: 'Y', exact: true });
  await expect(y).toHaveValue('347');
  await expectFieldsFit(page, 2);
});
