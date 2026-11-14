import { describe, expect, it } from 'vitest';
import { bulkDeleteCandidates, deleteImpact, userKey } from '../../src/model';
import { AGENT, HUMAN, T0, T1, T2, T3, message, sampleThread } from './threadFixtures';

const me = { email: 'marina@exemplo.com' };
const BY = { name: 'Marina Alves', email: 'marina@exemplo.com' };
const JOAO = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };

describe('deleteImpact', () => {
  it('direct when all messages are from the same email (ignoring spaces and case)', () => {
    const t = sampleThread({
      messages: [
        message('m1', T0, HUMAN),
        message('m2', T1, { ...HUMAN, name: 'M. Alves', email: ' MARINA@exemplo.com ' }),
      ],
    });
    expect(deleteImpact(t, me)).toEqual({
      direct: true,
      threads: 1,
      messages: 2,
      // the label is the name of the author's last message
      authors: [{ key: userKey(HUMAN), label: 'M. Alves', kind: 'human', count: 2 }],
    });
  });

  it('not direct when there is an agent message', () => {
    const impact = deleteImpact(sampleThread(), me);
    expect(impact.direct).toBe(false);
    expect(impact.messages).toBe(3);
    expect(impact.authors).toEqual([
      { key: userKey(HUMAN), label: 'Marina Alves', kind: 'human', count: 2 },
      { key: userKey(AGENT), label: 'Claude Code', kind: 'agent', count: 1 },
    ]);
  });

  it('not direct when some message is from another person', () => {
    const t = sampleThread({
      messages: [message('m1', T0, HUMAN), message('m2', T1, JOAO)],
    });
    expect(deleteImpact(t, me).direct).toBe(false);
  });

  it('not direct without an identity', () => {
    const t = sampleThread({ messages: [message('m1', T0, HUMAN)] });
    expect(deleteImpact(t, null).direct).toBe(false);
  });

  it('an agent with the same name as the person is never "direct"', () => {
    const t = sampleThread({
      messages: [message('m1', T0, { ...AGENT, name: 'Marina Alves' })],
    });
    expect(deleteImpact(t, me).direct).toBe(false);
  });

  it('batch: sum of threads, messages and authors (most messages first, ties by name)', () => {
    const t1 = sampleThread({
      id: 't1',
      messages: [message('m1', T0, JOAO), message('m2', T1, JOAO)],
    });
    const t2 = sampleThread({
      id: 't2',
      messages: [
        message('m1', T0, HUMAN),
        message('m2', T1, AGENT),
        message('m3', T2, JOAO),
      ],
    });
    expect(deleteImpact([t1, t2], me)).toEqual({
      direct: false,
      threads: 2,
      messages: 5,
      authors: [
        { key: userKey(JOAO), label: 'João', kind: 'human', count: 3 },
        { key: userKey(AGENT), label: 'Claude Code', kind: 'agent', count: 1 },
        { key: userKey(HUMAN), label: 'Marina Alves', kind: 'human', count: 1 },
      ],
    });
  });

  it('a batch with only own messages is direct; an empty batch is not', () => {
    const mine = sampleThread({ messages: [message('m1', T0, HUMAN)] });
    expect(deleteImpact([mine, mine], me).direct).toBe(true);
    expect(deleteImpact([], me)).toEqual({
      direct: false,
      threads: 0,
      messages: 0,
      authors: [],
    });
  });
});

describe('bulkDeleteCandidates', () => {
  const open = sampleThread({ id: 'open', messages: [message('m1', T0, JOAO)] });
  const doneOld = sampleThread({
    id: 'old',
    resolved: { by: BY, at: T1 },
    messages: [message('m1', T0, HUMAN)],
  });
  const doneNew = sampleThread({
    id: 'new',
    resolved: { by: BY, at: T3 },
    messages: [message('m1', T0, HUMAN), message('m2', T2, AGENT)],
  });
  const all = [open, doneOld, doneNew];

  it('only the resolved ones', () => {
    const r = bulkDeleteCandidates(all, { onlyResolved: true });
    expect(r.threads.map((t) => t.id)).toEqual(['old', 'new']);
    expect(r.messages).toBe(3);
    expect(r.authors).toEqual([
      { key: userKey(HUMAN), label: 'Marina Alves', kind: 'human', count: 2 },
      { key: userKey(AGENT), label: 'Claude Code', kind: 'agent', count: 1 },
    ]);
  });

  it('without "only the resolved ones", the open ones are included too', () => {
    expect(bulkDeleteCandidates(all, { onlyResolved: false }).threads).toHaveLength(3);
  });

  it('with the last message before a date', () => {
    const r = bulkDeleteCandidates(all, { onlyResolved: false, lastMessageBefore: T1 });
    expect(r.threads.map((t) => t.id)).toEqual(['open', 'old']);
    const r2 = bulkDeleteCandidates(all, { onlyResolved: true, lastMessageBefore: T3 });
    expect(r2.threads.map((t) => t.id)).toEqual(['old', 'new']);
  });

  it('an invalid date deletes nothing (the safe side)', () => {
    expect(
      bulkDeleteCandidates(all, { onlyResolved: false, lastMessageBefore: 'yesterday' })
        .threads,
    ).toEqual([]);
  });

  it('no candidate: zeroed counts', () => {
    expect(bulkDeleteCandidates([open], { onlyResolved: true })).toEqual({
      threads: [],
      messages: 0,
      authors: [],
    });
  });
});
