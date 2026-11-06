import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Legenda das marcas na revisão a 900×720 (#537): enquanto aberta, fica por cima do minimapa,
// inteira à vista.

test.use({ viewport: { width: 900, height: 720 } });

test('a legenda das marcas fica por cima do minimapa a 900×720', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();
  // Com a janela Propostas aumentada, o canvas fica baixo e a legenda alcança o minimapa.
  await page.locator('[data-window="proposals"] [role="tree"]').focus();
  for (let i = 0; i < 24; i += 1) await page.keyboard.press('Control+Shift+ArrowUp');
  await page.getByRole('button', { name: 'Legenda das marcas' }).click();
  const legend = page.locator('.review-legend');
  await expect(legend).toBeVisible();

  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.review-legend')!.getBoundingClientRect();
    const b = document.querySelector('.minimap')!.getBoundingClientRect();
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    if (left >= right || top >= bottom) return null;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { onLegend: hit?.closest('.review-legend') !== null };
  });
  // Os dois se sobrepõem a 900×720; no ponto em comum, quem aparece é a legenda.
  expect(overlap).not.toBeNull();
  expect(overlap?.onLegend).toBe(true);

  // Inteira à vista: sem rolagem interna (R13.5; #552, AG4).
  const fit = await legend.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
});

// Legenda sobre a Propostas (#598, JB1): com o canvas mais baixo que ela, a legenda sai do
// recorte do canvas e desce por cima da janela Propostas, inteira, sem passar da coluna do
// canvas nem da barra de status.
test('a legenda cobre a Propostas quando o canvas é mais baixo que ela', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();

  // Aumenta a janela Propostas até o canvas ficar mais baixo que a legenda.
  await page.locator('[data-window="proposals"] [role="tree"]').focus();
  for (let i = 0; i < 24; i += 1) await page.keyboard.press('Control+Shift+ArrowUp');
  const toggle = page.getByRole('button', { name: 'Legenda das marcas' });
  await toggle.click();
  const legend = page.locator('.review-legend');
  await expect(legend).toBeVisible();

  const m = await page.evaluate(() => {
    const el = document.querySelector('.review-legend')!;
    const l = el.getBoundingClientRect();
    const canvas = document.querySelector('[data-canvas-area]')!.getBoundingClientRect();
    const status = document.querySelector('.statusbar')!.getBoundingClientRect();
    const win = document
      .querySelector('[data-window="proposals"]')!
      .getBoundingClientRect();
    const left = Math.max(l.left, win.left);
    const right = Math.min(l.right, win.right);
    const top = Math.max(l.top, win.top);
    const bottom = Math.min(l.bottom, win.bottom);
    const overlaps = left < right && top < bottom;
    const hit = overlaps
      ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      : null;
    return {
      scroll: el.scrollHeight,
      client: el.clientHeight,
      legendBottom: l.bottom,
      statusTop: status.top,
      legendRight: l.right,
      legendLeft: l.left,
      canvasRight: canvas.right,
      canvasLeft: canvas.left,
      canvasHeight: canvas.height,
      legendHeight: l.height,
      overlaps,
      onLegend: hit?.closest('.review-legend') !== null && hit !== null,
    };
  });
  // O canvas está mais baixo que a legenda: a premissa do teste.
  expect(m.canvasHeight).toBeLessThan(m.legendHeight);
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.legendBottom).toBeLessThanOrEqual(m.statusTop);
  expect(m.overlaps).toBe(true);
  expect(m.onLegend).toBe(true);
  expect(m.legendRight).toBeLessThanOrEqual(m.canvasRight + 0.5);
  expect(m.legendLeft).toBeGreaterThanOrEqual(m.canvasLeft - 0.5);

  // Um clique no canvas não a fecha; Esc fecha e o foco volta ao botão.
  const box = (await page.locator('[data-canvas-area]').boundingBox())!;
  await page.mouse.click(box.x + box.width - 20, box.y + 20);
  await expect(legend).toBeVisible();
  await legend.getByRole('button', { name: 'Fechar legenda' }).focus();
  await page.keyboard.press('Escape');
  await expect(legend).toBeHidden();
  await expect(toggle).toBeFocused();
});

// Altura padrão da janela inferior na revisão (#598, decisão 5): a 900×720, com as quatro
// janelas abertas, a lista mostra ao menos 3 linhas inteiras e o rodapé de atalhos cabe na
// janela (o mesmo critério do R4.14).
test('a janela Propostas começa com 3 linhas inteiras e o rodapé à vista', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  for (const key of ['Digit3', 'Digit7', 'Digit2', 'Digit1']) {
    await page.keyboard.press(`Control+Shift+${key}`);
  }
  await page
    .getByRole('button', { name: 'Revisar: Tela de Perfil e ajuste no Cadastro' })
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();
  const m = await page.evaluate(() => {
    const win = document.querySelector('[data-window="proposals"]')!;
    const rows = [...win.querySelectorAll<HTMLElement>('[data-row]')];
    let list: HTMLElement | null = rows[0] ?? null;
    while (list && list.scrollHeight <= list.clientHeight + 1 && list.parentElement) {
      list = list.parentElement;
    }
    const area = (list ?? win).getBoundingClientRect();
    const full = rows.filter((row) => {
      const b = row.getBoundingClientRect();
      return b.top >= area.top - 1 && b.bottom <= area.bottom + 1;
    }).length;
    const footer = document.querySelector('.review-footer')!.getBoundingClientRect();
    const box = win.getBoundingClientRect();
    return { full, footerIn: footer.top >= box.top && footer.bottom <= box.bottom + 0.5 };
  });
  expect(m.full).toBeGreaterThanOrEqual(3);
  expect(m.footerIn).toBe(true);
});
