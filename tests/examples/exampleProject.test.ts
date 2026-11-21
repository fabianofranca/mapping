import JSZip from 'jszip';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deserialize,
  isTextPackageFile,
  parseSpecText,
  parseProposalText,
  parseThreadText,
  serializeThread,
  awaiting,
  resolveAnchor,
  extractCitations,
  resolveCitation,
  toLibraryFiles,
  validateAccepted,
  validateProject,
  type Project,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import {
  EXAMPLE_DIR,
  EXAMPLE_SPECS,
  EXAMPLE_ZIP,
  exampleFiles,
  folderFiles,
} from '../../scripts/exampleProject.mjs';

// `examples/full-example/` is the example project (the source); the zip and the guide (`public/guide/`)
// come from it. The zip is what the person downloads from the repository (the app does not embed it).
// To generate the zip again: `npm run build:example`.

const HINT = 'Run `npm run build:example` to regenerate examples/full-example.zip.';

async function readExample() {
  const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
  if (!read.ok) throw new Error(`unreadable zip: ${read.error}`);
  const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
  if (!parsed.ok) throw new Error(`invalid mapping.json: ${parsed.error.code}`);
  return { files: read.files, project: parsed.project };
}

describe('example project zip', () => {
  it('has the folder content (outside specs/) plus the manifest', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE_ZIP));
    const expected = await exampleFiles();
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      const bytes = Buffer.from((await zip.file(path)?.async('uint8array')) ?? []);
      expect(
        bytes.equals(content),
        `${path} differs from the example view. ${HINT}`,
      ).toBe(true);
    }
  });

  it('opens like "Open zip": mapping.json valid in the current schema, no migration', async () => {
    const { project } = await readExample();
    expect(project.schemaVersion).toBe(23);
    expect(project.revision).toBe(1);
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
    const parsed = read.ok
      ? deserialize(read.files.mapping, undefined, read.files.specs)
      : null;
    expect(parsed?.ok && parsed.migratedFrom).toBeNull();
  });

  it('has 4 containers, 32 markings, 42 annotations, 10 layers and 4 specializations', async () => {
    const { project } = await readExample();
    expect(project.containers).toHaveLength(4);
    expect(project.markings).toHaveLength(32); // 31 on the screens + the floating note of the notes library
    expect(project.annotations).toHaveLength(42);
    expect(project.layers).toHaveLength(10); // + Notes (the free layer became Questions) and Layout M3
    expect(project.specializations).toHaveLength(4);
  });

  it('has the Data and Material 3 perspectives (For everyone) and the arrival of the "Sign up" note', async () => {
    const { project } = await readExample();
    const layerId = (name: string) => project.layers.find((l) => l.name === name)?.id;
    const container = (name: string) =>
      project.containers.find((c) => c.name === name)?.id;
    const note = project.markings.find((m) => m.floating);
    expect(note).toBeDefined();
    expect(project.perspectives.map((p) => p.name)).toEqual(['Data', 'Material 3']);
    const [data, material] = project.perspectives;
    expect(data?.items.map((i) => i.root).sort()).toEqual(
      [container('Sign up'), container('Login'), note?.id].sort(),
    );
    expect([...(data?.hiddenLayers ?? [])].sort()).toEqual(
      ['Components', 'Events', 'Questions'].map((n) => layerId(n)).sort(),
    );
    expect(material?.items.map((i) => i.root).sort()).toEqual(
      [container('Settings'), container('Order details')].sort(),
    );
    expect(material?.hiddenLayers).toEqual([]);
    expect(project.arrivals).toEqual([
      { root: note?.id, from: data?.id, fromName: 'Data' },
    ]);
  });

  it('the perspectives and the arrival have no read warning (perspective-*, arrival-*)', async () => {
    const { project } = await readExample();
    const codes = validateProject(project).map((i) => i.code);
    expect(codes.filter((c) => /^(perspective|arrival)-/.test(c))).toEqual([]);
    expect(codes).toEqual([]);
  });

  it('two containers are photos and two are blank screens; each photo is in the zip', async () => {
    const { project, files } = await readExample();
    const photos = project.containers.filter((image) => image.file !== null);
    expect(photos).toHaveLength(2);
    expect(project.containers.filter((image) => image.file === null)).toHaveLength(2);
    for (const image of photos)
      expect(files.images.has(image.file ?? ''), image.name ?? '').toBe(true);
  });

  it('the cited specializations are in the copies in specs/', async () => {
    const { project, files } = await readExample();
    for (const spec of project.specializations) {
      expect(files.specs.has(spec.file), spec.file).toBe(true);
    }
  });

  it('every typed annotation uses a type that the project specialization declares', async () => {
    const { project, files } = await readExample();
    const typeIds = new Map<string, Set<string>>();
    for (const entry of project.specializations) {
      const parsed = parseSpecText(files.specs.get(entry.file) ?? '');
      if (!parsed.ok) throw new Error(`${entry.file}: ${parsed.errors.join('; ')}`);
      typeIds.set(
        entry.id,
        new Set(parsed.spec.layers.flatMap((l) => l.annotationTypes.map((a) => a.id))),
      );
    }
    const typed = project.annotations.filter((a) => a.type !== null);
    expect(typed.length).toBeGreaterThan(20);
    for (const a of typed) {
      const { specId, typeId } = a.type!;
      expect(typeIds.get(specId)?.has(typeId), `${specId}/${typeId}`).toBe(true);
    }
  });

  it('the material3-compose package validates with no errors', async () => {
    const { files } = await readExample();
    const entries: { path: string; text?: string }[] = [...files.specs].map(
      ([path, text]) => ({ path, text }),
    );
    for (const [path, blob] of files.specAssets ?? []) {
      if (files.specs.has(path)) continue;
      entries.push(
        isTextPackageFile(path) ? { path, text: await blob.text() } : { path },
      );
    }
    const report = validateLibrary({
      files: toLibraryFiles('specs/material3-compose', entries),
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    // The drawing check of the package's 229 examples takes over 5 s with coverage on in CI.
  }, 30_000);
});

