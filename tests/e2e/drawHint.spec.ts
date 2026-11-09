import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Dica do modo Desenhar na barra do canvas (etapa #810, AD1): ela não flutua mais sobre a
// imagem; ocupa o lugar de "Nada selecionado" e, a 900 px, encolhe com reticências e `title`.

const HINT = 'Arraste sobre uma imagem para criar uma marcação.';

async function openExample(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

async function drawAtLowZoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Desenhar', exact: true }).click();
  await page.getByRole('main', { name: 'Canvas do projeto' }).click({
    position: { x: 4, y: 4 },
  });
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+Minus');
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 720 },
]) {
  test(`dica do Desenhar na barra do canvas a ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openExample(page);
    await drawAtLowZoom(page);

    // Nenhum aviso flutuando sobre o canvas.
    await expect(page.locator('.canvas-overlay .notice')).toHaveCount(0);
    await expect(page.locator('.canvas-hint')).toHaveCount(0);

    const empty = page.locator('.canvas-bar .crumbs-empty');
    await expect(empty).toHaveText(HINT);
    const e = await empty.evaluate((el) => ({
      cut: el.scrollWidth > el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
      title: el.getAttribute('title') ?? '',
    }));
    expect(e.title).toBe(HINT);
    if (e.cut) expect(e.ellipsis).toBe('ellipsis');

    // Nenhum item da barra do canvas passa da borda dela.
    const overflow = await page.locator('.canvas-bar').evaluate((bar) => {
      const right = bar.getBoundingClientRect().right;
      return {
        scroll: bar.scrollWidth <= bar.clientWidth,
        inside: [...bar.querySelectorAll<HTMLElement>('.canvas-bar-end > *')].every(
          (c) => c.getBoundingClientRect().right <= right + 0.5,
        ),
      };
    });
    expect(overflow).toEqual({ scroll: true, inside: true });
    await expect(page.locator('.canvas-bar .zoom-field')).toBeVisible();
  });
}
