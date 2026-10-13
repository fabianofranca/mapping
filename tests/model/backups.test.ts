import { describe, expect, it } from 'vitest';
import {
  GITIGNORE_FILE,
  backupFileName,
  backupTimestamp,
  gitignoreWithBackups,
} from '../../src/model';

describe('nome do backup do mapping', () => {
  it('mapping.v<versão>.<AAAAMMDD-HHMMSS>.json no horário local', () => {
    const date = new Date(2026, 8, 3, 7, 5, 9);
    expect(backupFileName(1, date)).toBe('mapping.v1.20260903-070509.json');
    expect(backupFileName(12, new Date(2027, 11, 31, 23, 59, 58))).toBe(
      'mapping.v12.20271231-235958.json',
    );
  });

  it('extrai o carimbo para ordenar', () => {
    expect(backupTimestamp('backups/mapping.v3.20260903-070509.json')).toBe(
      '20260903-070509',
    );
    expect(backupTimestamp('outro.json')).toBe('');
  });
});

// O `.gitignore` com `backups/` é montado aqui para a app (`storage/folder.ts`) e para o servidor
// MCP (`create_project`); os dois lados só leem e gravam (fase 8.5, M10).
describe('gitignoreWithBackups', () => {
  it('o arquivo é .gitignore', () => {
    expect(GITIGNORE_FILE).toBe('.gitignore');
  });

  it('cria o texto numa pasta sem .gitignore', () => {
    expect(gitignoreWithBackups('')).toBe('backups/\n');
  });

  it('acrescenta a linha sem apagar o que havia (com ou sem \\n no fim)', () => {
    expect(gitignoreWithBackups('node_modules/\n.DS_Store')).toBe(
      'node_modules/\n.DS_Store\nbackups/\n',
    );
    expect(gitignoreWithBackups('dist/\n')).toBe('dist/\nbackups/\n');
  });

  it.each(['backups/', '/backups/', 'backups', '/backups', '  backups/  '])(
    'devolve null se já cobre backups (%j), também com \\r\\n',
    (line) => {
      expect(gitignoreWithBackups(`dist/\r\n${line}\r\n`)).toBeNull();
      expect(gitignoreWithBackups(line)).toBeNull();
    },
  );

  it('não confunde outra pasta com backups', () => {
    expect(gitignoreWithBackups('my-backups/\nbackups-old\n')).toBe(
      'my-backups/\nbackups-old\nbackups/\n',
    );
  });

  it('aplicar duas vezes acrescenta uma vez só', () => {
    expect(gitignoreWithBackups(gitignoreWithBackups('')!)).toBeNull();
  });
});
