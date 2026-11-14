import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { addAnnotation, addLayer, createMarking, serialize } from '../../src/model';
import { fixtureFiles, fixtureProject } from './proposalFixture';

// Stage #515 (FN1 and FN2, #446 item 2): the ⋮ menu of an out-of-view row opens on the first click.
// The click scrolls the page to the row, and that scroll arrives after the menu opens; the menu
// ignores the scroll that its own opening causes (300 ms window in `openScrollGuard`).

test.use({ viewport: { width: 1280, height: 860 } });

const PAIRS = 24;

async function zipWithManyPairs(): Promise<Buffer> {
  const files = fixtureFiles();
  const project = addAnnotation(fixtureProject(), {
    id: 'A9',
    markingId: 'M1',
    layerId: 'L1',
    name: 'Many pairs',
    entries: Array.from({ length: PAIRS }, (_, i) => ({
      id: `EP${i + 1}`,
      key: `key${i + 1}`,
      value: `value ${i + 1}`,
    })),
  });
  files.set('mapping.json', serialize(project));
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('the ⋮ of an out-of-view row opens on the first click, three times', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await zipWithManyPairs(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Marking tree' })
    // pt-BR kept: shared fixture data (proposalFixture.ts) asserted by other e2e specs
    .getByRole('button', { name: 'Cabeçalho', exact: true })
    .click();
  const last = page.getByRole('button', { name: `Actions for pair key${PAIRS}` });
  await expect(last).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: `Actions for pair key${PAIRS}` }).click();
    await expect(
      page.getByRole('menu', { name: `Actions for pair key${PAIRS}` }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await expect(
      page.getByRole('menu', { name: `Actions for pair key${PAIRS}` }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    // Back to the top so the next round starts from an out-of-view row.
    await page
      .getByRole('button', { name: 'Actions for pair key1', exact: true })
      .focus();
  }
});

// FN2 (finding 3 of the FN1 report): Layers and the Tree use the Popover, and the ⋮ of the last
// row of a scrolling list only opened on the second click (the list scroll arrived at the
// same instant and closed the menu).
const LAYERS = 10;
const MARKS = 40;

async function zipWithLongLists(): Promise<Buffer> {
  const files = fixtureFiles();
  let project = fixtureProject();
  for (let i = 2; i <= LAYERS; i++) {
    project = addLayer(project, {
      id: `LX${i}`,
      name: `Extra ${i}`,
      color: '#43a047',
    });
  }
  for (let i = 1; i <= MARKS; i++) {
    project = createMarking(project, {
      id: `MX${i}`,
      containerId: 'I2',
      name: `Row ${i}`,
      rect: { x: 20, y: 70 + (i % 9) * 60, width: 40, height: 20 },
    });
  }
  files.set('mapping.json', serialize(project));
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('the ⋮ of the last layer and of a Tree row opens on the first click, three times', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'store.zip',
      mimeType: 'application/zip',
      buffer: await zipWithLongLists(),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+2');
  const layers = page.getByRole('region', { name: 'Layers', exact: true });
  await expect(layers).toBeVisible();
  const tree = page.getByRole('region', { name: 'Marking tree' });
  const cases = [
    {
      scope: layers,
      button: `More actions for layer Extra ${LAYERS}`,
      list: '.layer-list',
    },
    { scope: tree, button: `Actions for Row ${MARKS}`, list: null },
  ] as const;
  for (const c of cases) {
    for (let i = 0; i < 3; i++) {
      // Scroll to the top; the target ⋮ stays out of view and the click does not scroll first.
      await c.scope.evaluate((el, list) => {
        for (const box of el.querySelectorAll<HTMLElement>(list ?? '*'))
          box.scrollTop = 0;
      }, c.list);
      const trigger = c.scope.getByRole('button', { name: c.button, exact: true });
      await expect(trigger).toHaveCount(1);
      await trigger.click();
      await expect(page.getByRole('menu', { name: c.button })).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page.getByRole('menu', { name: c.button })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
  }
});
