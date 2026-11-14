import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Review at 900 px with the hidden layer revealed ("Show here"): the "hidden" Flag of the
// layer header fits in the label, the + stays in view and the Details gain no horizontal
// scrollbar (#372, SN3).

// pt-BR kept: shared fixture data (exemplo-completo names such as 'Dados da conta', 'Componentes M3') asserted by tests/examples
test.use({ viewport: { width: 900, height: 720 } });

async function revealHiddenLayer(page: Page): Promise<Locator> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  // Tree, Proposals and Details open; Layers is the left window.
  await page.keyboard.press('Control+Shift+Digit3');
  await page.keyboard.press('Control+Shift+Digit7');
  await page.keyboard.press('Control+Shift+Digit2');
  await page
    .getByRole('button', { name: 'Review: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Read-only').first()).toBeVisible();

  // Hides all layers.
  const toggles = page.getByRole('checkbox', { name: /^Show layer / });
  for (const box of await toggles.all()) {
    if (await box.isChecked()) await box.uncheck({ force: true });
  }

  await page
    .getByRole('group', { name: 'Canvas view' })
    .getByRole('button', { name: 'Proposed', exact: true })
    .click();
  await page.locator('.tree-row', { hasText: 'Dados da conta' }).first().click();
  await page.getByRole('button', { name: 'Show here' }).first().click();

  const head = page
    .locator('.layer-group-head')
    .filter({ hasText: 'Componentes M3' })
    .first();
  await expect(head.locator('.flag')).toBeVisible();
  return head;
}

test('the hidden layer Flag fits in the label and the Details have no horizontal scrollbar at 900 px', async ({
  page,
}) => {
  const head = await revealHiddenLayer(page);

  const geo = await head.evaluate((el) => {
    const label = el.querySelector<HTMLElement>('.layer-group-label')!;
    const flag = el.querySelector<HTMLElement>('.flag')!;
    return {
      labelRight: label.getBoundingClientRect().right,
      flagRight: flag.getBoundingClientRect().right,
    };
  });
  expect(geo.flagRight).toBeLessThanOrEqual(geo.labelRight + 0.5);

  const body = page.locator('[data-window="details"] .tool-window-body');
  const sizes = await body.evaluate((e) => ({
    scroll: e.scrollWidth,
    client: e.clientWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});

// Header priority: name > flag > badge (#447, AC1). The "hidden" flag keeps its whole text,
// because it is a layer state; what gets cut (badge, then name) has the tooltip.
for (const width of [900, 1280]) {
  test(`the "hidden" flag keeps its whole text at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    const head = await revealHiddenLayer(page);
    const text = head.locator('.flag .flag-text');
    const m = await text.evaluate((e) => ({
      scroll: e.scrollWidth,
      client: e.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    // What shrank to make room for the flag shows the whole text in the tooltip.
    for (const part of await head.locator('.layer-group-name, .tag').all()) {
      const cut = await part.evaluate((e) => e.scrollWidth > e.clientWidth);
      if (cut) await expect(part).toHaveAttribute('title', /\S/);
    }
  });
}
