import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, quadrants } from './images';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Stage #2090, BP1: the scratch folder (`--scratch`). The `operationsFile` of every batch tool and
// the image files of the batch come from it, read-only; the library package stays inside the roots;
// no project is found there and the server writes nothing there.

const MATERIAL3 = 'tests/fixtures/material3';
const SCREEN = {
  op: 'add_container',
  as: '$screen',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};

let base: string;
let root: string;
let scratch: string;
let mcp: Connection;

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  created: { op: number; alias?: string; kind: string }[];
}
interface Proposed {
  proposal: { ref: string; id: string };
}
interface Revised {
  revised: boolean;
  dryRun?: true;
  counts: { changed: number; added: number; dropped: number };
}
interface Listed {
  roots: string[];
  missingRoots: string[];
  scratch: string[];
  missingScratch: string[];
  projects: { name: string; path: string }[];
}

/** Every file under `dir` (relative path and size), to compare before and after. */
function snapshot(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(`${relative(dir, full)}:${statSync(full).size}`);
    }
  };
  walk(dir);
  return found.sort();
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-scratch-root-'));
  root = join(base, 'root');
  scratch = join(base, 'scratch');
  mkdirSync(join(scratch, 'shots'), { recursive: true });
  mkdirSync(join(root, 'projetos'), { recursive: true });
  writeFileSync(join(scratch, 'batch.json'), JSON.stringify([SCREEN]));
  writeFileSync(
    join(scratch, 'revise.json'),
    JSON.stringify([
      { op: 'add_container', width: 120, height: 80, background: '#E3F2FD' },
    ]),
  );
  writeFileSync(join(scratch, 'shots', 'foto.png'), await encodePng(quadrants(300, 200)));
  cpSync(MATERIAL3, join(scratch, 'pkg', 'material3'), { recursive: true });
  // The scratch folder is not a root: a project copied there is not a project.
  mcp = await connect([root], {
    args: ['--scratch', scratch, '--scratch', join(base, 'not-created')],
  });
  ok(await mcp.call('create_project', { path: 'projetos/loja', name: 'Loja' }));
  cpSync(join(root, 'projetos', 'loja'), join(scratch, 'copia'), { recursive: true });
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('operationsFile from the scratch folder', () => {
  it('plan_changes reads a relative and an absolute path', async () => {
    for (const operationsFile of ['batch.json', join(scratch, 'batch.json')]) {
      const plan = ok(
        await mcp.call<Plan>('plan_changes', { project: 'loja', operationsFile }),
      );
      expect(plan.valid, JSON.stringify(plan)).toBe(true);
      expect(plan.created.map((c) => c.alias)).toEqual(['$screen']);
    }
  });

  it('a file in a root wins over a file with the same name in the scratch folder', async () => {
    writeFileSync(
      join(root, 'batch.json'),
      JSON.stringify([SCREEN, { ...SCREEN, as: '$second' }]),
    );
    try {
      const plan = ok(
        await mcp.call<Plan>('plan_changes', {
          project: 'loja',
          operationsFile: 'batch.json',
        }),
      );
      expect(plan.created).toHaveLength(2);
    } finally {
      rmSync(join(root, 'batch.json'));
    }
  });

  it('a path that leaves the scratch folder is outside-roots', async () => {
    const outside = join(base, 'outside.json');
    writeFileSync(outside, JSON.stringify([SCREEN]));
    for (const operationsFile of ['../outside.json', outside]) {
      const reply = await mcp.call('plan_changes', { project: 'loja', operationsFile });
      expect(errorOf(reply).code).toBe('outside-roots');
    }
  });

  it('propose_changes, then revise_proposal (dry run and real) with operationsFile', async () => {
    const proposed = ok(
      await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'From scratch',
        operationsFile: 'batch.json',
      }),
    );
    for (const operationsFile of ['revise.json', join(scratch, 'revise.json')]) {
      const dry = ok(
        await mcp.call<Revised>('revise_proposal', {
          project: 'loja',
          ref: proposed.proposal.ref,
          operationsFile,
          dryRun: true,
        }),
      );
      expect(dry.dryRun).toBe(true);
      expect(dry.counts.added).toBeGreaterThan(0);
    }
    const revised = ok(
      await mcp.call<Revised>('revise_proposal', {
        project: 'loja',
        ref: proposed.proposal.ref,
        operationsFile: 'revise.json',
      }),
    );
    expect(revised.revised).toBe(true);
  });

  it('revise_proposal: operations and operationsFile together are invalid-arguments', async () => {
    const proposed = ok(
      await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'Both',
        operationsFile: 'batch.json',
      }),
    );
    const reply = await mcp.call('revise_proposal', {
      project: 'loja',
      ref: proposed.proposal.ref,
      operations: [SCREEN],
      operationsFile: 'revise.json',
    });
    expect(errorOf(reply).code).toBe('invalid-arguments');
  });

  it('revise_proposal: an empty inline `operations` does not clash with operationsFile', async () => {
    const proposed = ok(
      await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'Empty inline',
        operationsFile: 'batch.json',
      }),
    );
    const dry = ok(
      await mcp.call<Revised>('revise_proposal', {
        project: 'loja',
        ref: proposed.proposal.ref,
        operations: [],
        operationsFile: 'revise.json',
        dryRun: true,
      }),
    );
    expect(dry.counts.added).toBeGreaterThan(0);
  });

  it('revise_proposal: neither operations nor drop is still invalid-arguments, and drop alone is valid input', async () => {
    const proposed = ok(
      await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'Neither',
        operationsFile: 'batch.json',
      }),
    );
    const neither = await mcp.call('revise_proposal', {
      project: 'loja',
      ref: proposed.proposal.ref,
    });
    expect(errorOf(neither).code).toBe('invalid-arguments');
    const dropOnly = await mcp.call('revise_proposal', {
      project: 'loja',
      ref: proposed.proposal.ref,
      drop: ['c999'],
      dryRun: true,
    });
    // Whatever the verdict on the change id, it is not an argument error about the batch.
    expect(JSON.stringify(dropOnly.data)).not.toContain('provide `operations`');
  });
});

