import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CitationTarget } from '../../src/model';
import {
  composerOpen,
  insertCitation,
  registerComposer,
} from '../../src/store/composerBridge';

// Open composer bridge (Comments stage, CM5): the "Cite in the conversation" menus insert the
// chip in the composer that is mounted and writable.

const TARGET: CitationTarget = { kind: 'marking', id: 'M1' };
const disposers: (() => void)[] = [];
const register = (handle: { insert(target: CitationTarget): void }) => {
  const off = registerComposer(handle);
  disposers.push(off);
  return off;
};

afterEach(() => {
  for (const off of disposers.splice(0)) off();
});

describe('composerBridge', () => {
  it('without a registered composer: closed, and insert returns false', () => {
    expect(composerOpen.value).toBe(false);
    expect(insertCitation(TARGET)).toBe(false);
  });

  it('registering opens; insert hands the target to the composer and returns true', () => {
    const insert = vi.fn();
    register({ insert });
    expect(composerOpen.value).toBe(true);
    expect(insertCitation(TARGET)).toBe(true);
    expect(insert).toHaveBeenCalledWith(TARGET);
  });

  it('unregistering closes again and the returned function is idempotent', () => {
    const insert = vi.fn();
    const off = register({ insert });
    off();
    off();
    expect(composerOpen.value).toBe(false);
    expect(insertCitation(TARGET)).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('with several, the most recent receives; on leaving, the previous one comes back', () => {
    const first = vi.fn();
    const second = vi.fn();
    register({ insert: first });
    const offSecond = register({ insert: second });
    insertCitation(TARGET);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    offSecond();
    expect(composerOpen.value).toBe(true);
    insertCitation(TARGET);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
