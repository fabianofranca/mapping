import { expect, test } from '@playwright/test';

// Quebrado de propósito (aceite da fase 5.6): o deploy do preview precisa ficar
// vermelho antes de publicar. Este branch é temporário e pode ser apagado.
test('falha de propósito para provar que o deploy bloqueia', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('texto que não existe na app')).toBeVisible({
    timeout: 1000,
  });
});
