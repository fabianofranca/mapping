import type { Thread, ThreadAnchor, ThreadAuthor, ThreadMessage } from '../../src/model';

export const T0 = '2026-11-06T10:00:00.000Z';
export const T1 = '2026-11-06T11:00:00.000Z';
export const T2 = '2026-11-06T12:00:00.000Z';
export const T3 = '2026-11-06T13:00:00.000Z';

export const HUMAN: ThreadAuthor = {
  kind: 'human',
  // pt-BR kept: shared fixture data asserted by tests/components, tests/store, tests/storage
  name: 'Marina Alves',
  email: 'marina@exemplo.com',
};
export const AGENT: ThreadAuthor = { kind: 'agent', name: 'Claude Code', email: null };

export function message(
  id: string,
  at: string,
  author: ThreadAuthor = HUMAN,
  // pt-BR kept: shared fixture data asserted by tests/components, tests/store, tests/storage
  text = `texto ${id}`,
): ThreadMessage {
  return { id, author, at, text, proposal: null };
}

/** The nine anchor shapes of decision 4. */
export const ANCHORS: readonly ThreadAnchor[] = [
  { kind: 'marking', id: 'M1' },
  { kind: 'container', id: 'I1' },
  { kind: 'annotation', id: 'A1' },
  { kind: 'arrow', id: 'R1' },
  { kind: 'layer', id: 'L1' },
  // pt-BR kept: shared fixture data asserted by tests/components, tests/store, tests/storage
  { kind: 'field', annotationId: 'A1', key: 'variante' },
  { kind: 'entry', annotationId: 'A1', entryId: 'E1' },
  { kind: 'row', annotationId: 'A1', key: 'tabela', rowId: 'W1' },
  { kind: 'point', containerId: 'I1', x: 10.5, y: -4 },
  { kind: 'point', containerId: null, x: 0, y: 20 },
];

/** Open thread with three messages (person, agent, person). */
export function sampleThread(overrides: Partial<Thread> = {}): Thread {
  return {
    format: 'mapping-thread',
    formatVersion: 1,
    id: 'c1b2',
    anchor: { kind: 'marking', id: 'M1' },
    createdAt: T0,
    revision: 3,
    resolved: null,
    messages: [
      message('m1', T0),
      // pt-BR kept: shared fixture data asserted by tests/components, tests/store, tests/storage
      message('m2', T1, AGENT, 'resposta'),
      message('m3', T2),
    ],
    ...overrides,
  };
}

/** Frozen deep copy: operations must not change the input. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Raw (mutable) JSON of a sample thread, to break one field at a time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rawThread(): Record<string, any> {
  return JSON.parse(JSON.stringify(sampleThread())) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
