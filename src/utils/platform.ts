export type InstallPlatform = 'ios' | 'android' | 'other';

/** iPadOS 13+ se apresenta como "Macintosh", mas tem tela de toque. */
export function detectPlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/** A app está aberta como PWA instalada (sem a barra do navegador). */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** O navegador roda no macOS (Ctrl+clique ali é o clique direito). Puro: recebe os textos. */
export function isApplePlatform(userAgent: string, platform: string): boolean {
  return /^Mac/i.test(platform) || /Macintosh/.test(userAgent);
}

/** Lê a plataforma do navegador na hora (sem cache: o teste e a app trocam o `navigator`). */
export function onApplePlatform(): boolean {
  return isApplePlatform(
    globalThis.navigator?.userAgent ?? '',
    globalThis.navigator?.platform ?? '',
  );
}

/**
 * O clique é da seleção múltipla: Shift, Cmd (`metaKey`) ou, fora do macOS, Ctrl. No macOS
 * Ctrl+clique é o clique direito (menu de contexto) e não junta.
 */
export function isMultiSelectClick(
  e: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  apple: boolean = onApplePlatform(),
): boolean {
  return e.shiftKey || e.metaKey || (e.ctrlKey && !apple);
}
