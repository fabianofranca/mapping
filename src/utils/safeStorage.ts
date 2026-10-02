import { channelStorageKey } from './channel';

// localStorage pode lançar exceção (modo privado, file://, dados bloqueados).
// As chaves passam por `channelStorageKey`: o preview não lê as da versão principal.
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(channelStorageKey(key));
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(channelStorageKey(key), value);
  } catch {
    // Sem persistência: a configuração vale só para esta sessão.
  }
}
