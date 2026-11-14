import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

// CE3 (#956): defeitos de carga da página e de ação padrão do navegador, que só o e2e alcança.

/** Dispara `type` com um arquivo no seletor e diz se a app cancelou a ação padrão (a navegação). */
async function fileEventPrevented(
  page: Page,
  selector: string,
  type: 'dragover' | 'drop',
): Promise<boolean> {
  return page.evaluate(
    ([sel, kind]) => {
      const target = document.querySelector(sel);
      if (!target) throw new Error(`sem ${sel}`);
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'solto.txt', { type: 'text/plain' }));
      const event = new DragEvent(kind, {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    [selector, type] as const,
  );
}

test.describe('layout guardado malformado (#943)', () => {
  for (const open of ['"tree"', '5', 'null', '{"tree":true}']) {
    test(`open=${open} abre a app com o layout padrão`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((value) => {
        localStorage.setItem('mapping.toolWindows', `{"open":${value}}`);
      }, open);
      await page.reload();
      await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
      await createProject(page, 'Layout malformado');
      await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    });
  }
});

test.describe('arquivo solto não tira a pessoa da app (#972)', () => {
  test('na tela inicial, dragover e drop com arquivo são cancelados e a app segue montada', async ({
    page,
  }) => {
    await page.goto('/');
    const url = page.url();
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
    expect(await fileEventPrevented(page, 'body', 'dragover')).toBe(true);
    expect(await fileEventPrevented(page, 'body', 'drop')).toBe(true);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
  });

  test('no editor, fora do canvas (painéis), o arquivo solto também é cancelado', async ({
    page,
  }) => {
    await createProject(page, 'Arquivo solto');
    const url = page.url();
    expect(await fileEventPrevented(page, '.app-editor', 'dragover')).toBe(true);
    expect(await fileEventPrevented(page, '.app-editor', 'drop')).toBe(true);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  });
});
