import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

// Barra de status a 900 px com uma mensagem longa à esquerda ("1 aceita aguardando
// aplicação"): a versão do build (à direita) nunca é cortada; quem trunca é a esquerda.
// jsdom não tem layout; a medição é no Chromium.

test.use({ viewport: { width: 900, height: 720 } });

test('a versão não é cortada quando a mensagem da esquerda é longa', async ({ page }) => {
  await createProject(page, 'Barra');
  const bar = page.locator('.statusbar');
  await expect(bar).toBeVisible();
  const result = await bar.evaluate((el) => {
    const gap = el.querySelector('.statusbar-gap')!;
    const long = document.createElement('span');
    long.className = 'status-item';
    const text = document.createElement('span');
    text.className = 'status-item-text';
    text.textContent = 'x'.repeat(400);
    long.append(text);
    el.insertBefore(long, gap);
    const build = el.querySelector<HTMLElement>('.status-item-mono:last-child')!;
    return {
      cut: build.scrollWidth > build.clientWidth,
      inside: build.getBoundingClientRect().right <= el.getBoundingClientRect().right,
    };
  });
  expect(result).toEqual({ cut: false, inside: true });
});
