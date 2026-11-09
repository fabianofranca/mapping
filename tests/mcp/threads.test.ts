import {
  existsSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { threadFilePath } from '../../src/model';
import {
  HUMAN,
  commentFiles,
  humanReplies,
  humanResolves,
  readThread,
  resolvedFiles,
  seedThread,
  sha,
} from './threadSupport';
import { errorOf, ok } from './proposalSupport';
import { codeOf, createWorkspace, connect } from './workspace';
import type { Connection, Workspace } from './workspace';

// Conversas pelo dist-mcp/mapping-mcp.js, por stdio (etapa Comentários, CM6): a caixa de
// entrada, a leitura, abrir, responder com a guarda `after`, a autoria e o que o servidor nunca
// faz (resolver, gravar em `comments/resolved/`, alterar o `mapping.json`).

let ws: Workspace;
let mcp: Connection;
let hooks: string;
let hooked: Connection;
const dir = () => ws.projectDir('apps/cadastro');
const mapping = () => join(dir(), 'mapping.json');
const ref = (letter: string, id: string) => `mapping://cadastro/${letter}/${codeOf(id)}`;
const threadRef = (id: string) => ref('c', id);

interface Cite {
  kind: string;
  ref: string | null;
  path: string | null;
  label: string | null;
  value?: unknown;
  broken: boolean;
}
interface Row {
  ref: string;
  anchor: unknown;
  kind: string;
  path: string | null;
  orphan: boolean;
  status: string;
  awaiting: string | null;
  messages: number;
  last: {
    id: string;
    author: { kind: string; name: string; email: string | null };
    at: string;
    text: string;
    cites: Cite[];
  };
}
interface Listed {
  total: number;
  offset: number;
  threads: Row[];
  broken?: { id: string; error: string }[];
}
interface Got {
  ref: string;
  id: string;
  status: string;
  awaiting: string | null;
  revision: number;
  anchor: {
    ref?: string;
    point?: { container: string | null; x: number; y: number };
    kind: string;
    path: string | null;
    name?: string | null;
    value?: unknown;
    orphan: boolean;
  };
  messages: {
    id: string;
    author: { kind: string; name: string; email: string | null };
    text: string;
    proposal: string | null;
    cites: Cite[];
  }[];
  citedIn: { ref: string }[];
  proposals: { ref: string; title: string; status: string }[];
}

beforeAll(async () => {
  ws = createWorkspace();
  hooks = join(ws.base, 'hooks.json');
  mcp = await connect([ws.root]);
  hooked = await connect([ws.root], { fsHooks: hooks });
});

afterAll(async () => {
  await mcp?.close();
  await hooked?.close();
});

const id = (name: string): string => ws.ids[name] as string;

describe('list_threads', () => {
  it('o padrão são as abertas que aguardam o agente', async () => {
    const a = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Qual a **variante**?' }],
    });
    const b = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [
        { by: 'human', text: 'Pergunta' },
        { by: 'agent', text: 'Resposta' },
      ],
    });
    const c = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Já resolvida' }],
      resolved: true,
    });
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const refs = listed.threads.map((t) => t.ref);
    expect(refs).toContain(threadRef(a.id));
    expect(refs).not.toContain(threadRef(b.id));
    expect(refs).not.toContain(threadRef(c.id));
    const row = listed.threads.find((t) => t.ref === threadRef(a.id))!;
    expect(row).toMatchObject({
      anchor: ref('m', id('MF')),
      kind: 'marking',
      orphan: false,
      status: 'open',
      awaiting: 'agent',
      messages: 1,
    });
    expect(row.path).toContain('Formulário');
    expect(row.last).toMatchObject({ text: 'Qual a **variante**?', cites: [] });
    expect(row.last.author).toEqual({
      kind: 'human',
      name: HUMAN.name,
      email: HUMAN.email,
    });
  });

  it('filtros: status, awaiting, anchor e text; sem filtro de awaiting com status dado traz todas', async () => {
    const resolved = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', status: 'resolved' }),
    );
    expect(resolved.threads.every((t) => t.status === 'resolved')).toBe(true);
    expect(resolved.threads.length).toBeGreaterThan(0);

    const human = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', awaiting: 'human' }),
    );
    expect(human.threads.length).toBeGreaterThan(0);
    expect(human.threads.every((t) => t.awaiting === 'human')).toBe(true);

    const all = ok(
      await mcp.call<Listed>('list_threads', { project: 'cadastro', status: 'all' }),
    );
    expect(all.threads.map((t) => t.status)).toContain('resolved');

    const anchored = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        anchor: ref('m', id('MN')),
      }),
    );
    expect(anchored.threads.map((t) => t.anchor)).toEqual([ref('m', id('MN'))]);

    const text = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        text: 'VARIANTE',
      }),
    );
    expect(text.threads).toHaveLength(1);
    expect(text.threads[0]!.last.text).toContain('variante');
  });

  it('pagina com limit e offset e informa o total', async () => {
    const page1 = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        limit: 1,
      }),
    );
    expect(page1.threads).toHaveLength(1);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    const page2 = ok(
      await mcp.call<Listed>('list_threads', {
        project: 'cadastro',
        status: 'all',
        limit: 1,
        offset: 1,
      }),
    );
    expect(page2.threads).toHaveLength(1);
    expect(page2.threads[0]!.ref).not.toBe(page1.threads[0]!.ref);
    expect(page2.offset).toBe(1);
  });

  it('a órfã continua listada, sem referência de âncora', async () => {
    const orphan = seedThread(dir(), {
      anchor: { kind: 'marking', id: 'e0e0e0e0-0000-4000-8000-000000000000' },
      messages: [{ by: 'human', text: 'Item que sumiu' }],
    });
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const row = listed.threads.find((t) => t.ref === threadRef(orphan.id))!;
    expect(row.orphan).toBe(true);
    expect(row.anchor).toMatchObject({ kind: 'marking' });
  });

  it('um arquivo ilegível vai para broken, sem derrubar a lista', async () => {
    writeFileSync(join(dir(), 'comments', 'quebrada.json'), '{ não é JSON');
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    expect(listed.broken?.map((b) => b.id)).toContain('quebrada');
    rmSync(join(dir(), 'comments', 'quebrada.json'));
  });

  it('um arquivo grande demais vai para broken, sem derrubar a lista', async () => {
    const big = join(dir(), 'comments', 'grande.json');
    writeFileSync(big, '');
    truncateSync(big, 17 * 1024 * 1024);
    const listed = ok(await mcp.call<Listed>('list_threads', { project: 'cadastro' }));
    const row = listed.broken?.find((b) => b.id === 'grande');
    expect(row?.error).toContain('file-too-large');
    expect(listed.threads.length).toBeGreaterThan(0);
    rmSync(big);
  });

  it('as cópias da mesma conversa em duas pastas são juntadas', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('ME') },
      messages: [
        { by: 'human', text: 'Cópia aberta' },
        { by: 'agent', text: 'Resposta' },
      ],
    });
    // Uma cópia antiga, resolvida sem a resposta, esquecida em resolved/.
    const stale = { ...t, messages: [t.messages[0]!], resolved: null };
    const resolved = join(dir(), threadFilePath(t.id, true));
    writeFileSync(resolved, `${JSON.stringify(stale, null, 2)}\n`);
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.messages.map((m) => m.text)).toEqual(['Cópia aberta', 'Resposta']);
    rmSync(resolved);
  });
});

