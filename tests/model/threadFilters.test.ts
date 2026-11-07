import { describe, expect, it } from 'vitest';
import { filterThreads, userKey, type Thread } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T3, message, sampleThread } from './threadFixtures';
import { viewProject } from './threadViewFixtures';

const p = viewProject();
const BY = { name: 'Marina Alves', email: 'marina@exemplo.com' };
const JOAO = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };

// aberta aguardando agente (última de pessoa)
const waitingAgent = sampleThread({
  id: 'wa',
  messages: [message('m1', T0, HUMAN, 'Qual a ação?')],
});
// aberta aguardando humano (última de agente)
const waitingHuman = sampleThread({
  id: 'wh',
  messages: [message('m1', T0, JOAO, 'olá'), message('m2', T1, AGENT, 'Resposta')],
});
const resolved = sampleThread({
  id: 'rs',
  resolved: { by: BY, at: T3 },
  messages: [message('m1', T0, HUMAN, 'feito')],
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

describe('filterThreads: usuário e texto', () => {
  it('usuário: algum autor da conversa', () => {
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

  it('usuário sem conversa: nenhuma', () => {
    expect(filterThreads(all, p, { status: 'all', user: 'human:ninguem@x.com' })).toEqual(
      [],
    );
  });

  it('texto: sem diferença de caixa nem de acento, em qualquer mensagem', () => {
    expect(ids(filterThreads(all, p, { status: 'all', text: 'ACAO' }))).toEqual(['wa']);
    expect(ids(filterThreads(all, p, { status: 'all', text: 'resposta' }))).toEqual([
      'wh',
    ]);
    expect(ids(filterThreads(all, p, { status: 'all', text: 'olá resposta' }))).toEqual([
      'wh',
    ]);
  });

  it('texto vazio ou só espaços não filtra', () => {
    expect(filterThreads(all, p, { status: 'all', text: '   ' })).toHaveLength(3);
  });

  it('os filtros se combinam (E)', () => {
    expect(
      filterThreads(all, p, { status: 'open', user: userKey(HUMAN), text: 'acao' }),
    ).toEqual([waitingAgent]);
    expect(filterThreads(all, p, { status: 'resolved', text: 'acao' })).toEqual([]);
  });

  it('não altera a entrada e mantém a ordem', () => {
    const input = [resolved, waitingAgent];
    const out = filterThreads(input, p, { status: 'all' });
    expect(ids(out)).toEqual(['rs', 'wa']);
    expect(out).not.toBe(input);
  });
});

describe('filterThreads: cita a seleção (decisão 34)', () => {
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

  it('mostra as ancoradas no item e nas partes dele (anotação, campo, par)', () => {
    expect(run('a1')).toEqual(['on-a1', 'on-n1', 'on-field', 'on-entry']);
  });

  it('a seta conta as anotações dela', () => {
    expect(run('r1')).toEqual(['on-ra1', 'on-arrow']);
  });

  it('mostra também as que citam o item ou uma parte dele', () => {
    expect(
      run('a1', { 'on-a2': ['a1'], 'on-t1': ['n1'], 'on-layer': ['outro'] }),
    ).toEqual(['on-a1', 'on-n1', 'on-field', 'on-entry', 'on-a2', 'on-t1']);
  });

  it('um item sem nada ancorado nem citado: nenhuma', () => {
    expect(run('c1')).toEqual([]);
  });

  it('combina com os outros filtros', () => {
    const only = filterThreads(threads, p, {
      status: 'resolved',
      selection: { itemId: 'a1', cites: new Map() },
    });
    expect(only).toEqual([]);
  });
});
