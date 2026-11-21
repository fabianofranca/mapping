import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

// CL1 (#2482), G1-5: the container Details Density select shows the whole selected text, also
// with the custom value (the number field beside it takes the leftover width, not half).

for (const size of [
  { width: 900, height: 720 },
  { width: 1280, height: 720 },
]) {
  test(`Density select keeps "Custom" whole at ${size.width} × ${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await createProject(page, 'Density');
    await page.getByRole('button', { name: 'New container' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Capture');
    await dialog.getByRole('button', { name: 'Create container' }).click();
    await expect(dialog).toBeHidden();

    const details = page.locator('.props');
    if (!(await details.isVisible()))
      await page.getByRole('button', { name: 'Details', exact: true }).click();
    const select = details.getByLabel('Density', { exact: true }).first();
    await select.selectOption({ label: 'Custom' });
    const field = details.locator('.density-control input');
    await expect(field).toBeVisible();

    const measure = await select.evaluate((el: HTMLSelectElement) => {
      const style = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.font = style.font;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'nowrap';
      probe.textContent = el.selectedOptions[0]?.textContent ?? '';
      document.body.append(probe);
      const text = probe.getBoundingClientRect().width;
      probe.remove();
      const inner =
        el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { text, inner, width: el.getBoundingClientRect().width };
    });
    // The text plus the arrow (the control reserves the icon room in its padding).
    expect(measure.inner).toBeGreaterThanOrEqual(Math.ceil(measure.text));
  });
}
