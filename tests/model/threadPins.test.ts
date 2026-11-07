import { describe, expect, it } from 'vitest';
import { pinGroups, type PinGroup, type Thread } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T3, message, sampleThread } from './threadFixtures';
import { viewProject } from './threadViewFixtures';

const p = viewProject();
const BY = { name: 'Marina Alves', email: 'marina@exemplo.com' };
const none = () => false;

function on(id: string, anchor: Thread['anchor'], extra: Partial<Thread> = {}): Thread {
  return sampleThread({ id, anchor, ...extra });
}
const waitsAgent = [message('m1', T0, HUMAN, 'a')];
const waitsHuman = [message('m1', T0, HUMAN, 'a'), message('m2', T1, AGENT, 'b')];
const RESOLVED = { by: BY, at: T3 };

function groups(
  threads: readonly Thread[],
  selectedThreadId: string | null = null,
  unread: (t: Thread) => boolean = none,
) {
  return pinGroups(p, threads, { selectedThreadId, unread });
}
const byKey = (gs: readonly PinGroup[], key: string) => gs.find((g) => g.hostKey === key);

describe('pinGroups', () => {
  it('a conversa do campo fica no pino da marcação, junto com a da própria marcação', () => {
    const gs = groups([
      on('c1', { kind: 'marking', id: 'a2' }, { messages: waitsAgent }),
      on(
        'c2',
        { kind: 'field', annotationId: 't1', key: 'variante' },
        { messages: waitsAgent },
      ),
      on(
        'c3',
        { kind: 'row', annotationId: 't1', key: 'tabela', rowId: 'w1' },
        { messages: waitsAgent },
      ),
    ]);
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({
      hostKey: 'marking:a2',
      host: { kind: 'marking', id: 'a2' },
      threadIds: ['c1', 'c2', 'c3'],
      count: 3,
      label: '3',
    });
  });

  it('um grupo por hospedeiro: marcação, container, seta e cada ponto solto', () => {
    const gs = groups([
      on('m', { kind: 'marking', id: 'a1' }),
      on('i', { kind: 'container', id: 'A' }),
      on('r', { kind: 'annotation', id: 'ra1' }),
      on('p1', { kind: 'point', containerId: 'A', x: 1, y: 2 }),
      on('p2', { kind: 'point', containerId: 'A', x: 3, y: 2 }),
      on('p3', { kind: 'point', containerId: null, x: 1, y: 2 }),
    ]);
    expect(gs.map((g) => g.hostKey)).toEqual([
      'marking:a1',
      'container:A',
      'arrow:r1',
      'point:A:1:2',
      'point:A:3:2',
      'point::1:2',
    ]);
  });

  it('camada e órfã não têm pino', () => {
    expect(
      groups([
        on('l', { kind: 'layer', id: 'L1' }),
        on('o', { kind: 'marking', id: 'zz' }),
        on('o2', { kind: 'point', containerId: 'zz', x: 0, y: 0 }),
      ]),
    ).toEqual([]);
  });

  it('com uma conversa, o rótulo traz as iniciais de quem abriu e o número de mensagens', () => {
    const [g] = groups([
      on(
        'c1',
        { kind: 'marking', id: 'a1' },
        { messages: [message('m1', T0, AGENT), message('m2', T1, HUMAN)] },
      ),
    ]);
    expect(g).toMatchObject({ count: 1, label: 'AG 2', initials: 'AG', messages: 2 });
    const [h] = groups([on('c2', { kind: 'marking', id: 'a1' })]);
    expect(h).toMatchObject({ label: 'MA 3', initials: 'MA', messages: 3 });
  });

  it('com várias, o rótulo é a contagem', () => {
    const [g] = groups([
      on('a', { kind: 'marking', id: 'a1' }),
      on('b', { kind: 'annotation', id: 'n1' }),
    ]);
    expect(g).toMatchObject({ count: 2, label: '2', initials: null, messages: null });
  });

  it('a cor é a da conversa mais urgente: humano, depois agente, depois resolvida', () => {
    const anchor = { kind: 'marking', id: 'a1' } as const;
    const agent = on('ag', anchor, { messages: waitsAgent });
    const human = on('hu', anchor, { messages: waitsHuman });
    const done = on('rs', anchor, { resolved: RESOLVED, messages: waitsAgent });
    expect(groups([agent, human])[0]?.color).toBe('awaitingHuman');
    expect(groups([agent])[0]?.color).toBe('awaitingAgent');
    expect(groups([done, agent])[0]?.color).toBe('awaitingAgent');
    expect(groups([done], 'rs')[0]?.color).toBe('resolved');
  });

  it('a resolvida só tem pino quando é a selecionada', () => {
    const done = on('rs', { kind: 'marking', id: 'a1' }, { resolved: RESOLVED });
    expect(groups([done])).toEqual([]);
    expect(groups([done], 'rs')).toHaveLength(1);
  });

  it('a resolvida selecionada entra no grupo da aberta, sem mudar a cor', () => {
    const anchor = { kind: 'marking', id: 'a1' } as const;
    const open = on('op', anchor, { messages: waitsHuman });
    const done = on('rs', anchor, { resolved: RESOLVED });
    const [g] = groups([open, done], 'rs');
    expect(g).toMatchObject({
      threadIds: ['op', 'rs'],
      count: 2,
      color: 'awaitingHuman',
    });
  });

  it('hasUnread vem do predicado', () => {
    const a = on('a', { kind: 'marking', id: 'a1' });
    const b = on('b', { kind: 'container', id: 'A' });
    const gs = groups([a, b], null, (t) => t.id === 'b');
    expect(byKey(gs, 'marking:a1')?.hasUnread).toBe(false);
    expect(byKey(gs, 'container:A')?.hasUnread).toBe(true);
  });

  it('não altera as entradas', () => {
    const t = on('a', { kind: 'marking', id: 'a1' });
    const input = [t];
    groups(input);
    expect(input).toEqual([t]);
  });
});
