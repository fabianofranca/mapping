import { describe, expect, it } from 'vitest';
import {
  ThreadError,
  appendMessage,
  mergeThreadCopies,
  openThread,
  reopenThread,
  resolveThread,
  threadLocation,
  type Thread,
} from '../../src/model';
import {
  AGENT,
  HUMAN,
  T0,
  T1,
  T2,
  T3,
  deepFreeze,
  message,
  sampleThread,
} from './threadFixtures';

const BY = { name: 'Marina Alves', email: 'marina@exemplo.com' };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ThreadError) return e.code;
    throw e;
  }
  throw new Error('expected ThreadError');
}

describe('openThread', () => {
  it('opens the thread with the first message, revision 0 and resolved null', () => {
    const thread = openThread({
      id: 'c9',
      anchor: { kind: 'layer', id: 'L1' },
      author: AGENT,
      text: 'Which variant?',
      at: T0,
      messageId: 'm1',
    });
    expect(thread).toEqual({
      format: 'mapping-thread',
      formatVersion: 1,
      id: 'c9',
      anchor: { kind: 'layer', id: 'L1' },
      createdAt: T0,
      revision: 0,
      resolved: null,
      messages: [
        { id: 'm1', author: AGENT, at: T0, text: 'Which variant?', proposal: null },
      ],
    });
  });

  it('accepts the proposal linked to the first message', () => {
    const thread = openThread({
      id: 'c9',
      anchor: { kind: 'marking', id: 'M1' },
      author: AGENT,
      text: 'x',
      at: T0,
      messageId: 'm1',
      proposal: 'P1',
    });
    expect(thread.messages[0]?.proposal).toBe('P1');
  });

  it('rejects invalid data with invalid-thread', () => {
    const base = {
      id: 'c9',
      anchor: { kind: 'marking', id: 'M1' } as const,
      author: HUMAN,
      text: 'hi',
      at: T0,
      messageId: 'm1',
    };
    expect(codeOf(() => openThread({ ...base, id: 'a/b' }))).toBe('invalid-thread');
    expect(codeOf(() => openThread({ ...base, text: '   ' }))).toBe('invalid-thread');
    expect(codeOf(() => openThread({ ...base, text: 'x'.repeat(10001) }))).toBe(
      'invalid-thread',
    );
    expect(codeOf(() => openThread({ ...base, author: { ...HUMAN, email: null } }))).toBe(
      'invalid-thread',
    );
    expect(codeOf(() => openThread({ ...base, at: 'yesterday' }))).toBe('invalid-thread');
  });
});

describe('appendMessage', () => {
  it('appends the message and returns revision + 1 without changing the input', () => {
    const before = deepFreeze(sampleThread());
    const after = appendMessage(before, message('m4', T3, AGENT, 'ok'));
    expect(after.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(after.revision).toBe(before.revision + 1);
    expect(before.messages).toHaveLength(3);
    expect(before.revision).toBe(3);
  });

  it('keeps the order by at and id, even with an out-of-order message', () => {
    const before = deepFreeze(sampleThread());
    const after = appendMessage(before, message('mx', T1, HUMAN));
    expect(after.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mx', 'm3']);
  });

  it('rejects a repeated id', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => appendMessage(before, message('m2', T3)))).toBe(
      'thread-message-duplicate',
    );
  });

  it('rejects an invalid message', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => appendMessage(before, message('m4', T3, HUMAN, '')))).toBe(
      'invalid-thread',
    );
    expect(
      codeOf(() => appendMessage(before, message('m4', T3, { ...HUMAN, email: null }))),
    ).toBe('invalid-thread');
  });

  it('accepts appending to a resolved thread (refusing is up to the caller)', () => {
    const resolved = deepFreeze(sampleThread({ resolved: { by: BY, at: T3 } }));
    const after = appendMessage(resolved, message('m9', '2026-11-06T14:00:00.000Z'));
    expect(after.messages).toHaveLength(4);
  });
});

describe('resolveThread and reopenThread', () => {
  it('resolves with who and when, revision + 1, without changing the input', () => {
    const before = deepFreeze(sampleThread());
    const after = resolveThread(before, BY, T3);
    expect(after.resolved).toEqual({ by: BY, at: T3 });
    expect(after.revision).toBe(4);
    expect(before.resolved).toBeNull();
    expect(threadLocation(after)).toBe('resolved');
  });

  it('resolving again is a no-op (returns the same thread)', () => {
    const resolved = deepFreeze(resolveThread(sampleThread(), BY, T3));
    expect(resolveThread(resolved, { name: 'Another', email: 'o@x.com' }, T3)).toBe(
      resolved,
    );
  });

  it('rejects a resolver without a name or email', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => resolveThread(before, { name: 'A', email: '' }, T3))).toBe(
      'invalid-thread',
    );
    expect(codeOf(() => resolveThread(before, BY, 'yesterday'))).toBe('invalid-thread');
  });

  it('reopens: clears resolved, revision + 1, without changing the input', () => {
    const resolved = deepFreeze(resolveThread(sampleThread(), BY, T3));
    const after = reopenThread(resolved);
    expect(after.resolved).toBeNull();
    expect(after.revision).toBe(resolved.revision + 1);
    expect(resolved.resolved).not.toBeNull();
    expect(threadLocation(after)).toBe('open');
  });

  it('reopening an open one is a no-op', () => {
    const open = deepFreeze(sampleThread());
    expect(reopenThread(open)).toBe(open);
  });
});

