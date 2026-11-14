import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_ALLOW_ANY_KEY,
  IMAGE_ORIGINS_KEY,
  loadAllowedOrigins,
  loadImageSwitches,
  saveAllowedOrigins,
  saveImageSwitch,
} from '../../src/storage/imagePermissions';
import { channelStorageKey } from '../../src/utils/channel';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('remote image consent: storage', () => {
  it('default: no origin and all switches off', () => {
    expect(loadAllowedOrigins()).toEqual([]);
    expect(loadImageSwitches()).toEqual({
      allowAnyOrigin: false,
      allowHttp: false,
      allowLocalNetwork: false,
      allowNoCors: false,
    });
  });

  it('writes and reads the origins; http and https of the same host are distinct', () => {
    saveAllowedOrigins(['https://a.com', 'http://a.com', 'https://a.com']);
    expect(loadAllowedOrigins()).toEqual(['https://a.com', 'http://a.com']);
  });

  it('writes the switches', () => {
    saveImageSwitch('allowHttp', true);
    saveImageSwitch('allowNoCors', true);
    saveImageSwitch('allowNoCors', false);
    expect(loadImageSwitches()).toMatchObject({ allowHttp: true, allowNoCors: false });
  });

  it('corrupted values become the default', () => {
    localStorage.setItem(channelStorageKey(IMAGE_ORIGINS_KEY), '{nao-e-json');
    localStorage.setItem(channelStorageKey(IMAGE_ALLOW_ANY_KEY), 'talvez');
    expect(loadAllowedOrigins()).toEqual([]);
    expect(loadImageSwitches().allowAnyOrigin).toBe(false);
    localStorage.setItem(channelStorageKey(IMAGE_ORIGINS_KEY), '{"a":1}');
    expect(loadAllowedOrigins()).toEqual([]);
    localStorage.setItem(
      channelStorageKey(IMAGE_ORIGINS_KEY),
      JSON.stringify(['https://a.com', 3, null, '']),
    );
    expect(loadAllowedOrigins()).toEqual(['https://a.com']);
  });

  it('unavailable storage (throws): reads the default and writing does not break', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(loadAllowedOrigins()).toEqual([]);
    expect(loadImageSwitches().allowAnyOrigin).toBe(false);
    expect(() => saveAllowedOrigins(['https://a.com'])).not.toThrow();
    expect(() => saveImageSwitch('allowHttp', true)).not.toThrow();
  });
});

describe('the consent does not travel with the project', () => {
  it('no module that writes a project, zip, specialization or proposal references it', () => {
    const roots = ['src/storage', 'src/model', 'src/store', 'mcp'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) {
          const text = readFileSync(path, 'utf8');
          if (/imagePermissions|IMAGE_ORIGINS_KEY|mapping\.imageOrigins/.test(text))
            offenders.push(path);
        }
      }
    };
    for (const root of roots) walk(join(process.cwd(), root));
    const allowed = [
      'src/storage/imagePermissions.ts',
      'src/store/imagePermissions.ts',
      'src/store/derived.ts',
    ];
    expect(
      offenders
        .map((path) => path.slice(process.cwd().length + 1))
        .filter((path) => !allowed.includes(path)),
    ).toEqual([]);
  });

  it('the key is only the origin: no specialization id, so a reused id does not inherit it', () => {
    saveAllowedOrigins(['https://cdn.example.com']);
    const raw = localStorage.getItem(channelStorageKey(IMAGE_ORIGINS_KEY));
    expect(JSON.parse(raw ?? 'null')).toEqual(['https://cdn.example.com']);
    expect(Object.keys(localStorage).every((k) => !k.includes('spec'))).toBe(true);
  });
});
