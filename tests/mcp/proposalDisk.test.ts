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

// Writing of proposals to disk, over stdio on the real bundle (phase 8.5): the three promises of
// "Concurrency with the app" in docs/MCP.md (M3), the `link` on systems without hard links (M4) and the
// `images/` names that a replaced proposal still reserves (M5), the cleanup of the temporary file
// on a best-effort basis (gate return, 0.3.4). The races are
// provoked by the disk hook (`fsHooks.mjs`), which runs inside the server process.

let base: string;
let root: string;
let hooks: string;
let mcp: Connection;
const dir = () => join(root, 'store');

interface Hooks {
  afterRead?: { match: string; append: { file: string; text: string } }[];
  fail?: {
    fn: 'readFile' | 'link' | 'rename' | 'rm' | 'writeFile';
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
  root = join(base, 'roots');
  hooks = join(base, 'hooks.json');
  for (const folder of ['fontes', 'fontes2', 'fontes3']) {
    mkdirSync(join(root, folder), { recursive: true });
  }
  const png = await encodePng(quadrants(64, 48));
  for (const name of ['tela', 'livre', 'velha', 'outra', 'presa', 'montada', 'busy']) {
    for (const folder of ['fontes', 'fontes2', 'fontes3']) {
      writeFileSync(join(root, folder, `${name}.png`), png);
    }
  }
  mcp = await connect([root], { fsHooks: hooks });
  ok(await mcp.call('create_project', { path: 'store', name: 'Store' }));
});

afterAll(async () => {
  disarm();
  await mcp?.close();
});

