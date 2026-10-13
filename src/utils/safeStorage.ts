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

// O mesmo para o `sessionStorage`: o que vale só enquanto a aba existir (sobrevive a
// recarregar a página, não a outra aba). Fase 8.4: o id por aba de uma pasta sem recentes.
export function readSessionSetting(key: string): string | null {
  try {
    return sessionStorage.getItem(channelStorageKey(key));
  } catch {
    return null;
  }
}

export function writeSessionSetting(key: string, value: string): void {
  try {
    sessionStorage.setItem(channelStorageKey(key), value);
  } catch {
    // Sem `sessionStorage`: quem chama guarda em memória.
  }
}
