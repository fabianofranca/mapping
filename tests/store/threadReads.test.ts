import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../../src/store/threadReads');
}

const KEY = 'mapping.threadReads';
const AT = '2026-11-06T10:00:00.000Z';
const LATER = '2026-11-06T12:00:00.000Z';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('não lida: lastReadAt por cópia do projeto', () => {
  it('guarda por cópia e por conversa, num blob versionado', async () => {
    const reads = await load();
    expect(reads.lastReadAt('copia-1', 'T1')).toBeNull();
    reads.markThreadRead('copia-1', 'T1', AT);
    reads.markThreadRead('copia-2', 'T1', LATER);
    expect(reads.lastReadAt('copia-1', 'T1')).toBe(AT);
    expect(reads.lastReadAt('copia-2', 'T1')).toBe(LATER);
    expect(reads.lastReadAt('copia-1', 'T2')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      v: 1,
      reads: { 'copia-1': { T1: AT }, 'copia-2': { T1: LATER } },
    });
    // Outra visita lê o que ficou.
    expect((await load()).lastReadAt('copia-1', 'T1')).toBe(AT);
  });

  it('nunca recua: marcar como lida uma data anterior não muda nada', async () => {
    const reads = await load();
    reads.markThreadRead('c', 'T1', LATER);
    reads.markThreadRead('c', 'T1', AT);
    expect(reads.lastReadAt('c', 'T1')).toBe(LATER);
  });

  it.each([
    ['texto corrompido', '{ não é json'],
    ['versão desconhecida', '{"v":9,"reads":{}}'],
    ['formato errado', '{"v":1,"reads":{"c":{"T1":42}}}'],
    ['não é objeto', '[]'],
  ])('descarta o blob com %s', async (_name, raw) => {
    localStorage.setItem(KEY, raw);
    const reads = await load();
    expect(reads.lastReadAt('c', 'T1')).toBeNull();
    // E segue funcionando: o próximo registro substitui o blob descartado.
    reads.markThreadRead('c', 'T1', AT);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      v: 1,
      reads: { c: { T1: AT } },
    });
  });

  it('esquecer a conversa tira só a entrada dela; as mais antigas saem do limite por cópia', async () => {
    const reads = await load();
    reads.markThreadRead('c', 'T1', AT);
    reads.markThreadRead('c', 'T2', AT);
    reads.forgetThreadRead('c', 'T1');
    expect(reads.lastReadAt('c', 'T1')).toBeNull();
    expect(reads.lastReadAt('c', 'T2')).toBe(AT);
    for (let i = 0; i < reads.MAX_READS_PER_COPY + 5; i++) {
      reads.markThreadRead('c', `N${i}`, AT);
    }
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      reads: Record<string, Record<string, string>>;
    };
    expect(Object.keys(stored.reads.c ?? {}).length).toBe(reads.MAX_READS_PER_COPY);
    expect(reads.lastReadAt('c', `N${reads.MAX_READS_PER_COPY + 4}`)).toBe(AT);
  });

  it('com o localStorage bloqueado nada quebra', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const reads = await load();
    expect(reads.lastReadAt('c', 'T1')).toBeNull();
    expect(() => reads.markThreadRead('c', 'T1', AT)).not.toThrow();
    // Vale nesta sessão mesmo sem persistência.
    expect(reads.lastReadAt('c', 'T1')).toBe(AT);
  });
});

describe('duas abas e o limite de cópias (decisão 15)', () => {
  it('duas abas não apagam a lida uma da outra', async () => {
    const tabA = await load();
    const tabB = await load();
    tabA.markThreadRead('copia-a', 'T1', AT);
    tabB.markThreadRead('copia-b', 'T2', LATER);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      reads: Record<string, Record<string, string>>;
    };
    expect(stored.reads['copia-a']).toEqual({ T1: AT });
    expect(stored.reads['copia-b']).toEqual({ T2: LATER });
    expect(tabB.lastReadAt('copia-a', 'T1')).toBe(AT);
  });

  it('guarda as 20 cópias mais recentes: a 21ª tira a mais antiga', async () => {
    const reads = await load();
    for (let i = 0; i < 21; i++) reads.markThreadRead(`c${i}`, 'T', AT);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      reads: Record<string, unknown>;
    };
    expect(Object.keys(stored.reads)).toHaveLength(20);
    expect(stored.reads.c0).toBeUndefined();
    expect(stored.reads.c20).toBeDefined();
  });
});