describe('example threads (comments/)', () => {
  async function readThreads() {
    const { files, project } = await readExample();
    const threads = [...(files.threads ?? [])].map(([path, text]) => {
      const parsed = parseThreadText(text);
      if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
      return { path, text, thread: parsed.thread };
    });
    return { threads, project };
  }

  it('the zip carries three valid, canonical threads at the right paths', async () => {
    const { threads } = await readThreads();
    expect(threads).toHaveLength(3);
    for (const { path, text, thread } of threads) {
      const folder = thread.resolved === null ? 'comments' : 'comments/resolved';
      expect(path).toBe(`${folder}/${thread.id}.json`);
      expect(serializeThread(thread), path).toBe(text);
    }
  });

  it('one awaits a human (agent, with a field citation), one awaits the agent and one is resolved', async () => {
    const { threads } = await readThreads();
    const states = threads.map(({ thread }) => awaiting(thread));
    expect(states.filter((s) => s === 'human')).toHaveLength(1);
    expect(states.filter((s) => s === 'agent')).toHaveLength(1);
    expect(states.filter((s) => s === null)).toHaveLength(1);
    const byAgent = threads.find(({ thread }) => awaiting(thread) === 'human')!.thread;
    expect(byAgent.anchor.kind).toBe('field');
    expect(byAgent.messages[0]!.author.kind).toBe('agent');
    expect(byAgent.messages[0]!.text).toContain('mapping://full-example/m/');
    const resolved = threads.find(({ thread }) => thread.resolved !== null)!.thread;
    expect(resolved.resolved?.by.email).toBe('marina@example.com');
  });

  it('every mapping:// citation in the threads resolves in the project (no broken)', async () => {
    const { threads, project } = await readThreads();
    const all = threads.map(({ thread }) => thread);
    for (const thread of all) {
      for (const m of thread.messages) {
        for (const c of extractCitations(m.text)) {
          expect(c.ref, `${thread.id}: ${c.url}`).not.toBeNull();
          const r = resolveCitation({ project, threads: all, proposals: [] }, c.ref!.ref);
          expect(r.found, `${thread.id}: ${c.url}`).toBe(true);
        }
      }
    }
  });

  it('all anchors exist in the project and no email is real', async () => {
    const { threads, project } = await readThreads();
    for (const { thread } of threads) {
      expect(resolveAnchor(project, thread.anchor).orphan, thread.id).toBe(false);
      for (const m of thread.messages)
        if (m.author.email !== null) expect(m.author.email).toMatch(/@example\.com$/);
    }
  });
});

