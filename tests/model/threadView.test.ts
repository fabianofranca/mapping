import { describe, expect, it } from 'vitest';
import {
  awaiting,
  hostKey,
  hostOf,
  isOrphan,
  isUnread,
  resolveAnchor,
  threadSubject,
  messagePlainText,
  SUBJECT_MAX,
  type ThreadAnchor,
} from '../../src/model';
import { AGENT, HUMAN, T0, T1, T2, T3, message, sampleThread } from './threadFixtures';
import { viewProject } from './threadViewFixtures';

const p = viewProject();

describe('resolveAnchor / hostOf / isOrphan', () => {
  const cases: readonly [string, ThreadAnchor, string | null][] = [
    ['marking', { kind: 'marking', id: 'a1' }, 'marking:a1'],
    ['container', { kind: 'container', id: 'A' }, 'container:A'],
    ['arrow', { kind: 'arrow', id: 'r1' }, 'arrow:r1'],
    ['annotation of a marking', { kind: 'annotation', id: 'n1' }, 'marking:a1'],
    ['annotation of an arrow', { kind: 'annotation', id: 'ra1' }, 'arrow:r1'],
    ['field', { kind: 'field', annotationId: 't1', key: 'variant' }, 'marking:a2'],
    ['entry', { kind: 'entry', annotationId: 'n1', entryId: 'e1' }, 'marking:a1'],
    [
      'row',
      { kind: 'row', annotationId: 't1', key: 'table', rowId: 'w1' },
      'marking:a2',
    ],
    ['layer', { kind: 'layer', id: 'L1' }, null],
    [
      'point in the container',
      { kind: 'point', containerId: 'A', x: 10, y: 20 },
      'point:A:10:20',
    ],
    [
      'point on the canvas',
      { kind: 'point', containerId: null, x: 1.5, y: -2 },
      'point::1.5:-2',
    ],
  ];

  it.each(cases)('%s: not an orphan and the host is %s', (_name, anchor, key) => {
    expect(isOrphan(p, anchor)).toBe(false);
    const host = hostOf(p, anchor);
    expect(host === null ? null : hostKey(host)).toBe(key);
  });

  it('the point is its own host', () => {
    expect(hostOf(p, { kind: 'point', containerId: 'A', x: 10, y: 20 })).toEqual({
      kind: 'point',
      containerId: 'A',
      x: 10,
      y: 20,
    });
  });

  it('the layer resolves, without a host (no pin)', () => {
    expect(resolveAnchor(p, { kind: 'layer', id: 'L1' })).toEqual({
      orphan: false,
      anchor: { kind: 'layer', id: 'L1' },
      host: null,
    });
  });

  const orphans: readonly [string, ThreadAnchor, string][] = [
    ['marking', { kind: 'marking', id: 'zz' }, 'marking'],
    ['container', { kind: 'container', id: 'zz' }, 'container'],
    ['arrow', { kind: 'arrow', id: 'zz' }, 'arrow'],
    ['annotation', { kind: 'annotation', id: 'zz' }, 'annotation'],
    ['layer', { kind: 'layer', id: 'zz' }, 'layer'],
    ['field without an annotation', { kind: 'field', annotationId: 'zz', key: 'k' }, 'annotation'],
    [
      'entry without an annotation',
      { kind: 'entry', annotationId: 'zz', entryId: 'e1' },
      'annotation',
    ],
    ['entry without the pair', { kind: 'entry', annotationId: 'n1', entryId: 'zz' }, 'entry'],
    [
      'row without an annotation',
      { kind: 'row', annotationId: 'zz', key: 'table', rowId: 'w1' },
      'annotation',
    ],
    [
      'row without the row',
      { kind: 'row', annotationId: 't1', key: 'table', rowId: 'zz' },
      'row',
    ],
    [
      'row without the table',
      { kind: 'row', annotationId: 't1', key: 'zz', rowId: 'w1' },
      'row',
    ],
    [
      'row in a free annotation',
      { kind: 'row', annotationId: 'n1', key: 'table', rowId: 'w1' },
      'row',
    ],
    [
      'point with a deleted container',
      { kind: 'point', containerId: 'zz', x: 0, y: 0 },
      'container',
    ],
  ];

  it.each(orphans)(
    '%s: orphan, with the type of the deleted target (%s)',
    (_name, anchor, missing) => {
      expect(isOrphan(p, anchor)).toBe(true);
      expect(hostOf(p, anchor)).toBeNull();
      expect(resolveAnchor(p, anchor)).toEqual({ orphan: true, anchor, missing });
    },
  );

  it('the field exists as long as the annotation exists (the empty key in the value does not delete it)', () => {
    expect(isOrphan(p, { kind: 'field', annotationId: 't1', key: 'absent' })).toBe(
      false,
    );
  });

  it('an annotation whose owner no longer exists has no host', () => {
    const broken = { ...p, markings: p.markings.filter((m) => m.id !== 'a2') };
    expect(hostOf(broken, { kind: 'annotation', id: 't1' })).toBeNull();
  });

  it('the anchor follows the item that changes parent: the host stays the same', () => {
    const moved = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'a2' ? { ...m, parentId: null } : m)),
    };
    expect(hostOf(moved, { kind: 'marking', id: 'a2' })).toEqual({
      kind: 'marking',
      id: 'a2',
    });
  });
});