describe('get_thread', () => {
  it('traz a âncora resolvida (campo com o valor), as citações e o citedIn', async () => {
    const target = seedThread(dir(), {
      anchor: { kind: 'field', annotationId: id('AC'), key: 'nome' },
      messages: [{ by: 'human', text: 'O nome da classe está certo?' }],
    });
    const cites = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MC') },
      messages: [
        {
          by: 'human',
          text: `Veja [o nome](${ref('a', id('AC'))}/f/nome), [a conversa](${threadRef(target.id)}) e [sumiu](${ref('m', 'f0f0f0f0-0000-4000-8000-000000000000')}).`,
        },
      ],
    });
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(cites.id) }));
    expect(got.anchor).toMatchObject({ ref: ref('m', id('MC')), kind: 'marking' });
    expect(got.status).toBe('open');
    expect(got.awaiting).toBe('agent');
    const [field, thread, gone] = got.messages[0]!.cites;
    expect(field).toMatchObject({
      kind: 'field',
      ref: `${ref('a', id('AC'))}/f/nome`,
      value: 'Contato',
      broken: false,
    });
    expect(thread).toMatchObject({
      kind: 'thread',
      ref: threadRef(target.id),
      broken: false,
    });
    expect(gone).toMatchObject({ broken: true, label: 'sumiu' });

    const cited = ok(await mcp.call<Got>('get_thread', { ref: threadRef(target.id) }));
    expect(cited.anchor).toMatchObject({
      ref: `${ref('a', id('AC'))}/f/nome`,
      kind: 'field',
      name: expect.any(String),
      value: 'Contato',
    });
    expect(cited.citedIn.map((c) => c.ref)).toEqual([threadRef(cites.id)]);
  });

  it('traz as propostas ligadas à conversa, com o estado', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MT') },
      messages: [{ by: 'human', text: 'Troca o título?' }],
    });
    const proposed = ok(
      await mcp.call<{ proposal: { ref: string; id: string } }>('propose_changes', {
        project: 'cadastro',
        title: 'Troca o título',
        thread: threadRef(t.id),
        operations: [
          { op: 'update_marking', marking: ref('m', id('MT')), name: 'Cabeçalho' },
        ],
      }),
    );
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.proposals).toEqual([
      expect.objectContaining({
        ref: proposed.proposal.ref,
        title: 'Troca o título',
        status: 'open',
      }),
    ]);
    expect(got.messages.at(-1)!.proposal).toBe(proposed.proposal.ref);
  });

  it('thread-not-found e referência inválida', async () => {
    const missing = await mcp.call('get_thread', {
      ref: 'mapping://cadastro/c/deadbeef',
    });
    expect(errorOf(missing).code).toBe('thread-not-found');
    const bad = await mcp.call('get_thread', { ref: 'mapping://cadastro/c/abc/extra' });
    expect(errorOf(bad).code).toBe('invalid-ref');
  });
});

