import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deserialize,
  updateSpecialization,
  type Project,
  type Proposal,
  type Spec,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { clearReportedErrors } from '../../src/utils/report';
import { propose } from '../model/proposalFixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { diskProposal, openHarness, writeOutside, type Harness } from './proposalHarness';

// Phase B4 (C2): the proposal that bumps the version of a library package brings the files
// in `proposals/<id>/specs/<folder>/`; applying COPIES them to `specs/<folder>/` through the session.

beforeEach(() => localStorage.clear());
afterEach(() => clearReportedErrors());

const DIR = 'specs/material3';
const FROM = 'proposals/P1/specs/material3';
const SPEC_FILE = `${DIR}/material3.spec.json`;

async function projectOnDisk(h: Harness): Promise<Project> {
  await h.session.flush();
  const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('invalid mapping.json');
  return parsed.project;
}

/** The project with the v1 package applied and saved (with a document that v2 will not have). */
async function withV1(): Promise<{ h: Harness; v1: Spec }> {
  const h = await openHarness({ proposals: [] });
  const v1: Spec = { ...material3Spec(), version: 1 };
  const files = material3Package();
  files.set('docs/old.md', '# old');
  expect(h.session.actions.applySpecialization(v1, files).ok).toBe(true);
  await h.session.flush();
  return { h, v1 };
}

interface Staged {
  /** Files to put in `proposals/P1/specs/material3/` (the v2 package by default). */
  readonly files?: Map<string, string | Blob>;
}

/** Builds the v2 proposal over the open project and leaves the files where the MCP would leave them. */
async function propose2(h: Harness, v1: Spec, staged: Staged = {}): Promise<Proposal> {
  const base = h.session.store.project.value;
  if (!base) throw new Error('no project');
  const v2: Spec = { ...v1, version: 2 };
  const proposal = propose(
    base,
    updateSpecialization(base, v2, { packageSpecName: 'material3.spec.json' }),
    { id: 'P1' },
  );
  const files = staged.files ?? material3Package();
  if (!staged.files) {
    files.delete('material3.spec.json');
    files.set('docs/new.md', '# new');
  }
  const storage = createFolderStorage(h.root);
  for (const [path, data] of files) {
    await storage.writeImage(`${FROM}/${path}`, new Blob([data]));
  }
  writeOutside(h.root, proposal);
  await h.session.proposals.scan();
  return proposal;
}

async function dirFiles(h: Harness): Promise<string[]> {
  return createFolderStorage(h.root).listSpecDir(DIR);
}

async function specVersionOnDisk(h: Harness): Promise<number> {
  const text = await h.root.read(SPEC_FILE);
  return (JSON.parse(text ?? '{}') as { version: number }).version;
}

describe('apply a proposal with a library package', () => {
  it('copies the package to specs/<folder>/, and undo and redo swap the folder along with the version', async () => {
    const { h, v1 } = await withV1();
    const beforeFiles = await dirFiles(h);
    expect(beforeFiles).toContain(`${DIR}/docs/old.md`);
    const proposal = await propose2(h, v1);
    const spec = proposal.changes.find((c) => c.entity === 'specialization');
    expect(spec?.kind).toBe('update');

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    const result = await h.review.apply();
    expect(result).toMatchObject({ ok: true });

    // Folder rewritten with the new files; `mapping.json` at version 2.
    const after = await dirFiles(h);
    expect(after).toContain(`${DIR}/docs/new.md`);
    expect(after).not.toContain(`${DIR}/docs/old.md`);
    expect(after).toContain(SPEC_FILE);
    expect(await h.root.read(`${DIR}/docs/new.md`)).toBe('# new');
    expect(await specVersionOnDisk(h)).toBe(2);
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
    // Copied, not moved: the proposal keeps the files.
    expect(await h.root.read(`${FROM}/docs/new.md`)).toBe('# new');
    expect((await diskProposal(h.root)).applied).not.toEqual({});

    // Undo: version 1 and the folder files as they were.
    h.session.store.undo();
    await h.session.proposals.settled();
    await h.session.flush();
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(1);
    expect(await dirFiles(h)).toEqual(beforeFiles);
    expect(await specVersionOnDisk(h)).toBe(1);
    expect(await h.root.read(`${DIR}/docs/old.md`)).toBe('# old');
    expect(await h.root.read(`${FROM}/docs/new.md`)).toBe('# new');

    // Redo: back to version 2.
    h.session.store.redo();
    await h.session.proposals.settled();
    await h.session.flush();
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
    expect(await dirFiles(h)).toEqual(after);
    expect(await h.root.read(`${DIR}/docs/new.md`)).toBe('# new');
    expect(await specVersionOnDisk(h)).toBe(2);
  });

  it('the specialization file comes from to.spec: the one in the proposal folder, if any, does not count', async () => {
    const { h, v1 } = await withV1();
    // The package brings `material3.spec.json` still at v1.
    await propose2(h, v1, { files: material3Package() });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true });
    await h.session.flush();
    expect(await specVersionOnDisk(h)).toBe(2);
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
  });

  it('package missing in the proposal: package-missing and nothing changes', async () => {
    const { h, v1 } = await withV1();
    await propose2(h, v1, { files: new Map() });
    const before = h.session.store.project.value;
    const filesBefore = await dirFiles(h);

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toEqual({
      ok: false,
      error: 'package-missing',
      path: FROM,
    });
    expect(h.session.store.project.value).toBe(before);
    expect(await dirFiles(h)).toEqual(filesBefore);
    expect(await specVersionOnDisk(h)).toBe(1);
    expect((await diskProposal(h.root)).applied).toEqual({});
  });

  it('invalid package in the proposal: package-invalid and nothing changes', async () => {
    const { h, v1 } = await withV1();
    const files = material3Package();
    files.set('components/broken.json', '{ not json');
    files.delete('material3.spec.json');
    // A component cited by the specialization disappears: level 1 error.
    const [firstComponent] = [...files.keys()].filter((p) => p.startsWith('components/'));
    if (firstComponent === undefined) throw new Error('no components in the package');
    files.set(firstComponent, '{ "format": "nothing" }');
    await propose2(h, v1, { files });
    const before = h.session.store.project.value;
    const filesBefore = await dirFiles(h);

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toEqual({
      ok: false,
      error: 'package-invalid',
      path: FROM,
    });
    expect(h.session.store.project.value).toBe(before);
    expect(await dirFiles(h)).toEqual(filesBefore);
    expect(await specVersionOnDisk(h)).toBe(1);
    expect((await diskProposal(h.root)).applied).toEqual({});
  });

  it('the export carries the package files while the change has not been applied, and not afterwards', async () => {
    const { h, v1 } = await withV1();
    await propose2(h, v1);
    const exported = async () =>
      [...(await h.session.collectFiles()).proposalImages.keys()].filter((path) =>
        path.startsWith(`${FROM}/`),
      );
    const before = await exported();
    expect(before).toContain(`${FROM}/docs/new.md`);
    expect(before).toContain(`${FROM}/components/m3-button.json`);

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true });
    expect(await exported()).toEqual([]);
  });
});