describe('awaiting', () => {
  it('the last message from a person leaves the thread awaiting the agent', () => {
    expect(awaiting(sampleThread({ messages: [message('m1', T0)] }))).toBe('agent');
  });

  it('the last message from an agent leaves the thread awaiting the human', () => {
    expect(awaiting(sampleThread({ messages: [message('m1', T0, AGENT)] }))).toBe(
      'human',
    );
  });

  it('the order by instant counts, not the array order', () => {
    const t = sampleThread({
      messages: [message('m2', T2, AGENT), message('m1', T0, HUMAN)],
    });
    expect(awaiting(t)).toBe('human');
  });

  it('on an instant tie the id counts', () => {
    const t = sampleThread({
      messages: [message('b', T0, HUMAN), message('a', T0, AGENT)],
    });
    expect(awaiting(t)).toBe('agent');
  });

  it('a resolved thread awaits no one', () => {
    const t = sampleThread({
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T3 },
    });
    expect(awaiting(t)).toBeNull();
  });
});

describe('threadSubject', () => {
  const subject = (text: string, resolveLabel?: (label: string, url: string) => string) =>
    threadSubject(
      sampleThread({ messages: [message('m1', T0, HUMAN, text)] }),
      resolveLabel,
    );

  it('is the first line of the first message', () => {
    expect(subject('First line\nsecond line')).toBe('First line');
  });

  it('uses the first message in canonical order', () => {
    const t = sampleThread({
      messages: [message('m2', T1, AGENT, 'after'), message('m1', T0, HUMAN, 'before')],
    });
    expect(threadSubject(t)).toBe('before');
  });

  it('the live label of the target does not go through the markdown cleanup again (item 51)', () => {
    expect(subject('see [x](mapping://p/m/abc)', () => '__init__')).toBe(
      'see __init__',
    );
    expect(subject('**[x](mapping://p/m/abc)**', () => '_a_b\\*')).toBe('_a_b\\*');
  });

  it('skips blank lines at the start', () => {
    expect(subject('\n  \nHello')).toBe('Hello');
  });

  it('strips heading, bold, italic, code and list', () => {
    expect(subject('## Title **strong**')).toBe('Title strong');
    expect(subject('- item _emphasis_ and `code`')).toBe('item emphasis and code');
    expect(subject('1. first __bold__')).toBe('first bold');
    expect(subject('> quote *italic*')).toBe('quote italic');
  });

  it('does not touch an underscore in the middle of a word', () => {
    expect(subject('use my_var_name here')).toBe('use my_var_name here');
  });

  it('the link becomes the label, including with an escaped bracket', () => {
    expect(subject('About [Button](mapping://p/m/abc) now')).toBe('About Button now');
    expect(subject('See [a\\]b](mapping://p/m/x)')).toBe('See a]b');
  });

  it('the image becomes the alt text', () => {
    expect(subject('![logo](x.png) top')).toBe('logo top');
  });

  it('a hook can replace the link label', () => {
    expect(subject('About [Button](mapping://p/m/abc)', (_l, url) => `<${url}>`)).toBe(
      'About <mapping://p/m/abc>',
    );
  });

  it('skips the code fence and uses the next line with text', () => {
    expect(subject('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
  });

  it('cuts at 80 characters, with an ellipsis, at most 80 in total', () => {
    const long = subject('a'.repeat(200));
    expect(long).toHaveLength(SUBJECT_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(long).toBe(`${'a'.repeat(79)}…`);
  });

  it('with exactly 80 characters it does not cut', () => {
    expect(subject('b'.repeat(80))).toBe('b'.repeat(80));
  });

  it('does not cut a surrogate pair in the middle', () => {
    const s = subject('😀'.repeat(90));
    expect(Array.from(s)).toHaveLength(80);
    expect(s.endsWith('…')).toBe(true);
  });

  it('without readable text returns empty', () => {
    expect(subject('```\n```')).toBe('');
  });
});

describe('isUnread', () => {
  const me = { email: 'marina@exemplo.com' };
  const other = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };

  it('null lastReadAt: everything is later', () => {
    const t = sampleThread({ messages: [message('m1', T0, other)] });
    expect(isUnread(t, null, me)).toBe(true);
  });

  it('the own message does not count (email without spaces and lowercased)', () => {
    const mine = { ...HUMAN, email: '  Marina@Exemplo.com ' };
    const t = sampleThread({ messages: [message('m1', T0, mine)] });
    expect(isUnread(t, null, me)).toBe(false);
  });

  it('a message from another person after lastReadAt is unread', () => {
    const t = sampleThread({
      messages: [message('m1', T0, HUMAN), message('m2', T2, other)],
    });
    expect(isUnread(t, T1, me)).toBe(true);
  });

  it('an agent message after lastReadAt is unread', () => {
    const t = sampleThread({
      messages: [message('m1', T0, HUMAN), message('m2', T2, AGENT)],
    });
    expect(isUnread(t, T1, me)).toBe(true);
  });

  it('a message from another person up to lastReadAt has already been read (including an equal one)', () => {
    const t = sampleThread({
      messages: [message('m1', T0, other), message('m2', T1, AGENT)],
    });
    expect(isUnread(t, T1, me)).toBe(false);
  });

  it('after lastReadAt only my message: read', () => {
    const t = sampleThread({
      messages: [message('m1', T0, AGENT), message('m2', T2, HUMAN)],
    });
    expect(isUnread(t, T1, me)).toBe(false);
  });

  it('without an identity, every message from a person is from another person', () => {
    const t = sampleThread({ messages: [message('m1', T2, HUMAN)] });
    expect(isUnread(t, T1, null)).toBe(true);
  });
});

describe('messagePlainText (Last message column)', () => {
  it('strips the markdown markup and keeps the label of the citations', () => {
    const text =
      'Use **style** and `primary` in [Sign up](mapping://x/m/8f9464dd).\n\n- one item\n> quoted';
    expect(messagePlainText(text)).toBe(
      'Use style and primary in Sign up. one item quoted',
    );
  });

  it('a citation label with escaped asterisks comes back without slashes', () => {
    expect(messagePlainText('See [a\\*b\\*c](mapping://x/m/8f9464dd).')).toBe(
      'See a*b*c.',
    );
  });

  it('cuts at 200 characters with an ellipsis', () => {
    const out = messagePlainText('a'.repeat(300));
    expect(Array.from(out)).toHaveLength(200);
    expect(out.endsWith('…')).toBe(true);
  });

  it('empty text gives empty', () => {
    expect(messagePlainText('  \n ')).toBe('');
  });
});
