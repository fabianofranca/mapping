// Cópias do `mapping.json` original guardadas antes de gravar por cima de um arquivo migrado
// (app e servidor MCP). Funções puras: quem grava é o armazenamento.

/** Pasta das cópias do `mapping.json` original guardadas antes de uma migração. */
export const BACKUPS_DIR = 'backups';

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/** `mapping.v<versão>.<AAAAMMDD-HHMMSS>.json`, no horário local. */
export function backupFileName(version: number, date: Date): string {
  const day = `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `mapping.v${version}.${day}-${time}.json`;
}

/** Carimbo `AAAAMMDD-HHMMSS` de um nome gerado por `backupFileName` (para ordenar). */
export function backupTimestamp(name: string): string {
  return /\.(\d{8}-\d{6})\.json$/.exec(name)?.[1] ?? '';
}
