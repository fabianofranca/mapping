import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, ok } from './proposalSupport';
import { seedThread } from './threadSupport';
import { codeOf, connect, createWorkspace } from './workspace';
import type { Connection, Workspace } from './workspace';

// A gramática nova da referência no MCP (decisão 27): `l` (camada), `c` (conversa) e os
// segmentos `/f/`, `/e/` e `/r/` depois do código. As referências de hoje continuam iguais, e o
// sufixo estranho continua `invalid-ref`.

let ws: Workspace;
let mcp: Connection;
const dir = () => ws.projectDir('apps/cadastro');
const id = (name: string): string => ws.ids[name] as string;
const base = (letter: string, uuid: string) =>
  `mapping://cadastro/${letter}/${codeOf(uuid)}`;

interface Resolved {
  kind: string;
  ref: string;
  id?: string;
  name?: string | null;
  annotation?: string;
  key?: string;
  value?: unknown;
  entryId?: string;
  rowId?: string;
  project: { name: string };
  [key: string]: unknown;
}

beforeAll(async () => {
  ws = createWorkspace();
  mcp = await connect([ws.root]);
});
afterAll(async () => {
  await mcp?.close();
});

describe('resolve com a gramática nova', () => {
  it('camada (l)', async () => {
    const r = ok(await mcp.call<Resolved>('resolve', { ref: base('l', id('LM')) }));
    expect(r).toMatchObject({
      kind: 'layer',
      ref: base('l', id('LM')),
      id: id('LM'),
      name: 'Model',
      project: { name: 'cadastro' },
    });
  });

  it('conversa (c)', async () => {
    const t = seedThread(dir(), {
      anchor: { kind: 'marking', id: id('MF') },
      messages: [{ by: 'human', text: 'Oi' }],
    });
    const r = ok(await mcp.call<Resolved>('resolve', { ref: base('c', t.id) }));
    expect(r).toMatchObject({ kind: 'thread', ref: base('c', t.id), id: t.id });
  });

  it('campo, par e linha, com a referência da anotação que os contém', async () => {
    const field = ok(
      await mcp.call<Resolved>('resolve', { ref: `${base('a', id('AC'))}/f/nome` }),
    );
    expect(field).toMatchObject({
      kind: 'field',
      ref: `${base('a', id('AC'))}/f/nome`,
      annotation: base('a', id('AC')),
      key: 'nome',
      value: 'Contato',
    });
    const entry = ok(
      await mcp.call<Resolved>('resolve', {
        ref: `${base('a', id('AU'))}/e/${codeOf(id('EN'))}`,
      }),
    );
    expect(entry).toMatchObject({
      kind: 'entry',
      annotation: base('a', id('AU')),
      entryId: id('EN'),
    });
    const row = ok(
      await mcp.call<Resolved>('resolve', {
        ref: `${base('a', id('AC'))}/f/atributos/r/${codeOf(id('R1'))}`,
      }),
    );
    expect(row).toMatchObject({
      kind: 'row',
      annotation: base('a', id('AC')),
      key: 'atributos',
      rowId: id('R1'),
    });
  });

  it('as referências de hoje continuam iguais', async () => {
    const m = ok(await mcp.call<Resolved>('resolve', { ref: base('m', id('MF')) }));
    expect(m).toMatchObject({ kind: 'marking', id: id('MF'), name: 'Formulário' });
    const i = ok(await mcp.call<Resolved>('resolve', { ref: base('i', id('I1')) }));
    expect(i.kind).toBe('container');
    const a = ok(await mcp.call<Resolved>('resolve', { ref: base('a', id('AU')) }));
    expect(a.kind).toBe('annotation');
  });

  it('sufixo estranho, segmento incompleto ou campo/par/linha que não existe', async () => {
    for (const bad of [
      `${base('m', id('MF'))}/extra`,
      `${base('m', id('MF'))}?x=1`,
      `${base('a', id('AC'))}/f`,
      `${base('a', id('AC'))}/x/nome`,
      `${base('a', id('AC'))}/f/nome/r`,
      `${base('l', id('LM'))}/f/nome`,
    ]) {
      expect(errorOf(await mcp.call('resolve', { ref: bad })).code, bad).toBe(
        'invalid-ref',
      );
    }
    expect(
      errorOf(await mcp.call('resolve', { ref: `${base('a', id('AC'))}/f/inexistente` }))
        .code,
    ).toBe('not-found');
    expect(
      errorOf(
        await mcp.call('resolve', {
          ref: base('l', 'abcdef12-0000-4000-8000-000000000000'),
        }),
      ).code,
    ).toBe('not-found');
  });
});

describe('as tools de item aceitam a sub-referência', () => {
  it('get_annotation com campo, par ou linha devolve a anotação que os contém', async () => {
    for (const ref of [
      `${base('a', id('AC'))}/f/nome`,
      `${base('a', id('AC'))}/f/atributos/r/${codeOf(id('R1'))}`,
    ]) {
      const a = ok(await mcp.call<{ ref: string }>('get_annotation', { ref }));
      expect(a.ref, ref).toBe(base('a', id('AC')));
    }
    const free = ok(
      await mcp.call<{ ref: string }>('get_annotation', {
        ref: `${base('a', id('AU'))}/e/${codeOf(id('EN'))}`,
      }),
    );
    expect(free.ref).toBe(base('a', id('AU')));
  });

  it('uma sub-referência numa tool de marcação ou de container é wrong-kind', async () => {
    expect(
      errorOf(await mcp.call('get_marking', { ref: `${base('a', id('AC'))}/f/nome` }))
        .code,
    ).toBe('wrong-kind');
    expect(
      errorOf(await mcp.call('get_marking', { ref: base('l', id('LM')) })).code,
    ).toBe('wrong-kind');
  });
});
