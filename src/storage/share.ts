import { reportError } from '../utils/report';

/** `true` se o navegador consegue compartilhar este arquivo pela Web Share API. */
export function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
    );
  } catch {
    // Detecção de recurso: `canShare` pode lançar com tipos de arquivo não suportados.
    return false;
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed';

/** Abre a folha de compartilhamento do sistema com o arquivo. */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    reportError('share', e);
    return 'failed';
  }
}

/** Baixa o arquivo pelo navegador (link temporário com `download`). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dá tempo para o navegador começar o download antes de liberar a URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
