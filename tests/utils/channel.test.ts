import { describe, expect, it } from 'vitest';
import {
  CHANNEL,
  channelDbName,
  channelStorageKey,
  parseChannel,
} from '../../src/utils/channel';
import { readSetting, writeSetting } from '../../src/utils/safeStorage';

describe('build channel', () => {
  it('only "preview" becomes preview; the rest is the main version', () => {
    expect(parseChannel('preview')).toBe('preview');
    expect(parseChannel(undefined)).toBe('main');
    expect(parseChannel('main')).toBe('main');
    expect(parseChannel('PREVIEW')).toBe('main');
  });

  it('the tests run as the main version', () => {
    expect(CHANNEL).toBe('main');
  });

  it('the preview separates the localStorage keys and the IndexedDB database', () => {
    expect(channelStorageKey('mapping.theme', 'main')).toBe('mapping.theme');
    expect(channelStorageKey('mapping.theme', 'preview')).toBe('preview:mapping.theme');
    // pt-BR kept: real IndexedDB name (LEGACY_APP_ID) defined in src/storage/local.ts
    expect(channelDbName('mapeador-imagens', 'main')).toBe('mapeador-imagens');
    expect(channelDbName('mapeador-imagens', 'preview')).toBe('mapeador-imagens-preview');
  });

  it('in the main version the keys stay the same as before', () => {
    writeSetting('mapping.test', 'x');
    expect(localStorage.getItem('mapping.test')).toBe('x');
    expect(readSetting('mapping.test')).toBe('x');
    localStorage.removeItem('mapping.test');
  });
});
