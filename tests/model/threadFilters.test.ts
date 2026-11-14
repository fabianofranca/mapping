import { describe, expect, it } from 'vitest';
import { filterThreads, userKey, type Thread } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T3, message, sampleThread } from './threadFixtures';
import { viewProject } from './threadViewFixtures';

const p = viewProject();
const BY = { name: 'Marina Alves', email: 'marina@exemplo.com' };
const JOAO = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };

// open, awaiting agent (last one from a person)
const waitingAgent = sampleThread({
  id: 'wa',
  // pt-BR kept: accent-insensitive search is the object of the text filter tests below
  messages: [message('m1', T0, HUMAN, 'Qual a ação?')],
});
// open, awaiting human (last one from an agent)
const waitingHuman = sampleThread({
  id: 'wh',
  // pt-BR kept: accent-insensitive search is the object of the text filter tests below
  messages: [message('m1', T0, JOAO, 'olá'), message('m2', T1, AGENT, 'Resposta')],
});
const resolved = sampleThread({
  id: 'rs',
  resolved: { by: BY, at: T3 },
  messages: [message('m1', T0, HUMAN, 'done')],
});
const all: readonly Thread[] = [waitingAgent, waitingHuman, resolved];
const ids = (ts: readonly Thread[]) => ts.map((t) => t.id);

describe('filterThreads: status', () => {
  const run = (status: 'all' | 'open' | 'awaitingAgent' | 'awaitingHuman' | 'resolved') =>
    ids(filterThreads(all, p, { status }));

  it('all', () => expect(run('all')).toEqual(['wa', 'wh', 'rs']));
  it('open', () => expect(run('open')).toEqual(['wa', 'wh']));
  it('awaitingAgent', () => expect(run('awaitingAgent')).toEqual(['wa']));
  it('awaitingHuman', () => expect(run('awaitingHuman')).toEqual(['wh']));
  it('resolved', () => expect(run('resolved')).toEqual(['rs']));
});

describe('filterThreads: user and text', () => {
  it('user: some author of the thread', () => {
    expect(ids(filterThreads(all, p, { status: 'all', user: userKey(JOAO) }))).toEqual([
      'wh',
    ]);
    expect(ids(filterThreads(all, p, { status: 'all', user: userKey(AGENT) }))).toEqual([
      'wh',
    ]);
    expect(ids(filterThreads(all, p, { status: 'all', user: userKey(HUMAN) }))).toEqual([
      'wa',
      'rs',
    ]);
  });

  it('user without a thread: none', () => {
    expect(filterThreads(all, p, { status: 'all', user: 'human:nobody@x.com' })).toEqual(
      [],
    );
  });

  // pt-BR kept: the object is the accent/case-insensitive match of Portuguese text
  it('text (pt-BR): no difference of case or accent, in any message', () => {
    expect(ids(filterThreads(all, p, { status: 'all', text: 'ACAO' }))).toEqual(['wa']);
    expect(ids(filterThreads(all, p, { status: 'all', text: 'resposta' }))).toEqual([
      'wh',
    ]);
    expect(ids(filterThreads(all, p, { status: 'all', text: 'olá resposta' }))).toEqual([
      'wh',
    ]);
  });

  it('empty text or only spaces does not filter', () => {
    expect(filterThreads(all, p, { status: 'all', text: '   ' })).toHaveLength(3);
  });

  it('the filters combine (AND)', () => {
    expect(
      filterThreads(all, p, { status: 'open', user: userKey(HUMAN), text: 'acao' }),
    ).toEqual([waitingAgent]);
    expect(filterThreads(all, p, { status: 'resolved', text: 'acao' })).toEqual([]);
  });

  it('does not change the input and keeps the order', () => {
    const input = [resolved, waitingAgent];
    const out = filterThreads(input, p, { status: 'all' });
    expect(ids(out)).toEqual(['rs', 'wa']);
    expect(out).not.toBe(input);
  });
});

describe('filterThreads: cites the selection (decision 34)', () => {
  const anchored = (id: string, anchor: Thread['anchor']) => sampleThread({ id, anchor });
  const threads = [
    anchored('on-a1', { kind: 'marking', id: 'a1' }),
    anchored('on-n1', { kind: 'annotation', id: 'n1' }),
    anchored('on-field', { kind: 'field', annotationId: 'n1', key: 'k' }),
    anchored('on-entry', { kind: 'entry', annotationId: 'n1', entryId: 'e1' }),
    anchored('on-a2', { kind: 'marking', id: 'a2' }),
    anchored('on-t1', { kind: 'annotation', id: 't1' }),
    anchored('on-layer', { kind: 'layer', id: 'L1' }),
    anchored('on-orphan', { kind: 'marking', id: 'zz' }),
    anchored('on-ra1', { kind: 'annotation', id: 'ra1' }),
    anchored('on-arrow', { kind: 'arrow', id: 'r1' }),
  ];
  const run = (itemId: string, cites: Record<string, string[]> = {}) =>
    ids(
      filterThreads(threads, p, {
        status: 'all',
        selection: { itemId, cites: new Map(Object.entries(cites)) },
      }),
    );

  it('shows those anchored on the item and on its parts (annotation, field, pair)', () => {
    expect(run('a1')).toEqual(['on-a1', 'on-n1', 'on-field', 'on-entry']);
  });

  it('the arrow counts its annotations', () => {
    expect(run('r1')).toEqual(['on-ra1', 'on-arrow']);
  });

  it('also shows those that cite the item or a part of it', () => {
    expect(
      run('a1', { 'on-a2': ['a1'], 'on-t1': ['n1'], 'on-layer': ['other'] }),
    ).toEqual(['on-a1', 'on-n1', 'on-field', 'on-entry', 'on-a2', 'on-t1']);
  });

  it('an item with nothing anchored or cited: none', () => {
    expect(run('c1')).toEqual([]);
  });

  it('combines with the other filters', () => {
    const only = filterThreads(threads, p, {
      status: 'resolved',
      selection: { itemId: 'a1', cites: new Map() },
    });
    expect(only).toEqual([]);
  });
});
