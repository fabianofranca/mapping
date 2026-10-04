import { afterEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { formatBytes } from '../../src/ui/formatBytes';

afterEach(() => {
  locale.value = 'pt-BR';
});

describe('formatBytes', () => {
  it('escolhe a unidade e usa o separador do idioma', () => {
    locale.value = 'pt-BR';
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB');
    locale.value = 'en-US';
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('tamanho negativo vira zero', () => {
    expect(formatBytes(-5)).toBe('0 B');
  });
});
