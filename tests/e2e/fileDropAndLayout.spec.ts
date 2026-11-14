import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

// CE3 (#956): page load defects and browser default action defects, which only e2e reaches.

/** Fires `type` with a file on the selector and says whether the app canceled the default action (the navigation). */
async function fileEventPrevented(
  page: Page,
  selector: string,
  type: 'dragover' | 'drop',
): Promise<boolean> {
  return page.evaluate(
    ([sel, kind]) => {
      const target = document.querySelector(sel);
      if (!target) throw new Error(`no ${sel}`);
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'dropped.txt', { type: 'text/plain' }));
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

test.describe('malformed saved layout (#943)', () => {
  for (const open of ['"tree"', '5', 'null', '{"tree":true}']) {
    test(`open=${open} opens the app with the default layout`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((value) => {
        localStorage.setItem('mapping.toolWindows', `{"open":${value}}`);
      }, open);
      await page.reload();
      await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
      await createProject(page, 'Malformed layout');
      await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
    });
  }
});

test.describe('a dropped file does not take the person out of the app (#972)', () => {
  test('on the home screen, dragover and drop with a file are canceled and the app stays mounted', async ({
    page,
  }) => {
    await page.goto('/');
    const url = page.url();
    await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
    expect(await fileEventPrevented(page, 'body', 'dragover')).toBe(true);
    expect(await fileEventPrevented(page, 'body', 'drop')).toBe(true);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('button', { name: /New project/ })).toBeVisible();
  });

  test('in the editor, outside the canvas (panels), the dropped file is also canceled', async ({
    page,
  }) => {
    await createProject(page, 'Dropped file');
    const url = page.url();
    expect(await fileEventPrevented(page, '.app-editor', 'dragover')).toBe(true);
    expect(await fileEventPrevented(page, '.app-editor', 'drop')).toBe(true);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  });
});
