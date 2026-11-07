import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CitationTarget } from '../../src/model';
import {
  composerOpen,
  insertCitation,
  registerComposer,
} from '../../src/store/composerBridge';

// Ponte do compositor aberto (etapa Comentários, CM5): os menus "Citar na conversa" inserem o
// chip no compositor que estiver montado e gravável.

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
  it('sem compositor registrado: fechado, e inserir devolve false', () => {
    expect(composerOpen.value).toBe(false);
    expect(insertCitation(TARGET)).toBe(false);
  });

  it('registrar abre; inserir entrega o alvo ao compositor e devolve true', () => {
    const insert = vi.fn();
    register({ insert });
    expect(composerOpen.value).toBe(true);
    expect(insertCitation(TARGET)).toBe(true);
    expect(insert).toHaveBeenCalledWith(TARGET);
  });

  it('desregistrar fecha de novo e a função devolvida é idempotente', () => {
    const insert = vi.fn();
    const off = register({ insert });
    off();
    off();
    expect(composerOpen.value).toBe(false);
    expect(insertCitation(TARGET)).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('com vários, o mais recente recebe; ao sair, volta o anterior', () => {
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
