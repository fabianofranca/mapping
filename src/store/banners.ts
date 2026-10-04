import { signal } from '@preact/signals';

// Faixas que o usuário pode dispensar. É estado de UI só da sessão (a app aberta):
// não vai para o `localStorage`, para o `mapping.json` nem para o desfazer (B9, P8).

/** A faixa do build de preview foi dispensada nesta sessão (o selo PREVIEW continua). */
export const previewBannerDismissed = signal(false);

export function dismissPreviewBanner(): void {
  previewBannerDismissed.value = true;
}
