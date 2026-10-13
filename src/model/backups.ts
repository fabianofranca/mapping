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

/** Arquivo que diz ao git para ignorar os backups (`backups/`, ver `BACKUPS_DIR`). */
export const GITIGNORE_FILE = '.gitignore';

/** A linha já cobre `backups/` (com ou sem barra no começo ou no fim)? */
function ignoresBackups(line: string): boolean {
  return line.trim().replace(/^\//, '').replace(/\/$/, '') === BACKUPS_DIR;
}

/**
 * Texto do `.gitignore` com `backups/`, para quem versiona o projeto com git: o texto atual
 * (`''` se o arquivo não existe) com a linha acrescentada, ou `null` se ele já cobre a pasta.
 * Nunca apaga nem duplica. Quem grava é o armazenamento (app) ou o `create_project` (MCP).
 */
export function gitignoreWithBackups(text: string): string | null {
  if (text.split(/\r?\n/).some(ignoresBackups)) return null;
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  return `${text}${separator}${BACKUPS_DIR}/\n`;
}
