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

describe('unread: lastReadAt per project copy', () => {
  it('stores per copy and per thread, in a versioned blob', async () => {
    const reads = await load();
    expect(reads.lastReadAt('copy-1', 'T1')).toBeNull();
    reads.markThreadRead('copy-1', 'T1', AT);
    reads.markThreadRead('copy-2', 'T1', LATER);
    expect(reads.lastReadAt('copy-1', 'T1')).toBe(AT);
    expect(reads.lastReadAt('copy-2', 'T1')).toBe(LATER);
    expect(reads.lastReadAt('copy-1', 'T2')).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      v: 1,
      reads: { 'copy-1': { T1: AT }, 'copy-2': { T1: LATER } },
    });
    // Another visit reads what was left.
    expect((await load()).lastReadAt('copy-1', 'T1')).toBe(AT);
  });

  it('never goes back: marking an earlier date as read changes nothing', async () => {
    const reads = await load();
    reads.markThreadRead('c', 'T1', LATER);
    reads.markThreadRead('c', 'T1', AT);
    expect(reads.lastReadAt('c', 'T1')).toBe(LATER);
  });

  it.each([
    ['corrupted text', '{ not json'],
    ['unknown version', '{"v":9,"reads":{}}'],
    ['wrong shape', '{"v":1,"reads":{"c":{"T1":42}}}'],
    ['not an object', '[]'],
  ])('discards the blob with %s', async (_name, raw) => {
    localStorage.setItem(KEY, raw);
    const reads = await load();
    expect(reads.lastReadAt('c', 'T1')).toBeNull();
    // And it keeps working: the next record replaces the discarded blob.
    reads.markThreadRead('c', 'T1', AT);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      v: 1,
      reads: { c: { T1: AT } },
    });
  });

  it('forgetting the thread removes only its entry; the oldest ones leave through the per-copy limit', async () => {
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

  it('with localStorage blocked nothing breaks', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const reads = await load();
    expect(reads.lastReadAt('c', 'T1')).toBeNull();
    expect(() => reads.markThreadRead('c', 'T1', AT)).not.toThrow();
    // It holds in this session even without persistence.
    expect(reads.lastReadAt('c', 'T1')).toBe(AT);
  });
});

describe('two tabs and the copy limit (decision 15)', () => {
  it('two tabs do not erase each other read marks', async () => {
    const tabA = await load();
    const tabB = await load();
    tabA.markThreadRead('copy-a', 'T1', AT);
    tabB.markThreadRead('copy-b', 'T2', LATER);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as {
      reads: Record<string, Record<string, string>>;
    };
    expect(stored.reads['copy-a']).toEqual({ T1: AT });
    expect(stored.reads['copy-b']).toEqual({ T2: LATER });
    expect(tabB.lastReadAt('copy-a', 'T1')).toBe(AT);
  });

  it('keeps the 20 most recent copies: the 21st drops the oldest', async () => {
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