describe('open_thread', () => {
  const open = (anchor: unknown, text = 'Qual é a variante?') =>
    mcp.call<{ ref: string; id: string; anchor: unknown; warnings?: { code: string }[] }>(
      'open_thread',
      { project: 'cadastro', anchor, text },
    );

  it.each([
    ['marcação', () => ref('m', id('MF')), { kind: 'marking', id: () => id('MF') }],
    ['container', () => ref('i', id('I1')), { kind: 'container', id: () => id('I1') }],
    ['anotação', () => ref('a', id('AU')), { kind: 'annotation', id: () => id('AU') }],
    ['camada', () => ref('l', id('LM')), { kind: 'layer', id: () => id('LM') }],
  ])('âncora em %s', async (_name, anchor, expected) => {
    const result = ok(await open(anchor()));
    const stored = readThread(dir(), result.id);
    expect(stored.anchor).toEqual({ kind: expected.kind, id: expected.id() });
    expect(stored.messages).toHaveLength(1);
    expect(result.ref).toBe(threadRef(result.id));
  });

  it('âncora em campo, par e linha', async () => {
    const field = ok(await open(`${ref('a', id('AC'))}/f/nome`));
    expect(readThread(dir(), field.id).anchor).toEqual({
      kind: 'field',
      annotationId: id('AC'),
      key: 'nome',
    });
    const entry = ok(await open(`${ref('a', id('AU'))}/e/${codeOf(id('EN'))}`));
    expect(readThread(dir(), entry.id).anchor).toEqual({
      kind: 'entry',
      annotationId: id('AU'),
      entryId: id('EN'),
    });
    const row = ok(await open(`${ref('a', id('AC'))}/f/atributos/r/${codeOf(id('R1'))}`));
    expect(readThread(dir(), row.id).anchor).toEqual({
      kind: 'row',
      annotationId: id('AC'),
      key: 'atributos',
      rowId: id('R1'),
    });
  });

  it('ponto solto, no container e no canvas', async () => {
    const inside = ok(
      await open({ point: { container: ref('i', id('I1')), x: 120, y: 340 } }),
    );
    expect(readThread(dir(), inside.id).anchor).toEqual({
      kind: 'point',
      containerId: id('I1'),
      x: 120,
      y: 340,
    });
    const canvas = ok(await open({ point: { container: null, x: -10, y: 5 } }));
    expect(readThread(dir(), canvas.id).anchor).toEqual({
      kind: 'point',
      containerId: null,
      x: -10,
      y: 5,
    });
  });

  it('a primeira mensagem é do agente: kind agent, e-mail nulo, nome do cliente', async () => {
    const result = ok(await open(ref('m', id('MF')), 'Dúvida do agente'));
    const stored = readThread(dir(), result.id);
    expect(stored.messages[0]!.author).toEqual({
      kind: 'agent',
      name: 'teste',
      email: null,
    });
    expect(stored.resolved).toBeNull();
    expect(stored.revision).toBe(0);
    const named = ok(
      await mcp.call<{ id: string }>('open_thread', {
        project: 'cadastro',
        anchor: ref('m', id('MF')),
        text: 'Com nome',
        author: 'Revisor IA',
      }),
    );
    expect(readThread(dir(), named.id).messages[0]!.author.name).toBe('Revisor IA');
  });

  it('invalid-anchor e anchor-not-found; nada é gravado', async () => {
    const before = commentFiles(dir());
    for (const bad of [
      'texto qualquer',
      ref('p', 'abcdef01-0000-4000-8000-000000000000'),
      { point: { container: null, x: 'a', y: 1 } },
      { point: { container: ref('m', id('MF')), x: 1, y: 1 } },
      `${ref('a', id('AC'))}/f/nome/extra`,
    ]) {
      expect(errorOf(await open(bad)).code, JSON.stringify(bad)).toBe('invalid-anchor');
    }
    for (const missing of [
      ref('m', 'abcdef12-0000-4000-8000-000000000000'),
      `${ref('a', id('AC'))}/f/campoQueNaoExiste`,
      `${ref('a', id('AU'))}/e/00000000`,
      {
        point: {
          container: ref('i', 'abcdef12-0000-4000-8000-000000000000'),
          x: 1,
          y: 1,
        },
      },
    ]) {
      expect(errorOf(await open(missing)).code, JSON.stringify(missing)).toBe(
        'anchor-not-found',
      );
    }
    expect(commentFiles(dir())).toEqual(before);
  });

  it('empty-message e message-too-long', async () => {
    expect(errorOf(await open(ref('m', id('MF')), '   ')).code).toBe('empty-message');
    expect(errorOf(await open(ref('m', id('MF')), 'x'.repeat(10001))).code).toBe(
      'message-too-long',
    );
  });

  it('citação que não resolve é gravada assim mesmo, com aviso broken-cite', async () => {
    const result = ok(
      await open(
        ref('m', id('MF')),
        `Veja [o que sumiu](${ref('m', 'abcdef12-0000-4000-8000-000000000000')}).`,
      ),
    );
    expect(result.warnings?.map((w) => w.code)).toEqual(['broken-cite']);
    expect(readThread(dir(), result.id).messages[0]!.text).toContain('o que sumiu');
  });

  it('nunca sobrescreve: o arquivo novo falha se o id já existe', async () => {
    const result = ok(await open(ref('m', id('MF'))));
    const before = readFileSync(join(dir(), threadFilePath(result.id, false)), 'utf8');
    // Um segundo open_thread gera outro id e não toca no primeiro arquivo.
    ok(await open(ref('m', id('MF'))));
    expect(readFileSync(join(dir(), threadFilePath(result.id, false)), 'utf8')).toBe(
      before,
    );
  });
});

