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
  throw new Error('esperava ThreadError');
}

describe('openThread', () => {
  it('abre a conversa com a primeira mensagem, revision 0 e resolved null', () => {
    const thread = openThread({
      id: 'c9',
      anchor: { kind: 'layer', id: 'L1' },
      author: AGENT,
      text: 'Qual é a variante?',
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
        { id: 'm1', author: AGENT, at: T0, text: 'Qual é a variante?', proposal: null },
      ],
    });
  });

  it('aceita a proposta ligada à primeira mensagem', () => {
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

  it('recusa dados inválidos com invalid-thread', () => {
    const base = {
      id: 'c9',
      anchor: { kind: 'marking', id: 'M1' } as const,
      author: HUMAN,
      text: 'oi',
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
    expect(codeOf(() => openThread({ ...base, at: 'ontem' }))).toBe('invalid-thread');
  });
});

describe('appendMessage', () => {
  it('acrescenta a mensagem e devolve revision + 1 sem alterar a entrada', () => {
    const before = deepFreeze(sampleThread());
    const after = appendMessage(before, message('m4', T3, AGENT, 'ok'));
    expect(after.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(after.revision).toBe(before.revision + 1);
    expect(before.messages).toHaveLength(3);
    expect(before.revision).toBe(3);
  });

  it('mantém a ordem por at e id, mesmo com mensagem fora de ordem', () => {
    const before = deepFreeze(sampleThread());
    const after = appendMessage(before, message('mx', T1, HUMAN));
    expect(after.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'mx', 'm3']);
  });

  it('recusa id repetido', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => appendMessage(before, message('m2', T3)))).toBe(
      'thread-message-duplicate',
    );
  });

  it('recusa mensagem inválida', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => appendMessage(before, message('m4', T3, HUMAN, '')))).toBe(
      'invalid-thread',
    );
    expect(
      codeOf(() => appendMessage(before, message('m4', T3, { ...HUMAN, email: null }))),
    ).toBe('invalid-thread');
  });

  it('aceita acrescentar numa conversa resolvida (a recusa é de quem chama)', () => {
    const resolved = deepFreeze(sampleThread({ resolved: { by: BY, at: T3 } }));
    const after = appendMessage(resolved, message('m9', '2026-11-06T14:00:00.000Z'));
    expect(after.messages).toHaveLength(4);
  });
});

describe('resolveThread e reopenThread', () => {
  it('resolve com quem e quando, revision + 1, sem alterar a entrada', () => {
    const before = deepFreeze(sampleThread());
    const after = resolveThread(before, BY, T3);
    expect(after.resolved).toEqual({ by: BY, at: T3 });
    expect(after.revision).toBe(4);
    expect(before.resolved).toBeNull();
    expect(threadLocation(after)).toBe('resolved');
  });

  it('resolver de novo é um no-op (devolve a mesma conversa)', () => {
    const resolved = deepFreeze(resolveThread(sampleThread(), BY, T3));
    expect(resolveThread(resolved, { name: 'Outra', email: 'o@x.com' }, T3)).toBe(
      resolved,
    );
  });

  it('recusa quem resolve sem nome ou e-mail', () => {
    const before = deepFreeze(sampleThread());
    expect(codeOf(() => resolveThread(before, { name: 'A', email: '' }, T3))).toBe(
      'invalid-thread',
    );
    expect(codeOf(() => resolveThread(before, BY, 'ontem'))).toBe('invalid-thread');
  });

  it('reabre: limpa resolved, revision + 1, sem alterar a entrada', () => {
    const resolved = deepFreeze(resolveThread(sampleThread(), BY, T3));
    const after = reopenThread(resolved);
    expect(after.resolved).toBeNull();
    expect(after.revision).toBe(resolved.revision + 1);
    expect(resolved.resolved).not.toBeNull();
    expect(threadLocation(after)).toBe('open');
  });

  it('reabrir uma aberta é um no-op', () => {
    const open = deepFreeze(sampleThread());
    expect(reopenThread(open)).toBe(open);
  });
});

describe('threadLocation', () => {
  it('o campo resolved é a verdade', () => {
    expect(threadLocation(sampleThread())).toBe('open');
    expect(threadLocation(sampleThread({ resolved: { by: BY, at: T3 } }))).toBe(
      'resolved',
    );
  });
});

describe('mergeThreadCopies', () => {
  const m = (ids: readonly string[]) =>
    ids.map((id, i) => message(id, `2026-11-06T1${i}:00:00.000Z`));

  it('uma só cópia: devolve ela, no lugar que o campo diz', () => {
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
    // Cópia em comments/ com resolved preenchido: vale o campo.
    expect(mergeThreadCopies(resolved, null).location).toBe('resolved');
    // Cópia em comments/resolved/ com resolved null: vale o campo.
    expect(mergeThreadCopies(null, open).location).toBe('open');
  });

  it('sem nenhuma cópia, recusa', () => {
    expect(codeOf(() => mergeThreadCopies(null, null))).toBe('invalid-thread');
  });

  it('cópias de conversas diferentes são recusadas', () => {
    expect(
      codeOf(() => mergeThreadCopies(sampleThread(), sampleThread({ id: 'outro' }))),
    ).toBe('invalid-thread');
  });

  it('resolvida depois da última mensagem: fica resolvida', () => {
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

  it('resolvida antes da última mensagem: volta a ficar aberta', () => {
    const open = deepFreeze(
      sampleThread({ revision: 5, messages: m(['m1', 'm2', 'm3']) }),
    );
    const resolved = deepFreeze(
      sampleThread({
        revision: 4,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T11:30:00.000Z' }, // depois de m2 (11h), antes de m3 (12h)
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('open');
    expect(merged.resolved).toBe(false);
    expect(merged.thread.resolved).toBeNull();
    expect(merged.thread.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect(merged.thread.revision).toBe(5);
  });

  it('mesmas mensagens: a reabertura interrompida (aberta rev 6, resolvida rev 5) fica aberta', () => {
    const open = deepFreeze(sampleThread({ revision: 6, messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        revision: 5,
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T20:00:00.000Z' }, // depois de m2
      }),
    );
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.location).toBe('open');
    expect(merged.resolved).toBe(false);
    expect(merged.thread.resolved).toBeNull();
    expect(merged.thread.revision).toBe(6);
  });

  it('mesmas mensagens: a cópia resolvida de maior revision mantém a resolução', () => {
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

  it('mensagem nova depois da resolução reabre, mesmo com a resolvida de maior revision', () => {
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

  it('resolved.at igual à última mensagem não é posterior: fica aberta', () => {
    const open = deepFreeze(sampleThread({ messages: m(['m1', 'm2']) }));
    const resolved = deepFreeze(
      sampleThread({
        messages: m(['m1', 'm2']),
        resolved: { by: BY, at: '2026-11-06T11:00:00.000Z' }, // = m2
      }),
    );
    expect(mergeThreadCopies(open, resolved).location).toBe('open');
  });

  it('une as mensagens por id, sem duplicar, ordenadas', () => {
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

  it('o resultado é uma conversa válida e as entradas não mudam', () => {
    const open: Thread = deepFreeze(sampleThread());
    const resolved: Thread = deepFreeze(sampleThread({ resolved: { by: BY, at: T3 } }));
    const merged = mergeThreadCopies(open, resolved);
    expect(merged.thread.id).toBe(open.id);
    expect(open.resolved).toBeNull();
  });
});