describe('example proposal', () => {
  async function readProposal(project: Project) {
    const { files } = await readExample();
    const entries = [...files.proposals];
    expect(entries).toHaveLength(1);
    const [path, text] = entries[0]!;
    const parsed = parseProposalText(text);
    if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
    expect(path).toBe(`proposals/${parsed.proposal.id}/proposal.json`);
    expect(parsed.proposal.baseRevision).toBe(project.revision);
    return parsed.proposal;
  }

  it('is valid, open, with no decisions, and accepting everything gives a valid project', async () => {
    const { project } = await readExample();
    const proposal = await readProposal(project);
    expect(proposal.status).toBe('open');
    expect(proposal.title).toBe('Profile screen and Sign up tweak');
    expect(proposal.changes.length).toBeGreaterThan(5);
    expect(Object.keys(proposal.decisions)).toEqual([]);
    const all = Object.fromEntries(
      proposal.changes.map((c) => [c.id, { state: 'accepted' as const, at: 'x' }]),
    );
    expect(validateAccepted(project, { ...proposal, decisions: all }).ok).toBe(true);
  });
});

describe('example specializations generated from the sources', () => {
  it('the file of specializations[] in mapping.json fall on manifest targets', () => {
    const mapping = JSON.parse(
      readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
    ) as { specializations: { file: string }[] };
    const targets = EXAMPLE_SPECS.map((entry) => `specs/${entry.target}`);
    expect(mapping.specializations).toHaveLength(EXAMPLE_SPECS.length);
    for (const { file } of mapping.specializations) {
      const inside = targets.some(
        (target) => file === target || file.startsWith(`${target}/`),
      );
      expect(inside, `${file} falls on no manifest target`).toBe(true);
    }
  });

  it('the version of each specialization in mapping.json is the source one', () => {
    const mapping = JSON.parse(
      readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
    ) as { specializations: { id: string; version: number; file: string }[] };
    expect(mapping.specializations.map((s) => s.id).sort()).toEqual([
      'data-model',
      'material3-compose',
      'notas',
      'sdui',
    ]);
    for (const s of mapping.specializations) {
      const entry = EXAMPLE_SPECS.find(
        (e) => s.file === `specs/${e.target}` || s.file.startsWith(`specs/${e.target}/`),
      );
      const rel = s.file.slice(`specs/${entry?.target}`.length).replace(/^\//, '');
      const source =
        rel === '' ? (entry?.source as string) : join(entry?.source as string, rel);
      const src = JSON.parse(readFileSync(source, 'utf8')) as { version: number };
      expect(s.version, `version of ${s.id} differs from the source. ${HINT}`).toBe(
        src.version,
      );
    }
  });

  it('exampleFiles() ignores the specs/ on disk and brings the one from the sources', async () => {
    const view = await exampleFiles();
    const paths = [...view.keys()];
    expect(paths).toContain('mapping.json');
    expect(paths).toContain('specs/sdui.json');
    expect(paths).toContain('specs/data-model.json');
    expect(paths).toContain('specs/material3-compose/material3-compose.spec.json');
    expect(paths).toContain('specs/notas/notas.spec.json');
    expect(paths).not.toContain('specs/notas/index.ts');
    const sdui: unknown = JSON.parse(readFileSync('examples/specs/sdui.json', 'utf8'));
    expect(JSON.parse(view.get('specs/sdui.json')?.toString('utf8') ?? 'null')).toEqual(
      sdui,
    );
  });

  it('the .gitignore lists examples/full-example/specs/', () => {
    const lines = readFileSync('.gitignore', 'utf8')
      .split('\n')
      .map((l) => l.trim());
    expect(lines).toContain('examples/full-example/specs/');
  });
});

describe('folderFiles ignores system junk (item 69)', () => {
  it('.DS_Store, Thumbs.db and node_modules are left out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'folderfiles-'));
    try {
      writeFileSync(join(dir, 'mapping.json'), '{}');
      writeFileSync(join(dir, '.DS_Store'), 'x');
      writeFileSync(join(dir, 'Thumbs.db'), 'x');
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'sub', '.DS_Store'), 'x');
      writeFileSync(join(dir, 'sub', 'a.txt'), 'a');
      mkdirSync(join(dir, 'node_modules'));
      writeFileSync(join(dir, 'node_modules', 'm.js'), 'x');
      const files = await folderFiles(dir);
      expect([...files.keys()]).toEqual(['mapping.json', 'sub/a.txt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
