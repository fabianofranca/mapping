import { describe, expect, it } from 'vitest';
import { backupFileName, backupTimestamp } from '../../src/model';

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
