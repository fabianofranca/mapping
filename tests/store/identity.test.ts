import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module reads `localStorage` when imported: each test imports a fresh copy.
async function load() {
  vi.resetModules();
  return import('../../src/store/identity');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('identity (name and e-mail of the device)', () => {
  it('starts without an identity and stores it in mapping.identity', async () => {
    const identity = await load();
    expect(identity.identity.value).toBeNull();
    expect(identity.setIdentity('  Marina Alves ', ' marina@example.com ')).toBe('ok');
    expect(identity.identity.value).toEqual({
      name: 'Marina Alves',
      email: 'marina@example.com',
    });
    expect(JSON.parse(localStorage.getItem('mapping.identity') ?? 'null')).toEqual({
      name: 'Marina Alves',
      email: 'marina@example.com',
    });
    // Another load (another visit) reads what was left.
    const again = await load();
    expect(again.identity.value?.email).toBe('marina@example.com');
  });

  it('checks the e-mail lightly (something@something) and requires a name', async () => {
    const { isValidEmail, setIdentity, identity } = await load();
    for (const ok of ['a@b', 'marina@example.com', 'a.b+c@d.e']) {
      expect(isValidEmail(ok)).toBe(true);
    }
    for (const bad of ['', 'a', '@b', 'a@', 'a b@c', 'a@b c', 'a@@b']) {
      expect(isValidEmail(bad)).toBe(false);
    }
    expect(setIdentity('', 'a@b')).toBe('invalid-name');
    expect(setIdentity('   ', 'a@b')).toBe('invalid-name');
    expect(setIdentity('Ana', 'ana')).toBe('invalid-email');
    expect(identity.value).toBeNull();
    expect(localStorage.getItem('mapping.identity')).toBeNull();
  });

  it('a corrupted or invalid stored value is discarded', async () => {
    for (const raw of [
      '{ not json',
      '[]',
      '{"name":"A"}',
      '{"name":"A","email":"none"}',
    ]) {
      localStorage.setItem('mapping.identity', raw);
      expect((await load()).identity.value).toBeNull();
    }
  });

  it('clearing deletes the identity', async () => {
    const { setIdentity, clearIdentity, identity } = await load();
    setIdentity('Ana', 'ana@example.com');
    clearIdentity();
    expect(identity.value).toBeNull();
    expect((await load()).identity.value).toBeNull();
  });

  it('with localStorage blocked nothing breaks: the identity only lasts this session', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { setIdentity, identity } = await load();
    expect(identity.value).toBeNull();
    expect(setIdentity('Ana', 'ana@example.com')).toBe('ok');
    expect(identity.value?.name).toBe('Ana');
  });
});
