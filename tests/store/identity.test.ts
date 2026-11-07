import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O módulo lê o `localStorage` ao ser importado: cada teste importa uma cópia nova.
async function load() {
  vi.resetModules();
  return import('../../src/store/identity');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('identidade (nome e e-mail do dispositivo)', () => {
  it('começa sem identidade e guarda em mapping.identity', async () => {
    const identity = await load();
    expect(identity.identity.value).toBeNull();
    expect(identity.setIdentity('  Marina Alves ', ' marina@exemplo.com ')).toBe('ok');
    expect(identity.identity.value).toEqual({
      name: 'Marina Alves',
      email: 'marina@exemplo.com',
    });
    expect(JSON.parse(localStorage.getItem('mapping.identity') ?? 'null')).toEqual({
      name: 'Marina Alves',
      email: 'marina@exemplo.com',
    });
    // Outro carregamento (outra visita) lê o que ficou.
    const again = await load();
    expect(again.identity.value?.email).toBe('marina@exemplo.com');
  });

  it('confere o e-mail de forma leve (algo@algo) e exige nome', async () => {
    const { isValidEmail, setIdentity, identity } = await load();
    for (const ok of ['a@b', 'marina@exemplo.com', 'a.b+c@d.e']) {
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

  it('um valor guardado corrompido ou inválido é descartado', async () => {
    for (const raw of [
      '{ não é json',
      '[]',
      '{"name":"A"}',
      '{"name":"A","email":"sem"}',
    ]) {
      localStorage.setItem('mapping.identity', raw);
      expect((await load()).identity.value).toBeNull();
    }
  });

  it('limpar apaga a identidade', async () => {
    const { setIdentity, clearIdentity, identity } = await load();
    setIdentity('Ana', 'ana@exemplo.com');
    clearIdentity();
    expect(identity.value).toBeNull();
    expect((await load()).identity.value).toBeNull();
  });

  it('com o localStorage bloqueado nada quebra: a identidade vale só nesta sessão', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const { setIdentity, identity } = await load();
    expect(identity.value).toBeNull();
    expect(setIdentity('Ana', 'ana@exemplo.com')).toBe('ok');
    expect(identity.value?.name).toBe('Ana');
  });
});