describe('threadLocation', () => {
  it('the resolved field is the truth', () => {
    expect(threadLocation(sampleThread())).toBe('open');
    expect(threadLocation(sampleThread({ resolved: { by: BY, at: T3 } }))).toBe(
      'resolved',
    );
  });
});

describe('mergeThreadCopies', () => {
  const m = (ids: readonly string[]) =>
    ids.map((id, i) => message(id, `2026-11-06T1${i}:00:00.000Z`));

  it('a single copy: returns it, in the place the field says', () => {
    const open = deepFreeze(sampleThread());
    expect(mergeThreadCopies(open, null)).toEqual({
      thread: open,
      resolved: false,
      location: 'open',
    });
    const resolved = deepFreeze(sampleThread({ resolved: { by: BY, at: T3 } }));
    expect(mergeThreadCopies(null, resolved)).toEqual({
      thread: resolved,
      resolved: true,
      location: 'resolved',
    });
    // Copy in comments/ with resolved filled in: the field wins.
    expect(mergeThreadCopies(resolved, null).location).toBe('resolved');
    // Copy in comments/resolved/ with resolved null: the field wins.
    expect(mergeThreadCopies(null, open).location).toBe('open');
  });

  it('with no copy, rejects', () => {
    expect(codeOf(() => mergeThreadCopies(null, null))).toBe('invalid-thread');
  });

  it('copies of different threads are rejected', () => {
    expect(
      codeOf(() => mergeThreadCopies(sampleThread(), sampleThread({ id: 'other' }))),
    ).toBe('invalid-thread');
  });

  it('resolved after the last message: stays resolved', () => {
    const open = deepFreeze(sampleThread({ revision: 2, messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        revision: 3,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T20:00:00.000Z' },
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('resolved');
    expect(merged.resolved).toBe(true);
    expect(merged.thread.resolved).toEqual({ by: BY, at: '2026-11-06T20:00:00.000Z' });
    expect(merged.thread.revision).toBe(3);
  });

  it('resolved before the last message: becomes open again', () => {
    const open = deepFreeze(
      sampleThread({ revision: 5, messages: m(['m1', 'm2', 'm3']) }),
    );
    const resolved = deepFreeze(
      sampleThread({
        revision: 4,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T11:30:00.000Z' }, // after m2 (11h), before m3 (12h)
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('open');
    expect(merged.resolved).toBe(false);
    expect(merged.thread.resolved).toBeNull();
    expect(merged.thread.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect(merged.thread.revision).toBe(5);
  });

  it('same messages: the interrupted reopening (open rev 6, resolved rev 5) stays open', () => {
    const open = deepFreeze(sampleThread({ revision: 6, messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        revision: 5,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T20:00:00.000Z' }, // after m2
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('open');
    expect(merged.resolved).toBe(false);
    expect(merged.thread.resolved).toBeNull();
    expect(merged.thread.revision).toBe(6);
  });

  it('same messages: the resolved copy with the higher revision keeps the resolution', () => {
    const open = deepFreeze(sampleThread({ revision: 5, messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        revision: 6,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T20:00:00.000Z' },
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('resolved');
    expect(merged.thread.resolved).toEqual({ by: BY, at: '2026-11-06T20:00:00.000Z' });
  });

  it('a new message after the resolution reopens, even with the resolved one at a higher revision', () => {
    const open = deepFreeze(
      sampleThread({ revision: 5, messages: m(['m1', 'm2', 'm3']) }),
    );
    const resolved = deepFreeze(
      sampleThread({
        revision: 6,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T11:30:00.000Z' },
      }),
    );
    expect(mergeThreadCopies(open, resolved).location).toBe('open');
  });

  it('resolved.at equal to the last message is not later: stays open', () => {
    const open = deepFreeze(sampleThread({ messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T11:00:00.000Z' }, // = m2
      }),
    );
    expect(mergeThreadCopies(open, resolved).location).toBe('open');
  });

  it('merges the messages by id, without duplicating, sorted', () => {
    const open = deepFreeze(
      sampleThread({
        revision: 2,
        messages: [message('m1', T0), message('m3', T2), message('m4', T3, AGENT)],
      }),
    );
    const resolved = deepFreeze(
      sampleThread({
        revision: 7,
        messages: [message('m1', T0), message('m2', T1, AGENT)],
        resolved: { by: BY, at: '2026-11-07T00:00:00.000Z' },
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.thread.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(merged.thread.revision).toBe(7);
    expect(merged.location).toBe('resolved');
  });

  it('the result is a valid thread and the inputs do not change', () => {
    const open: Thread = deepFreeze(sampleThread());
    const resolved: Thread = deepFreeze(sampleThread({ resolved: { by: BY, at: T3 } }));
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.thread.id).toBe(open.id);
    expect(open.resolved).toBeNull();
  });
});
