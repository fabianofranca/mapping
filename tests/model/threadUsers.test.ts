import { describe, expect, it } from 'vitest';
import { initials, threadUsers, userKey, userLabel } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T2, message, sampleThread } from './threadFixtures';

describe('userKey / userLabel / initials', () => {
  it('pessoas são agrupadas pelo e-mail, sem espaços e em minúsculas', () => {
    const a = { ...HUMAN, email: ' Marina@Exemplo.com ' };
    const b = { ...HUMAN, name: 'M. Alves' };
    expect(userKey(a)).toBe(userKey(b));
  });

  it('agentes são agrupados pelo nome e não se confundem com pessoas', () => {
    expect(userKey(AGENT)).toBe(userKey({ ...AGENT }));
    expect(userKey(AGENT)).not.toBe(userKey({ ...AGENT, name: 'Outro' }));
    expect(userKey(AGENT)).not.toBe(userKey(HUMAN));
  });

  it('o rótulo é o nome', () => {
    expect(userLabel(HUMAN)).toBe('Marina Alves');
    expect(userLabel(AGENT)).toBe('Claude Code');
  });

  it('iniciais: primeira letra da primeira e da última palavra', () => {
    expect(initials(HUMAN)).toBe('MA');
    expect(initials({ ...HUMAN, name: 'ana maria de souza' })).toBe('AS');
    expect(initials({ ...HUMAN, name: '  Cher ' })).toBe('C');
  });

  it('o agente é sempre AG', () => {
    expect(initials(AGENT)).toBe('AG');
    expect(initials({ ...AGENT, name: 'Zed' })).toBe('AG');
  });
});

describe('threadUsers', () => {
  it('lista distinta (pessoas por nome, depois agentes) com a contagem de conversas de cada usuário', () => {
    const other = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };
    const t1 = sampleThread({
      id: 't1',
      messages: [message('m1', T0), message('m2', T1, AGENT), message('m3', T2)],
    });
    const t2 = sampleThread({ id: 't2', messages: [message('m1', T0, other)] });
    const t3 = sampleThread({
      id: 't3',
      messages: [message('m1', T0, { ...HUMAN, email: 'MARINA@exemplo.com' })],
    });
    const users = threadUsers([t1, t2, t3]);
    expect(users).toEqual([
      {
        key: userKey(other),
        label: 'João',
        kind: 'human',
        email: 'joao@exemplo.com',
        count: 1,
      },
      {
        key: userKey(HUMAN),
        label: 'Marina Alves',
        kind: 'human',
        email: 'marina@exemplo.com',
        count: 2,
      },
      { key: userKey(AGENT), label: 'Claude Code', kind: 'agent', email: null, count: 1 },
    ]);
  });

  it('sem conversas, lista vazia', () => {
    expect(threadUsers([])).toEqual([]);
  });
});
