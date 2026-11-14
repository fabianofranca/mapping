import { describe, expect, it } from 'vitest';
import { initials, threadUsers, userKey, userLabel } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T2, message, sampleThread } from './threadFixtures';

describe('userKey / userLabel / initials', () => {
  it('people are grouped by email, without spaces and lowercased', () => {
    const a = { ...HUMAN, email: ' Marina@Exemplo.com ' };
    const b = { ...HUMAN, name: 'M. Alves' };
    expect(userKey(a)).toBe(userKey(b));
  });

  it('agents are grouped by name and are not confused with people', () => {
    expect(userKey(AGENT)).toBe(userKey({ ...AGENT }));
    expect(userKey(AGENT)).not.toBe(userKey({ ...AGENT, name: 'Other' }));
    expect(userKey(AGENT)).not.toBe(userKey(HUMAN));
  });

  it('the label is the name', () => {
    expect(userLabel(HUMAN)).toBe('Marina Alves');
    expect(userLabel(AGENT)).toBe('Claude Code');
  });

  it('initials: first letter of the first and the last word', () => {
    expect(initials(HUMAN)).toBe('MA');
    expect(initials({ ...HUMAN, name: 'ana maria de souza' })).toBe('AS');
    expect(initials({ ...HUMAN, name: '  Cher ' })).toBe('C');
  });

  it('the agent is always AG', () => {
    expect(initials(AGENT)).toBe('AG');
    expect(initials({ ...AGENT, name: 'Zed' })).toBe('AG');
  });
});

describe('threadUsers', () => {
  it('distinct list (people by name, then agents) with the count of threads of each user', () => {
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

  it('without threads, an empty list', () => {
    expect(threadUsers([])).toEqual([]);
  });
});

describe('threadUsers: label and order (item 50)', () => {
  it('the label is the name of the last message of the user, in the input order', () => {
    const renamed = { ...HUMAN, name: 'Marina A. Silva' };
    const t1 = sampleThread({
      id: 't1',
      messages: [message('m1', T0), message('m2', T1, renamed)],
    });
    const t2 = sampleThread({ id: 't2', messages: [message('m1', T0, HUMAN)] });
    expect(threadUsers([t1])[0]).toMatchObject({ label: 'Marina A. Silva', count: 1 });
    // In the input, t2 comes later: Marina's last message is its own.
    expect(threadUsers([t1, t2])[0]).toMatchObject({ label: 'Marina Alves', count: 2 });
  });

  // pt-BR kept: the object is the sorting of accented Portuguese names
  it('name sorting (pt-BR) follows the fixed locale (an accent does not go to the end)', () => {
    const names = ['Zélia', 'Álvaro', 'Bruno'];
    const threads = names.map((name, i) =>
      sampleThread({
        id: `t${i}`,
        messages: [message('m1', T0, { ...HUMAN, name, email: `u${i}@exemplo.com` })],
      }),
    );
    expect(threadUsers(threads).map((u) => u.label)).toEqual([
      'Álvaro',
      'Bruno',
      'Zélia',
    ]);
  });
});
