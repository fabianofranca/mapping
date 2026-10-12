import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proposalFilePath } from '../../src/model';
import { encodePng, quadrants } from './images';
import {
  errorOf,
  hashOf,
  ok,
  propose,
  readProposal,
  reviewDecide,
  type Proposed,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Gravação das propostas no disco, por stdio no bundle real (fase 8.5): as três promessas de
// "Concorrência com a app" do docs/MCP.md (M3), o `link` em sistemas sem hard link (M4) e os
// nomes de `images/` que uma proposta substituída ainda reserva (M5). As corridas são
// provocadas pelo gancho de disco (`fsHooks.mjs`), que roda dentro do processo do servidor.

let base: string;
let root: string;
let hooks: string;
let mcp: Connection;
const dir = () => join(root, 'loja');

interface Hooks {
  afterRead?: { match: string; append: { file: string; text: string } }[];
  fail?: {
    fn: 'readFile' | 'link' | 'rename' | 'writeFile';
    match: string;
    code: string;
  }[];
}
const arm = (config: Hooks) => writeFileSync(hooks, JSON.stringify(config));
const disarm = () => rmSync(hooks, { force: true });

const proposalDirs = () =>
  existsSync(join(dir(), 'proposals'))
    ? readdirSync(join(dir(), 'proposals')).sort()
    : [];
const imageOf = (path: string) => path.split('/').slice(2).join('/');

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-disk-'));
  root = join(base, 'raiz');
  hooks = join(base, 'ganchos.json');
  for (const folder of ['fontes', 'fontes2', 'fontes3']) {
    mkdirSync(join(root, folder), { recursive: true });
  }
  const png = await encodePng(quadrants(64, 48));
  for (const name of ['tela', 'livre', 'velha', 'outra']) {
    for (const folder of ['fontes', 'fontes2', 'fontes3']) {
      writeFileSync(join(root, folder, `${name}.png`), png);
    }
  }
  mcp = await connect([root], { fsHooks: hooks });
  ok(await mcp.call('create_project', { path: 'loja', name: 'Loja' }));
});

afterAll(async () => {
  disarm();
  await mcp?.close();
});

describe('concorrência com a app (M3)', () => {
  it('mapping.json alterado enquanto a proposta é calculada: revision-conflict e nada gravado', async () => {
    const before = proposalDirs();
    arm({
      afterRead: [
        {
          match: join('fontes', 'outra.png'),
          append: { file: join(dir(), 'mapping.json'), text: '\n' },
        },
      ],
    });
    try {
      const result = await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'Corrida',
        operations: [{ op: 'add_image', file: 'fontes/outra.png' }],
      });
      expect(errorOf(result).code).toBe('revision-conflict');
    } finally {
      disarm();
    }
    expect(proposalDirs()).toEqual(before);
  });

  it('mapping.json de schema mais novo: read-only, sem gravar nada', async () => {
    const mapping = join(dir(), 'mapping.json');
    const original = readFileSync(mapping, 'utf8');
    const doc = JSON.parse(original) as { schemaVersion: number };
    writeFileSync(mapping, JSON.stringify({ ...doc, schemaVersion: 99 }, null, 2));
    const before = proposalDirs();
    const hash = hashOf(mapping);
    try {
      const operations = [{ op: 'create_layer', name: 'Futuro' }];
      for (const tool of ['plan_changes', 'propose_changes']) {
        const result = await mcp.call(tool, { project: 'loja', title: 'F', operations });
        expect(errorOf(result).code, tool).toBe('read-only');
      }
      expect(hashOf(mapping)).toBe(hash);
      expect(proposalDirs()).toEqual(before);
    } finally {
      writeFileSync(mapping, original);
    }
  });

  it('a anterior muda a cada leitura: a nova é gravada e vem o aviso supersede-failed', async () => {
    const first = await propose(mcp, 'loja', [{ op: 'create_layer', name: 'A' }]);
    arm({
      afterRead: [
        {
          match: proposalFilePath(first.proposal.id),
          append: { file: join(dir(), proposalFilePath(first.proposal.id)), text: ' ' },
        },
      ],
    });
    let second: Proposed;
    try {
      second = await propose(mcp, 'loja', [{ op: 'create_layer', name: 'B' }], {
        supersedes: first.proposal.ref,
      });
    } finally {
      disarm();
    }
    expect(second.proposed).toBe(true);
    expect(second.warnings?.map((w) => w.code)).toContain('supersede-failed');
    expect(readProposal(dir(), first.proposal.id).status).toBe('open');
    expect(readProposal(dir(), second.proposal.id).supersedes).toBe(first.proposal.id);
  });

  it('erro de disco ao marcar a anterior também é só o aviso supersede-failed (Q3)', async () => {
    const first = await propose(mcp, 'loja', [{ op: 'create_layer', name: 'C' }]);
    arm({
      fail: [{ fn: 'rename', match: proposalFilePath(first.proposal.id), code: 'EIO' }],
    });
    let result;
    try {
      result = await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'D',
        operations: [{ op: 'create_layer', name: 'D' }],
        supersedes: first.proposal.ref,
      });
    } finally {
      disarm();
    }
    const second = ok(result);
    expect(second.proposed).toBe(true);
    const warning = second.warnings?.find((w) => w.code === 'supersede-failed');
    expect(warning?.message).toContain('EIO');
    expect(readProposal(dir(), first.proposal.id).status).toBe('open');
    expect(readProposal(dir(), second.proposal.id).status).toBe('open');
  });
});