describe('post_message', () => {
  const post = (args: Record<string, unknown>) =>
    mcp.call<Record<string, unknown>>('post_message', args);
  const lastId = (id: string) => readThread(dir(), id).messages.at(-1)!.id;

  it('responde com a guarda after e grava revision + 1', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Qual a variante?' }],
    });
    const result = ok(
      await post({ ref: threadRef(t.id), text: 'A **primary**.', after: lastId(t.id) }),
    );
    expect(result).toMatchObject({ ref: threadRef(t.id), awaiting: 'human' });
    const stored = readThread(dir(), t.id);
    expect(stored.revision).toBe(t.revision + 1);
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[1]).toMatchObject({
      text: 'A **primary**.',
      proposal: null,
      author: { kind: 'agent', name: 'teste', email: null },
    });
    expect(commentFiles(dir())).toContain(`${t.id}.json`);
    expect(resolvedFiles(dir())).not.toContain(`${t.id}.json`);
  });

  it('stale-thread: não grava e devolve as mensagens novas', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Primeira' }],
    });
    const seen = lastId(t.id);
    humanReplies(dir(), t.id, 'Segunda, depois de você ler', 30);
    const path = join(dir(), threadFilePath(t.id, false));
    const before = sha(path);
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Resposta', after: seen }),
    );
    expect(failure.code).toBe('stale-thread');
    expect(failure.newMessages).toEqual([
      expect.objectContaining({ text: 'Segunda, depois de você ler' }),
    ]);
    expect(sha(path)).toBe(before);
  });

  it('after desconhecido também é stale-thread, com todas as mensagens', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MN') },
      messages: [{ by: 'human', text: 'Única' }],
    });
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Oi', after: 'nao-existe' }),
    );
    expect(failure.code).toBe('stale-thread');
    expect((failure.newMessages as unknown[]).length).toBe(1);
  });

  it('thread-resolved: recusa, com a dica de abrir outra conversa que cite esta', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Já resolvida' }],
      resolved: true,
    });
    const path = join(dir(), threadFilePath(t.id, true));
    const before = sha(path);
    const failure = errorOf(
      await post({ ref: threadRef(t.id), text: 'Oi', after: lastId(t.id) }),
    );
    expect(failure.code).toBe('thread-resolved');
    expect(String(failure.hint)).toContain('open_thread');
    expect(sha(path)).toBe(before);
    expect(commentFiles(dir())).not.toContain(`${t.id}.json`);
  });

  it('empty-message e message-too-long; thread-not-found', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Oi' }],
    });
    const after = lastId(t.id);
    expect(errorOf(await post({ ref: threadRef(t.id), text: ' \n', after })).code).toBe(
      'empty-message',
    );
    expect(
      errorOf(await post({ ref: threadRef(t.id), text: 'x'.repeat(10001), after })).code,
    ).toBe('message-too-long');
    expect(
      errorOf(await post({ ref: 'mapping://cadastro/c/deadbeef', text: 'Oi', after }))
        .code,
    ).toBe('thread-not-found');
  });

  it('o nome vem do argumento author; kind é sempre agent, e-mail nulo', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      messages: [{ by: 'human', text: 'Oi' }],
    });
    ok(
      await post({
        ref: threadRef(t.id),
        text: 'Resposta',
        after: lastId(t.id),
        author: 'Revisor IA',
      }),
    );
    expect(readThread(dir(), t.id).messages[1]!.author).toEqual({
      kind: 'agent',
      name: 'Revisor IA',
      email: null,
    });
  });

  it('o horário da resposta nunca fica antes da última mensagem', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MI') },
      start: 60 * 24 * 365 * 5,
      messages: [{ by: 'human', text: 'No futuro' }],
    });
    ok(await post({ ref: threadRef(t.id), text: 'Resposta', after: lastId(t.id) }));
    const messages = readThread(dir(), t.id).messages;
    expect(messages.map((m) => m.author.kind)).toEqual(['human', 'agent']);
    expect(Date.parse(messages[1]!.at)).toBeGreaterThan(Date.parse(messages[0]!.at));
  });

  describe('a app gravando no meio', () => {
    it('relê e refaz sobre a versão do disco: a mensagem nova da pessoa vira stale-thread', async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Oi' }],
      });
      const after = lastId(t.id);
      const path = join(dir(), threadFilePath(t.id, false));
      // Cópia do arquivo com mais uma mensagem de pessoa, que "a app" grava depois da 1ª leitura.
      const newer = join(ws.base, 'newer.json');
      const keep = readFileSync(path);
      humanReplies(dir(), t.id, 'Escrevi enquanto você respondia', 40);
      copyFileSync(path, newer);
      writeFileSync(path, keep);
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [{ match: `${t.id}.json`, nth: 1, copy: { from: newer, to: path } }],
        }),
      );
      try {
        const failure = errorOf(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Resposta',
            after,
          }),
        );
        expect(failure.code).toBe('stale-thread');
        expect(readThread(dir(), t.id).messages.map((m) => m.author.kind)).toEqual([
          'human',
          'human',
        ]);
      } finally {
        rmSync(hooks, { force: true });
      }
    });

    it('mudança que não altera a guarda é refeita e grava', async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Oi' }],
      });
      const path = join(dir(), threadFilePath(t.id, false));
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [
            { match: `${t.id}.json`, nth: 1, append: { file: path, text: '\n' } },
          ],
        }),
      );
      try {
        ok(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Resposta',
            after: lastId(t.id),
          }),
        );
        expect(readThread(dir(), t.id).messages).toHaveLength(2);
      } finally {
        rmSync(hooks, { force: true });
      }
    });

    it('revision-conflict depois das tentativas, sem gravar', async () => {
      const t = seedThread(dir(), {
        anchor: { kind: 'marking', id: id('MI') },
        messages: [{ by: 'human', text: 'Oi' }],
      });
      const path = join(dir(), threadFilePath(t.id, false));
      writeFileSync(
        hooks,
        JSON.stringify({
          afterRead: [{ match: `${t.id}.json`, append: { file: path, text: '\n' } }],
        }),
      );
      try {
        const failure = errorOf(
          await hooked.call('post_message', {
            ref: threadRef(t.id),
            text: 'Resposta',
            after: lastId(t.id),
          }),
        );
        expect(failure.code).toBe('revision-conflict');
        expect(readThread(dir(), t.id).messages).toHaveLength(1);
      } finally {
        rmSync(hooks, { force: true });
      }
    });
  });
});