describe('concurrency with the app (M3)', () => {
  it('mapping.json changed while the proposal is computed: revision-conflict and nothing written', async () => {
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
        project: 'store',
        title: 'Race',
        operations: [{ op: 'add_image', file: 'fontes/outra.png' }],
      });
      expect(errorOf(result).code).toBe('revision-conflict');
    } finally {
      disarm();
    }
    expect(proposalDirs()).toEqual(before);
  });

  it('mapping.json with a newer schema: read-only, without writing anything', async () => {
    const mapping = join(dir(), 'mapping.json');
    const original = readFileSync(mapping, 'utf8');
    const doc = JSON.parse(original) as { schemaVersion: number };
    writeFileSync(mapping, JSON.stringify({ ...doc, schemaVersion: 99 }, null, 2));
    const before = proposalDirs();
    const hash = hashOf(mapping);
    try {
      const operations = [{ op: 'create_layer', name: 'Future' }];
      for (const tool of ['plan_changes', 'propose_changes']) {
        const result = await mcp.call(tool, { project: 'store', title: 'F', operations });
        expect(errorOf(result).code, tool).toBe('read-only');
      }
      expect(hashOf(mapping)).toBe(hash);
      expect(proposalDirs()).toEqual(before);
    } finally {
      writeFileSync(mapping, original);
    }
  });

  it('the previous one changes on every read: the new one is written and the supersede-failed warning comes', async () => {
    const first = await propose(mcp, 'store', [{ op: 'create_layer', name: 'A' }]);
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
      second = await propose(mcp, 'store', [{ op: 'create_layer', name: 'B' }], {
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

  it('a disk error when marking the previous one is also only the supersede-failed warning (Q3)', async () => {
    const first = await propose(mcp, 'store', [{ op: 'create_layer', name: 'C' }]);
    arm({
      fail: [{ fn: 'rename', match: proposalFilePath(first.proposal.id), code: 'EIO' }],
    });
    let result;
    try {
      result = await mcp.call<Proposed>('propose_changes', {
        project: 'store',
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

describe('file systems without hard links (M4)', () => {
  it('link with EPERM: the proposal and the images are written without the link, without temporaries', async () => {
    arm({ fail: [{ fn: 'link', match: join(dir(), 'proposals'), code: 'EPERM' }] });
    let proposed: Proposed;
    try {
      proposed = await propose(mcp, 'store', [
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

  it('link with EEXIST: image-exists and the proposal folder removed', async () => {
    const before = proposalDirs();
    arm({ fail: [{ fn: 'link', match: '/images/', code: 'EEXIST' }] });
    try {
      const result = await mcp.call('propose_changes', {
        project: 'store',
        title: 'Collides',
        operations: [{ op: 'add_image', file: 'fontes2/outra.png' }],
      });
      expect(errorOf(result).code).toBe('image-exists');
    } finally {
      disarm();
    }
    expect(proposalDirs()).toEqual(before);
  });
});

describe('best-effort cleanup of the temporary file (gate return, 0.3.4)', () => {
  // On a mounted folder (a VM with the Windows folder) or with antivirus software, deleting the temporary file can
  // fail with EPERM/EBUSY after the file is written. The proposal is valid; the temporary file
  // stays and the server only warns on stderr.
  const temps = (folder: string) =>
    existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith('.tmp')) : [];

  it.each(['EPERM', 'EBUSY'])(
    'rm of the proposal.json temporary file with %s: the proposal is valid and the warning goes to stderr',
    async (code) => {
      arm({ fail: [{ fn: 'rm', match: '.proposal.json.', code }] });
      let result;
      try {
        result = await mcp.call<Proposed>('propose_changes', {
          project: 'store',
          title: `Mounted folder ${code}`,
          operations: [{ op: 'create_layer', name: `Mounted ${code}` }],
        });
      } finally {
        disarm();
      }
      const proposed = ok(result);
      expect(proposed.proposed).toBe(true);
      const folder = join(dir(), 'proposals', proposed.proposal.id);
      expect(readProposal(dir(), proposed.proposal.id).status).toBe('open');
      const left = temps(folder);
      expect(left).toHaveLength(1);
      expect(left[0]).toMatch(/^\.proposal\.json\.[0-9a-f]+\.tmp$/);
      expect(mcp.stderr()).toContain(`warning: could not delete the temporary file`);
      expect(mcp.stderr()).toContain(left[0]);
      // The leftover temporary file is neither a proposal nor a broken proposal.
      const listed = ok(
        await mcp.call<{ proposals: { id: string }[]; broken?: unknown[] }>(
          'list_proposals',
          { project: 'store' },
        ),
      );
      expect(listed.proposals.map((p) => p.id)).toContain(proposed.proposal.id);
      expect(listed.broken).toBeUndefined();
    },
  );

  it('rm of an image temporary file with EPERM: image and proposal.json written', async () => {
    arm({ fail: [{ fn: 'rm', match: '/images/.', code: 'EPERM' }] });
    let result;
    try {
      result = await mcp.call<Proposed>('propose_changes', {
        project: 'store',
        title: 'Stuck image',
        operations: [{ op: 'add_image', file: 'fontes/presa.png' }],
      });
    } finally {
      disarm();
    }
    const proposed = ok(result);
    expect(proposed.files.images.map(imageOf)).toEqual(['images/presa.webp']);
    const folder = join(dir(), 'proposals', proposed.proposal.id);
    expect(readdirSync(folder).sort()).toEqual(['images', 'proposal.json']);
    const images = readdirSync(join(folder, 'images'));
    expect(images.filter((name) => !name.endsWith('.tmp'))).toEqual(['presa.webp']);
    expect(temps(join(folder, 'images'))).toHaveLength(1);
    expect(readProposal(dir(), proposed.proposal.id).status).toBe('open');
  });

  it('without a hard link and the temporary-file rm with EPERM: writes by wx', async () => {
    arm({
      fail: [
        { fn: 'link', match: join(dir(), 'proposals'), code: 'EPERM' },
        { fn: 'rm', match: '.tmp', code: 'EPERM' },
      ],
    });
    let result;
    try {
      result = await mcp.call<Proposed>('propose_changes', {
        project: 'store',
        title: 'No hard link and mounted',
        operations: [{ op: 'add_image', file: 'fontes/montada.png' }],
      });
    } finally {
      disarm();
    }
    const proposed = ok(result);
    expect(proposed.files.images.map(imageOf)).toEqual(['images/montada.webp']);
    const folder = join(dir(), 'proposals', proposed.proposal.id);
    expect(readProposal(dir(), proposed.proposal.id).status).toBe('open');
    expect(
      readdirSync(join(folder, 'images')).filter((n) => !n.endsWith('.tmp')),
    ).toEqual(['montada.webp']);
    // Without a hard link, what is left over is a copy; the written files are the real ones.
    expect(temps(folder)).toHaveLength(1);
    expect(temps(join(folder, 'images'))).toHaveLength(1);
  });

  it('link with EEXIST and the temporary-file rm with EPERM: the original error (image-exists) prevails', async () => {
    const before = proposalDirs();
    arm({
      fail: [
        { fn: 'link', match: '/images/', code: 'EEXIST' },
        { fn: 'rm', match: '.tmp', code: 'EPERM' },
      ],
    });
    try {
      const result = await mcp.call('propose_changes', {
        project: 'store',
        title: 'Collides and mounted',
        operations: [{ op: 'add_image', file: 'fontes/busy.png' }],
      });
      expect(errorOf(result).code).toBe('image-exists');
    } finally {
      disarm();
    }
    expect(proposalDirs()).toEqual(before);
  });
});

describe('reserved images/ names (M5)', () => {
  it('the accepted one of the replaced proposal stays reserved; the pending one is released', async () => {
    const a = await propose(mcp, 'store', [{ op: 'add_image', file: 'fontes/tela.png' }]);
    expect(a.files.images.map(imageOf)).toEqual(['images/tela.webp']);
    reviewDecide(dir(), a.proposal.id, { level: 'proposal', id: null }, 'accepted');
    const b = await propose(
      mcp,
      'store',
      [{ op: 'add_image', file: 'fontes2/tela.png' }],
      {
        supersedes: a.proposal.ref,
      },
    );
    // A's accepted one can still be applied: B cannot claim the same name.
    expect(b.files.images.map(imageOf)).toEqual(['images/tela-2.webp']);
    expect(readProposal(dir(), a.proposal.id).status).toBe('superseded');

    // A third one, without supersedes: tela.webp (accepted in A, replaced) and tela-2.webp (B, open).
    const c = await propose(mcp, 'store', [
      { op: 'add_image', file: 'fontes3/tela.png' },
    ]);
    expect(c.files.images.map(imageOf)).toEqual(['images/tela-3.webp']);

    // Pending in the previous one: released for the one that replaces it.
    const d = await propose(mcp, 'store', [
      { op: 'add_image', file: 'fontes/livre.png' },
    ]);
    const e = await propose(
      mcp,
      'store',
      [{ op: 'add_image', file: 'fontes2/livre.png' }],
      {
        supersedes: d.proposal.ref,
      },
    );
    expect(e.files.images.map(imageOf)).toEqual(['images/livre.webp']);
  });

  it('the pending ones of an old replaced proposal no longer reserve (Q2)', async () => {
    const f = await propose(mcp, 'store', [
      { op: 'add_image', file: 'fontes/velha.png' },
    ]);
    expect(f.files.images.map(imageOf)).toEqual(['images/velha.webp']);
    await propose(mcp, 'store', [{ op: 'create_layer', name: 'Replacement' }], {
      supersedes: f.proposal.ref,
    });
    expect(readProposal(dir(), f.proposal.id).status).toBe('superseded');
    const h = await propose(mcp, 'store', [
      { op: 'add_image', file: 'fontes2/velha.png' },
    ]);
    expect(h.files.images.map(imageOf)).toEqual(['images/velha.webp']);
  });
});