describe('sistemas de arquivos sem hard link (M4)', () => {
  it('link com EPERM: a proposta e as imagens são gravadas sem o link, sem temporários', async () => {
    arm({ fail: [{ fn: 'link', match: join(dir(), 'proposals'), code: 'EPERM' }] });
    let proposed: Proposed;
    try {
      proposed = await propose(mcp, 'loja', [
        { op: 'add_image', file: 'fontes/outra.png' },
      ]);
    } finally {
      disarm();
    }
    expect(proposed.files.images.map(imageOf)).toEqual(['images/outra.webp']);
    const folder = join(dir(), 'proposals', proposed.proposal.id);
    expect(readdirSync(folder).sort()).toEqual(['images', 'proposal.json']);
    expect(readdirSync(join(folder, 'images'))).toEqual(['outra.webp']);
    expect(readProposal(dir(), proposed.proposal.id).status).toBe('open');
  });

  it('link com EEXIST: image-exists e a pasta da proposta removida', async () => {
    const before = proposalDirs();
    arm({ fail: [{ fn: 'link', match: '/images/', code: 'EEXIST' }] });
    try {
      const result = await mcp.call('propose_changes', {
        project: 'loja',
        title: 'Colide',
        operations: [{ op: 'add_image', file: 'fontes2/outra.png' }],
      });
      expect(errorOf(result).code).toBe('image-exists');
    } finally {
      disarm();
    }
    expect(proposalDirs()).toEqual(before);
  });
});

describe('nomes de images/ reservados (M5)', () => {
  it('a aceita da proposta substituída continua reservada; a pendente é liberada', async () => {
    const a = await propose(mcp, 'loja', [{ op: 'add_image', file: 'fontes/tela.png' }]);
    expect(a.files.images.map(imageOf)).toEqual(['images/tela.webp']);
    reviewDecide(dir(), a.proposal.id, { level: 'proposal', id: null }, 'accepted');
    const b = await propose(
      mcp,
      'loja',
      [{ op: 'add_image', file: 'fontes2/tela.png' }],
      {
        supersedes: a.proposal.ref,
      },
    );
    // A aceita de A ainda pode ser aplicada: B não pode reivindicar o mesmo nome.
    expect(b.files.images.map(imageOf)).toEqual(['images/tela-2.webp']);
    expect(readProposal(dir(), a.proposal.id).status).toBe('superseded');

    // Uma terceira, sem supersedes: tela.webp (aceita em A, substituída) e tela-2.webp (B, aberta).
    const c = await propose(mcp, 'loja', [{ op: 'add_image', file: 'fontes3/tela.png' }]);
    expect(c.files.images.map(imageOf)).toEqual(['images/tela-3.webp']);

    // Pendente na anterior: liberada para a que a substitui.
    const d = await propose(mcp, 'loja', [{ op: 'add_image', file: 'fontes/livre.png' }]);
    const e = await propose(
      mcp,
      'loja',
      [{ op: 'add_image', file: 'fontes2/livre.png' }],
      {
        supersedes: d.proposal.ref,
      },
    );
    expect(e.files.images.map(imageOf)).toEqual(['images/livre.webp']);
  });

  it('as pendentes de uma substituída antiga não reservam mais (Q2)', async () => {
    const f = await propose(mcp, 'loja', [{ op: 'add_image', file: 'fontes/velha.png' }]);
    expect(f.files.images.map(imageOf)).toEqual(['images/velha.webp']);
    await propose(mcp, 'loja', [{ op: 'create_layer', name: 'Substituta' }], {
      supersedes: f.proposal.ref,
    });
    expect(readProposal(dir(), f.proposal.id).status).toBe('superseded');
    const h = await propose(mcp, 'loja', [
      { op: 'add_image', file: 'fontes2/velha.png' },
    ]);
    expect(h.files.images.map(imageOf)).toEqual(['images/velha.webp']);
  });
});
