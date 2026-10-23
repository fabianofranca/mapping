import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// A dica da barra lateral não cobre o menu do projeto aberto (900 px).

test.use({ viewport: { width: 900, height: 700 } });

test('dica da barra lateral some enquanto o menu do projeto está aberto', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  const strip = page.locator('.tool-strip-left .tooltip-anchor').first();
  // Sem menu: a dica aparece ao passar o mouse.
  await strip.hover();
  await expect(strip.locator('.tooltip')).toBeVisible();

  await page.getByRole('button', { name: 'Ações do projeto' }).click();
  await expect(
    page.getByRole('button', { name: 'Fechar projeto', exact: true }),
  ).toBeVisible();
  await strip.hover();
  await expect(strip.locator('.tooltip')).toBeHidden();
  // O item do menu continua livre para o clique (nada o cobre).
  const item = page.getByRole('button', { name: 'Fechar projeto', exact: true });
  const box = (await item.boundingBox())!;
  const covered = await item.evaluate(
    (el, pt) => !el.contains(document.elementFromPoint(pt.x, pt.y)),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(covered).toBe(false);
});
