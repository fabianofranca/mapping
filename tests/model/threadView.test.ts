import { describe, expect, it } from 'vitest';
import {
  awaiting,
  hostKey,
  hostOf,
  isOrphan,
  isUnread,
  resolveAnchor,
  threadSubject,
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
    ['annotation de marcação', { kind: 'annotation', id: 'n1' }, 'marking:a1'],
    ['annotation de seta', { kind: 'annotation', id: 'ra1' }, 'arrow:r1'],
    ['field', { kind: 'field', annotationId: 't1', key: 'variante' }, 'marking:a2'],
    ['entry', { kind: 'entry', annotationId: 'n1', entryId: 'e1' }, 'marking:a1'],
    ['row', { kind: 'row', annotationId: 't1', key: 'tabela', rowId: 'w1' }, 'marking:a2'],
    ['layer', { kind: 'layer', id: 'L1' }, null],
    [
      'point no container',
      { kind: 'point', containerId: 'A', x: 10, y: 20 },
      'point:A:10:20',
    ],
    ['point no canvas', { kind: 'point', containerId: null, x: 1.5, y: -2 }, 'point::1.5:-2'],
  ];

  it.each(cases)('%s: não é órfã e o hospedeiro é %s', (_name, anchor, key) => {
    expect(isOrphan(p, anchor)).toBe(false);
    const host = hostOf(p, anchor);
    expect(host === null ? null : hostKey(host)).toBe(key);
  });

  it('o ponto é o próprio hospedeiro', () => {
    expect(hostOf(p, { kind: 'point', containerId: 'A', x: 10, y: 20 })).toEqual({
      kind: 'point',
      containerId: 'A',
      x: 10,
      y: 20,
    });
  });

  it('a camada resolve, sem hospedeiro (sem pino)', () => {
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
    ['field sem anotação', { kind: 'field', annotationId: 'zz', key: 'k' }, 'annotation'],
    ['entry sem anotação', { kind: 'entry', annotationId: 'zz', entryId: 'e1' }, 'annotation'],
    ['entry sem o par', { kind: 'entry', annotationId: 'n1', entryId: 'zz' }, 'entry'],
    ['row sem anotação', { kind: 'row', annotationId: 'zz', key: 'tabela', rowId: 'w1' }, 'annotation'],
    ['row sem a linha', { kind: 'row', annotationId: 't1', key: 'tabela', rowId: 'zz' }, 'row'],
    ['row sem a tabela', { kind: 'row', annotationId: 't1', key: 'zz', rowId: 'w1' }, 'row'],
    ['row em anotação livre', { kind: 'row', annotationId: 'n1', key: 'tabela', rowId: 'w1' }, 'row'],
    ['point com container apagado', { kind: 'point', containerId: 'zz', x: 0, y: 0 }, 'container'],
  ];

  it.each(orphans)('%s: órfã, com o tipo do alvo apagado (%s)', (_name, anchor, missing) => {
    expect(isOrphan(p, anchor)).toBe(true);
    expect(hostOf(p, anchor)).toBeNull();
    expect(resolveAnchor(p, anchor)).toEqual({ orphan: true, anchor, missing });
  });

  it('o campo existe enquanto a anotação existe (a chave vazia no valor não o apaga)', () => {
    expect(isOrphan(p, { kind: 'field', annotationId: 't1', key: 'ausente' })).toBe(false);
  });

  it('uma anotação cuja dona não existe mais não tem hospedeiro', () => {
    const broken = { ...p, markings: p.markings.filter((m) => m.id !== 'a2') };
    expect(hostOf(broken, { kind: 'annotation', id: 't1' })).toBeNull();
  });

  it('a âncora acompanha o item que troca de pai: o hospedeiro continua o mesmo', () => {
    const moved = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'a2' ? { ...m, parentId: null } : m)),
    };
    expect(hostOf(moved, { kind: 'marking', id: 'a2' })).toEqual({ kind: 'marking', id: 'a2' });
  });
});

describe('awaiting', () => {
  it('a última mensagem de pessoa deixa a conversa aguardando o agente', () => {
    expect(awaiting(sampleThread({ messages: [message('m1', T0)] }))).toBe('agent');
  });

  it('a última mensagem de agente deixa a conversa aguardando o humano', () => {
    expect(awaiting(sampleThread({ messages: [message('m1', T0, AGENT)] }))).toBe('human');
  });

  it('vale a ordem por instante, não a do array', () => {
    const t = sampleThread({
      messages: [message('m2', T2, AGENT), message('m1', T0, HUMAN)],
    });
    expect(awaiting(t)).toBe('human');
  });

  it('no empate de instante vale o id', () => {
    const t = sampleThread({
      messages: [message('b', T0, HUMAN), message('a', T0, AGENT)],
    });
    expect(awaiting(t)).toBe('agent');
  });

  it('resolvida não aguarda ninguém', () => {
    const t = sampleThread({
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T3 },
    });
    expect(awaiting(t)).toBeNull();
  });
});

