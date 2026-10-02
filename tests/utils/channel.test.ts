import { describe, expect, it } from 'vitest';
import {
  CHANNEL,
  channelDbName,
  channelStorageKey,
  parseChannel,
} from '../../src/utils/channel';
import { readSetting, writeSetting } from '../../src/utils/safeStorage';

describe('canal do build', () => {
  it('só "preview" vira preview; o resto é a versão principal', () => {
    expect(parseChannel('preview')).toBe('preview');
    expect(parseChannel(undefined)).toBe('main');
    expect(parseChannel('main')).toBe('main');
    expect(parseChannel('PREVIEW')).toBe('main');
  });

  it('os testes rodam como a versão principal', () => {
    expect(CHANNEL).toBe('main');
  });

  it('o preview separa as chaves do localStorage e o banco IndexedDB', () => {
    expect(channelStorageKey('mapping.theme', 'main')).toBe('mapping.theme');
    expect(channelStorageKey('mapping.theme', 'preview')).toBe('preview:mapping.theme');
    expect(channelDbName('mapeador-imagens', 'main')).toBe('mapeador-imagens');
    expect(channelDbName('mapeador-imagens', 'preview')).toBe('mapeador-imagens-preview');
  });

  it('na versão principal as chaves continuam as mesmas de antes', () => {
    writeSetting('mapping.test', 'x');
    expect(localStorage.getItem('mapping.test')).toBe('x');
    expect(readSetting('mapping.test')).toBe('x');
    localStorage.removeItem('mapping.test');
  });
});
