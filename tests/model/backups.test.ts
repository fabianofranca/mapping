import { describe, expect, it } from 'vitest';
import {
  GITIGNORE_FILE,
  backupFileName,
  backupTimestamp,
  gitignoreWithBackups,
} from '../../src/model';

describe('mapping backup file name', () => {
  it('mapping.v<version>.<YYYYMMDD-HHMMSS>.json in local time', () => {
    const date = new Date(2026, 8, 3, 7, 5, 9);
    expect(backupFileName(1, date)).toBe('mapping.v1.20260903-070509.json');
    expect(backupFileName(12, new Date(2027, 11, 31, 23, 59, 58))).toBe(
      'mapping.v12.20271231-235958.json',
    );
  });

  it('extracts the timestamp for sorting', () => {
    expect(backupTimestamp('backups/mapping.v3.20260903-070509.json')).toBe(
      '20260903-070509',
    );
    expect(backupTimestamp('other.json')).toBe('');
  });
});

// The `.gitignore` with `backups/` is built here for the app (`storage/folder.ts`) and for the MCP
// server (`create_project`); both sides only read and write (phase 8.5, M10).
describe('gitignoreWithBackups', () => {
  it('the file is .gitignore', () => {
    expect(GITIGNORE_FILE).toBe('.gitignore');
  });

  it('creates the text in a folder without a .gitignore', () => {
    expect(gitignoreWithBackups('')).toBe('backups/\n');
  });

  it('appends the line without erasing what was there (with or without a trailing \\n)', () => {
    expect(gitignoreWithBackups('node_modules/\n.DS_Store')).toBe(
      'node_modules/\n.DS_Store\nbackups/\n',
    );
    expect(gitignoreWithBackups('dist/\n')).toBe('dist/\nbackups/\n');
  });

  it.each(['backups/', '/backups/', 'backups', '/backups', '  backups/  '])(
    'returns null if it already covers backups (%j), also with \\r\\n',
    (line) => {
      expect(gitignoreWithBackups(`dist/\r\n${line}\r\n`)).toBeNull();
      expect(gitignoreWithBackups(line)).toBeNull();
    },
  );

  it('does not confuse another folder with backups', () => {
    expect(gitignoreWithBackups('my-backups/\nbackups-old\n')).toBe(
      'my-backups/\nbackups-old\nbackups/\n',
    );
  });

  it('applying twice appends only once', () => {
    expect(gitignoreWithBackups(gitignoreWithBackups('')!)).toBeNull();
  });
});
