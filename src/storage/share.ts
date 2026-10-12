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

interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface SaveHandleLike {
  createWritable(): Promise<WritableLike>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: readonly { description?: string; accept: Record<string, readonly string[]> }[];
}) => Promise<SaveHandleLike>;

function saveFilePicker(): SaveFilePicker | null {
  const picker: unknown = Reflect.get(globalThis, 'showSaveFilePicker');
  return typeof picker === 'function' ? (picker as SaveFilePicker) : null;
}

/**
 * `showSaveFilePicker` existe (Chrome e Edge) e a página não está num iframe (onde ele é
 * bloqueado). Sem ele, a exportação usa `downloadFile`, que não sabe se a pessoa salvou.
 */
export function canSaveWithPicker(): boolean {
  try {
    return saveFilePicker() !== null && window.self === window.top;
  } catch {
    return false;
  }
}

export type SaveResult = 'saved' | 'cancelled' | 'failed';

/**
 * Abre o "Salvar como" do sistema (nome sugerido, tipo zip) e grava o arquivo pelo
 * handle. `saved` só depois do `close()`, quando o arquivo está no disco; `cancelled`
 * se a pessoa fechou o seletor. Precisa ser chamada direto do clique (o seletor exige
 * um gesto do usuário), antes de qualquer `await`.
 */
export async function saveFileWithPicker(file: File): Promise<SaveResult> {
  const picker = saveFilePicker();
  if (!picker) return 'failed';
  let handle: SaveHandleLike;
  try {
    handle = await picker.call(globalThis, {
      suggestedName: file.name,
      types: [{ accept: { 'application/zip': ['.zip'] } }],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    reportError('export.savePicker', e);
    return 'failed';
  }
  let writable: WritableLike | null = null;
  try {
    writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return 'saved';
  } catch (e) {
    // Descarta a gravação incompleta: o arquivo no disco fica como estava.
    await writable?.abort().catch(() => undefined);
    reportError('export.saveWrite', e);
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