describe('threadSubject', () => {
  const subject = (text: string, resolveLabel?: (label: string, url: string) => string) =>
    threadSubject(sampleThread({ messages: [message('m1', T0, HUMAN, text)] }), resolveLabel);

  it('é a primeira linha da primeira mensagem', () => {
    expect(subject('Primeira linha\nsegunda linha')).toBe('Primeira linha');
  });

  it('usa a primeira mensagem na ordem canônica', () => {
    const t = sampleThread({
      messages: [message('m2', T1, AGENT, 'depois'), message('m1', T0, HUMAN, 'antes')],
    });
    expect(threadSubject(t)).toBe('antes');
  });

  it('pula linhas em branco no começo', () => {
    expect(subject('\n  \nOlá')).toBe('Olá');
  });

  it('tira título, negrito, itálico, código e lista', () => {
    expect(subject('## Título **forte**')).toBe('Título forte');
    expect(subject('- item _ênfase_ e `código`')).toBe('item ênfase e código');
    expect(subject('1. primeiro __negrito__')).toBe('primeiro negrito');
    expect(subject('> citação *itálico*')).toBe('citação itálico');
  });

  it('não mexe em sublinhado no meio da palavra', () => {
    expect(subject('use my_var_name aqui')).toBe('use my_var_name aqui');
  });

  it('o link vira o rótulo, inclusive com colchete escapado', () => {
    expect(subject('Sobre [Botão](mapping://p/m/abc) agora')).toBe('Sobre Botão agora');
    expect(subject('Veja [a\\]b](mapping://p/m/x)')).toBe('Veja a]b');
  });

  it('a imagem vira o texto alternativo', () => {
    expect(subject('![logo](x.png) topo')).toBe('logo topo');
  });

  it('um gancho pode trocar o rótulo do link', () => {
    expect(subject('Sobre [Botão](mapping://p/m/abc)', (_l, url) => `<${url}>`)).toBe(
      'Sobre <mapping://p/m/abc>',
    );
  });

  it('pula a cerca de código e usa a próxima linha com texto', () => {
    expect(subject('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
  });

  it('corta em 80 caracteres, com reticências, no máximo 80 no total', () => {
    const long = subject('a'.repeat(200));
    expect(long).toHaveLength(SUBJECT_MAX);
    expect(long.endsWith('…')).toBe(true);
    expect(long).toBe(`${'a'.repeat(79)}…`);
  });

  it('com exatamente 80 caracteres não corta', () => {
    expect(subject('b'.repeat(80))).toBe('b'.repeat(80));
  });

  it('não corta um par substituto no meio', () => {
    const s = subject('😀'.repeat(90));
    expect(Array.from(s)).toHaveLength(80);
    expect(s.endsWith('…')).toBe(true);
  });

  it('sem texto legível devolve vazio', () => {
    expect(subject('```\n```')).toBe('');
  });
});

describe('isUnread', () => {
  const me = { email: 'marina@exemplo.com' };
  const other = { ...HUMAN, name: 'João', email: 'joao@exemplo.com' };

  it('lastReadAt nulo: tudo é posterior', () => {
    const t = sampleThread({ messages: [message('m1', T0, other)] });
    expect(isUnread(t, null, me)).toBe(true);
  });

  it('a própria mensagem não conta (e-mail sem espaços e em minúsculas)', () => {
    const mine = { ...HUMAN, email: '  Marina@Exemplo.com ' };
    const t = sampleThread({ messages: [message('m1', T0, mine)] });
    expect(isUnread(t, null, me)).toBe(false);
  });

  it('mensagem de outra pessoa depois do lastReadAt é não lida', () => {
    const t = sampleThread({ messages: [message('m1', T0, HUMAN), message('m2', T2, other)] });
    expect(isUnread(t, T1, me)).toBe(true);
  });

  it('mensagem de agente depois do lastReadAt é não lida', () => {
    const t = sampleThread({ messages: [message('m1', T0, HUMAN), message('m2', T2, AGENT)] });
    expect(isUnread(t, T1, me)).toBe(true);
  });

  it('mensagem de outra pessoa até o lastReadAt já foi lida (inclusive o igual)', () => {
    const t = sampleThread({ messages: [message('m1', T0, other), message('m2', T1, AGENT)] });
    expect(isUnread(t, T1, me)).toBe(false);
  });

  it('depois do lastReadAt só a minha mensagem: lida', () => {
    const t = sampleThread({ messages: [message('m1', T0, AGENT), message('m2', T2, HUMAN)] });
    expect(isUnread(t, T1, me)).toBe(false);
  });

  it('sem identidade, toda mensagem de pessoa é de outra pessoa', () => {
    const t = sampleThread({ messages: [message('m1', T2, HUMAN)] });
    expect(isUnread(t, T1, null)).toBe(true);
  });
});