describe('images from the scratch folder', () => {
  it('add_container reads its `file` from the scratch folder (relative and absolute)', async () => {
    for (const file of ['shots/foto.png', join(scratch, 'shots', 'foto.png')]) {
      const plan = ok(
        await mcp.call<Plan>('plan_changes', {
          project: 'loja',
          operations: [{ op: 'add_container', as: '$photo', file, name: 'Photo' }],
        }),
      );
      expect(plan.valid, JSON.stringify(plan.errors)).toBe(true);
    }
  });
});

describe('the library package stays inside the roots', () => {
  it('apply_specialization with a package in the scratch folder is outside-roots', async () => {
    const plan = ok(
      await mcp.call<Plan>('plan_changes', {
        project: 'loja',
        operations: [
          { op: 'apply_specialization', file: join(scratch, 'pkg', 'material3') },
        ],
      }),
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors?.[0]?.code).toBe('outside-roots');
  });
});

describe('list_projects and the write paths', () => {
  it('shows scratch and missingScratch, and finds no project there', async () => {
    const listed = ok(await mcp.call<Listed>('list_projects'));
    expect(listed.roots).toEqual([root]);
    expect(listed.scratch).toEqual([scratch, join(base, 'not-created')]);
    expect(listed.missingScratch).toEqual([join(base, 'not-created')]);
    expect(listed.projects.map((p) => p.path)).toEqual(['projetos/loja']);
  });

  it('create_project cannot use the scratch folder (unknown-root, outside-roots)', async () => {
    const asRoot = await mcp.call('create_project', {
      path: 'novo',
      name: 'Novo',
      root: scratch,
    });
    expect(errorOf(asRoot).code).toBe('unknown-root');
    const absolute = await mcp.call('create_project', {
      path: join(scratch, 'novo'),
      name: 'Novo',
    });
    expect(errorOf(absolute).code).toBe('outside-roots');
  });

  it('get a project that only exists in the scratch folder: not found', async () => {
    const reply = await mcp.call('get_project', { project: 'copia' });
    expect(errorOf(reply).code).toBe('project-not-found');
  });

  it('nothing is written in the scratch folder by the batch tools', async () => {
    const before = snapshot(scratch);
    const proposed = ok(
      await mcp.call<Proposed>('propose_changes', {
        project: 'loja',
        title: 'Writes nothing there',
        operations: [
          { op: 'add_container', as: '$photo', file: 'shots/foto.png', name: 'Photo' },
        ],
      }),
    );
    ok(
      await mcp.call('revise_proposal', {
        project: 'loja',
        ref: proposed.proposal.ref,
        operationsFile: 'revise.json',
      }),
    );
    expect(snapshot(scratch)).toEqual(before);
    expect(readFileSync(join(scratch, 'batch.json'), 'utf8')).toBe(
      JSON.stringify([SCREEN]),
    );
  });
});

describe('a scratch folder that overlaps a root is refused at startup (usage error)', () => {
  const bundle = resolve('dist-mcp/mapping-mcp.js');
  const start = (...args: string[]) =>
    spawnSync(process.execPath, [bundle, ...args], {
      encoding: 'utf8',
      input: '',
      timeout: 20_000,
    });

  it.each([
    ['inside a root', (r: string) => ['--root', r, '--scratch', join(r, 'tmp')]],
    ['a root inside it', (r: string) => ['--root', join(r, 'inner'), '--scratch', r]],
    ['the same folder', (r: string) => ['--root', r, '--scratch', r]],
  ])('%s: exit 2, the message and the usage text on stderr', (_name, args) => {
    const run = start(...args(root));
    expect(run.status).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(
      /^mapping-mcp: the scratch folder .+ overlaps the root .+: keep the scratch folder outside the roots\n\nUsage:/,
    );
  });

  it('sibling folders still start (the server waits for the client and ends with its input)', () => {
    const run = start('--root', root, '--scratch', scratch);
    expect(run.status).not.toBe(2);
    expect(run.stderr).not.toContain('overlaps');
  });
});
