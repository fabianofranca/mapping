import { describe, expect, it } from 'vitest';
import {
  COMMENTS_DIR,
  RESOLVED_DIR,
  THREAD_FORMAT,
  THREAD_FORMAT_VERSION,
  THREAD_ID_RE,
  THREAD_MESSAGE_MAX,
  parseThread,
  parseThreadText,
  serializeThread,
  threadFilePath,
  type Thread,
} from '../../src/model';
import { ANCHORS, AGENT, T0, T1, T2, rawThread, sampleThread } from './threadFixtures';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function errorsOf(data: unknown): readonly string[] {
  const result = parseThread(data);
  if (result.ok) throw new Error('esperava recusa');
  return result.errors;
}

function parsedOf(data: unknown): Thread {
  const result = parseThread(data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.thread;
}

describe('constantes e caminhos', () => {
  it('expõe o formato, a versão e as pastas', () => {
    expect(THREAD_FORMAT).toBe('mapping-thread');
    expect(THREAD_FORMAT_VERSION).toBe(1);
    expect(COMMENTS_DIR).toBe('comments');
    expect(RESOLVED_DIR).toBe('comments/resolved');
    expect(THREAD_MESSAGE_MAX).toBe(10000);
  });

  it('threadFilePath escolhe a pasta pelo estado', () => {
    expect(threadFilePath('c1', false)).toBe('comments/c1.json');
    expect(threadFilePath('c1', true)).toBe('comments/resolved/c1.json');
  });

  it('THREAD_ID_RE segue a regra do id de proposta', () => {
    for (const ok of ['c1', 'A.b_c-d', '0abc', 'f47ac10b-58cc-4372-a567-0e02b2c3d479']) {
      expect(THREAD_ID_RE.test(ok)).toBe(true);
    }
    for (const bad of ['', '.hidden', 'a/b', 'a b', '-x', '..', 'a\\b']) {
      expect(THREAD_ID_RE.test(bad)).toBe(false);
    }
  });
});

describe('leitura', () => {
  it('lê a conversa de exemplo sem avisos', () => {
    const result = parseThread(rawThread());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(result.thread).toEqual(sampleThread());
    }
  });

  it('recusa JSON inválido no texto', () => {
    const result = parseThreadText('{ nao é json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^invalid JSON/);
  });

  it('recusa formato e versão diferentes', () => {
    expect(errorsOf({ ...rawThread(), format: 'outro' })[0]).toMatch(/^format: /);
    expect(errorsOf({ ...rawThread(), formatVersion: 2 })[0]).toMatch(/^formatVersion: /);
  });

  it.each(['id', 'anchor', 'createdAt', 'revision', 'resolved', 'messages'])(
    'campo obrigatório da raiz: %s',
    (field) => {
      const raw = rawThread();
      delete raw[field];
      expect(errorsOf(raw).some((e) => e.startsWith(`${field}: `))).toBe(true);
    },
  );

  it.each(['id', 'author', 'at', 'text', 'proposal'])(
    'campo obrigatório da mensagem: %s',
    (field) => {
      const raw = rawThread();
      delete raw.messages[1][field];
      expect(errorsOf(raw).some((e) => e.startsWith(`messages[1].${field}: `))).toBe(
        true,
      );
    },
  );

  it.each(['kind', 'name', 'email'])('campo obrigatório do autor: %s', (field) => {
    const raw = rawThread();
    delete raw.messages[2].author[field];
    expect(errorsOf(raw).some((e) => e.startsWith(`messages[2].author.${field}: `))).toBe(
      true,
    );
  });

  it.each(['', '.oculto', 'a/b', 'a b'])('recusa o id %j', (bad) => {
    expect(errorsOf({ ...rawThread(), id: bad })[0]).toMatch(/^id: /);
  });

  it('o texto é obrigatório, não só espaços e vai até 10.000 caracteres', () => {
    const at = (text: string) => {
      const raw = rawThread();
      raw.messages[0].text = text;
      return raw;
    };
    expect(errorsOf(at(''))[0]).toMatch(/^messages\[0\]\.text: /);
    expect(errorsOf(at('  \n\t '))[0]).toMatch(/^messages\[0\]\.text: /);
    expect(parseThread(at('x'.repeat(10000))).ok).toBe(true);
    expect(errorsOf(at('x'.repeat(10001)))[0]).toMatch(/^messages\[0\]\.text: /);
  });

  it('recusa author.kind inválido', () => {
    const raw = rawThread();
    raw.messages[1].author.kind = 'robot';
    expect(errorsOf(raw)[0]).toMatch(/^messages\[1\]\.author\.kind: /);
  });

  it('o e-mail é obrigatório na pessoa e null no agente', () => {
    const noEmail = rawThread();
    noEmail.messages[2].author.email = null;
    expect(errorsOf(noEmail)).toEqual([
      expect.stringMatching(/^messages\[2\]\.author\.email: /),
    ]);

    const emptyEmail = rawThread();
    emptyEmail.messages[2].author.email = '';
    expect(errorsOf(emptyEmail)[0]).toMatch(/^messages\[2\]\.author\.email: /);

    const agentWithEmail = rawThread();
    agentWithEmail.messages[1].author.email = 'agente@exemplo.com';
    expect(errorsOf(agentWithEmail)[0]).toMatch(/^messages\[1\]\.author\.email: /);
  });

  it('o nome do autor não pode ser vazio', () => {
    const raw = rawThread();
    raw.messages[0].author.name = '';
    expect(errorsOf(raw)[0]).toMatch(/^messages\[0\]\.author\.name: /);
  });

  it('recusa conversa sem mensagem', () => {
    expect(errorsOf({ ...rawThread(), messages: [] })[0]).toMatch(/^messages: /);
  });

  it('recusa ids de mensagem repetidos, com o caminho da segunda', () => {
    const raw = rawThread();
    raw.messages[2].id = 'm1';
    expect(errorsOf(raw)).toEqual(['messages[2].id: duplicate id "m1"']);
  });

  it('revision é inteiro >= 0', () => {
    expect(errorsOf({ ...rawThread(), revision: -1 })[0]).toMatch(/^revision: /);
    expect(errorsOf({ ...rawThread(), revision: 1.5 })[0]).toMatch(/^revision: /);
    expect(parseThread({ ...rawThread(), revision: 0 }).ok).toBe(true);
  });

  it('proposal é string ou null', () => {
    const raw = rawThread();
    raw.messages[1].proposal = 'P1';
    expect(parsedOf(raw).messages[1]?.proposal).toBe('P1');
    raw.messages[1].proposal = 7;
    expect(errorsOf(raw)[0]).toMatch(/^messages\[1\]\.proposal: /);
  });

  it('datas ISO inválidas são recusadas com o caminho; as com fuso saem em UTC', () => {
    const raw = rawThread();
    raw.createdAt = 'ontem';
    raw.messages[0].at = '06/11/2026';
    expect([...errorsOf(raw)].sort()).toEqual([
      expect.stringMatching(/^createdAt: /),
      expect.stringMatching(/^messages\[0\]\.at: /),
    ]);
    const offset = rawThread();
    offset.createdAt = '2026-11-06T07:00:00-03:00';
    expect(parsedOf(offset).createdAt).toBe(T0);
  });

  it('resolved: {by:{name,email}, at} ou null', () => {
    const raw = rawThread();
    raw.resolved = {
      by: { name: 'Marina Alves', email: 'marina@exemplo.com' },
      at: T3(),
    };
    expect(parsedOf(raw).resolved).toEqual({
      by: { name: 'Marina Alves', email: 'marina@exemplo.com' },
      at: T3(),
    });
    raw.resolved = { by: { name: 'Marina Alves', email: '' }, at: T3() };
    expect(errorsOf(raw)[0]).toMatch(/^resolved\.by\.email: /);
    raw.resolved = { by: { name: 'Marina Alves', email: 'm@x.com' } };
    expect(errorsOf(raw)[0]).toMatch(/^resolved\.at: /);
  });
});

function T3(): string {
  return '2026-11-06T13:00:00.000Z';
}

describe('âncoras', () => {
  it.each(ANCHORS.map((a, i) => [i, a] as const))(
    'forma %i lida e regravada idêntica (round-trip)',
    (_i, anchor) => {
      const thread = sampleThread({ anchor });
      const text = serializeThread(thread);
      const back = parseThreadText(text);
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      expect(back.thread).toEqual(thread);
      expect(serializeThread(back.thread)).toBe(text);
    },
  );

  it('recusa kind desconhecido, campo faltando e ponto sem coordenada válida', () => {
    const bad = (anchor: unknown) => errorsOf({ ...rawThread(), anchor });
    expect(bad({ kind: 'zebra', id: 'x' })[0]).toMatch(/^anchor/);
    expect(bad({ kind: 'marking' })[0]).toMatch(/^anchor\.id: /);
    expect(bad({ kind: 'field', annotationId: 'A1' })[0]).toMatch(/^anchor\.key: /);
    expect(bad({ kind: 'entry', annotationId: 'A1' })[0]).toMatch(/^anchor\.entryId: /);
    expect(bad({ kind: 'row', annotationId: 'A1', key: 'k' })[0]).toMatch(
      /^anchor\.rowId: /,
    );
    expect(bad({ kind: 'point', containerId: null, x: 'a', y: 1 })[0]).toMatch(
      /^anchor\.x: /,
    );
    expect(bad({ kind: 'point', containerId: null, x: 1, y: Infinity })[0]).toMatch(
      /^anchor\.y: /,
    );
    expect(bad({ kind: 'point', x: 1, y: 1 })[0]).toMatch(/^anchor\.containerId: /);
  });
});

describe('ordenação e serialização', () => {
  it('a leitura ordena as mensagens por at e, no empate, por id', () => {
    const raw = rawThread();
    raw.messages = [
      { ...raw.messages[2], id: 'b', at: T2 },
      { ...raw.messages[0], id: 'z', at: T0 },
      { ...raw.messages[1], id: 'a', at: T2 },
      { ...raw.messages[0], id: 'c', at: '2026-11-06T07:30:00-03:00' }, // = T0 + 30 min
    ];
    expect(parsedOf(raw).messages.map((m) => m.id)).toEqual(['z', 'c', 'a', 'b']);
  });

  it('compara pelo instante, não pelo texto da data', () => {
    const raw = rawThread();
    raw.messages = [
      { ...raw.messages[0], id: 'tarde', at: '2026-11-06T10:00:01Z' },
      { ...raw.messages[0], id: 'cedo', at: '2026-11-06T10:00:00.500Z' },
    ];
    expect(parsedOf(raw).messages.map((m) => m.id)).toEqual(['cedo', 'tarde']);
  });

  it('serializa com chaves em ordem fixa, indent 2 e newline final', () => {
    const text = serializeThread(sampleThread());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.startsWith('{\n  "format": "mapping-thread",\n')).toBe(true);
    const json = JSON.parse(text) as Json;
    expect(Object.keys(json)).toEqual([
      'format',
      'formatVersion',
      'id',
      'anchor',
      'createdAt',
      'revision',
      'resolved',
      'messages',
    ]);
    expect(Object.keys(json.messages[0])).toEqual([
      'id',
      'author',
      'at',
      'text',
      'proposal',
    ]);
    expect(Object.keys(json.messages[0].author)).toEqual(['kind', 'name', 'email']);
    expect(text).toBe(JSON.stringify(json, null, 2) + '\n');
  });

  it('grava as mensagens na ordem canônica e a ordem das chaves da âncora', () => {
    const thread = sampleThread({
      anchor: { kind: 'row', annotationId: 'A1', key: 'k', rowId: 'W1' },
      messages: [
        {
          id: 'm2',
          author: AGENT,
          at: T1,
          text: 'b',
          proposal: null,
        },
        {
          id: 'm1',
          author: { kind: 'human', name: 'Ana', email: 'ana@exemplo.com' },
          at: T0,
          text: 'a',
          proposal: null,
        },
      ],
    });
    const json = JSON.parse(serializeThread(thread)) as Json;
    expect(json.messages.map((m: Json) => m.id)).toEqual(['m1', 'm2']);
    expect(Object.keys(json.anchor)).toEqual(['kind', 'annotationId', 'key', 'rowId']);
  });

  it('a conversa resolvida faz round-trip', () => {
    const thread = sampleThread({
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T3() },
    });
    const back = parseThreadText(serializeThread(thread));
    expect(back.ok && back.thread).toEqual(thread);
  });
});
