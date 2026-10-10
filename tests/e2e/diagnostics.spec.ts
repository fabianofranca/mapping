import { expect, test, type Page } from '@playwright/test';
import { createProject, isMobile } from './helpers';

// Fase 5.4: build id visível e erros que escapam dos handlers no Diagnóstico.

/** `abc1234 · 2026-10-10` (ou `dev · …` num build sem git). */
const BUILD_ID = /^([0-9a-f]{7}|dev) · \d{4}-\d{2}-\d{2}$/;

async function aboutBuildId(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const about = page.getByRole('region', { name: 'Sobre' });
  await expect(about).toBeVisible();
  const id = (await about.getByTestId('build-id').textContent()) ?? '';
  expect(id).toMatch(BUILD_ID);
  await expect(about.getByRole('button', { name: 'Copiar' })).toBeVisible();
  return id;
}

test('o build id aparece no "Sobre" das Configurações e na barra de status', async ({
  page,
}, info) => {
  await page.goto('/');
  const id = await aboutBuildId(page);
  await page.keyboard.press('Escape');

  await createProject(page, 'Build');
  if (isMobile(info)) {
    // Celular: o resumo da barra fica no rodapé do menu Painéis.
    await page.getByRole('button', { name: /^Painéis/ }).tap();
    const menu = page.getByRole('dialog', { name: 'Painéis e ações' });
    await expect(menu.getByText(`build ${id}`)).toBeVisible();
  } else {
    const bar = page.getByRole('contentinfo', { name: 'Barra de status' });
    await expect(bar.getByText(id, { exact: true })).toBeVisible();
  }
});

test('promessa rejeitada solta aparece no Diagnóstico', async ({ page }, info) => {
  await createProject(page, 'Erros');
  await page.evaluate(() => {
    void Promise.reject(new Error('promessa solta no handler'));
  });

  if (isMobile(info)) {
    await page.getByRole('button', { name: /^Painéis/ }).tap();
    await page
      .getByRole('dialog', { name: 'Painéis e ações' })
      .getByRole('button', { name: /^Diagnóstico/ })
      .tap();
  } else {
    await page.keyboard.press('Control+Shift+Digit6');
  }
  await expect(page.getByText('promessa solta no handler')).toBeVisible();
  await expect(page.getByText('window', { exact: true })).toBeVisible();
});