describe('o que o servidor nunca faz', () => {
  it('as tools de conversa não alteram o mapping.json nem gravam em comments/resolved/', async () => {
    const before = sha(mapping());
    const resolvedBefore = resolvedFiles(dir());
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Hash' }],
    });
    ok(await mcp.call('list_threads', { project: 'cadastro', status: 'all' }));
    ok(await mcp.call('get_thread', { ref: threadRef(t.id) }));
    ok(
      await mcp.call('open_thread', {
        project: 'cadastro',
        anchor: ref('m', id('MF')),
        text: 'Nova',
      }),
    );
    ok(
      await mcp.call('post_message', {
        ref: threadRef(t.id),
        text: 'Resposta',
        after: readThread(dir(), t.id).messages.at(-1)!.id,
      }),
    );
    expect(sha(mapping())).toBe(before);
    expect(resolvedFiles(dir())).toEqual(resolvedBefore);
  });

  it('não existe tool para resolver, reabrir ou apagar conversa', async () => {
    const { tools } = await mcp.client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_threads',
        'get_thread',
        'open_thread',
        'post_message',
      ]),
    );
    expect(names.filter((n) => /resolve_thread|reopen|delete_thread/.test(n))).toEqual(
      [],
    );
  });

  it('uma conversa resolvida pela app continua resolvida depois de uma leitura', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Vou resolver' }],
    });
    humanResolves(dir(), t.id, 50);
    const got = ok(await mcp.call<Got>('get_thread', { ref: threadRef(t.id) }));
    expect(got.status).toBe('resolved');
    expect(got.awaiting).toBeNull();
    expect(existsSync(join(dir(), threadFilePath(t.id, true)))).toBe(true);
  });
});
