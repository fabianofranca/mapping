import { expect, test } from '@playwright/test';
import { addImage, canvasPoint, createProject, drawMarking } from './helpers';

// Details at 900×720 with Tree, Layers and Details open (R4/R11 of the 5-block round): the
// title of the unnamed marking does not break the word in the middle; if space is short it goes down whole.

test.use({ viewport: { width: 900, height: 720 } });

test('the Details title does not break letter by letter with the three windows open', async ({
  page,
}) => {
  await createProject(page, 'Narrow');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+2');
  await page.keyboard.press('Control+Shift+3');
  const name = page.locator('.identity-name').first();
  await expect(name).toHaveText('Unnamed marking');
  const box = await name.boundingBox();
  // A single line (title font height), not "Unna/med/mark/ing".
  expect(box?.height ?? 99).toBeLessThan(30);
});
