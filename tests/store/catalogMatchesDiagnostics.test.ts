// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serialize, type Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { loadLibraryIssues } from '../../src/storage/specPackage';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';
import { files, ROOT, spec } from '../support/material3Library';

// Bug 1.5: the Catalog window said "Valid package, no errors or warnings." while the
// Diagnostics counted the "parameter outside the signature" warnings of the same package.

let current: ProjectSession | null = null;
afterEach(async () => {
  await current?.close();
  current = null;
});

const pkg = () =>
  new Map<string, string | Blob>(
    files.map((f) => [
      f.path,
      f.text ?? new Blob([new Uint8Array(readFileSync(join(ROOT, f.path)))]),
    ]),
  );

async function open(project: Project, root: MemoryDirectory) {
  const storage = createFolderStorage(root);
  const text = serialize(project);
  return openSession({
    storage,
    project,
    loadedText: text,
    libraryIssues: await loadLibraryIssues(storage, project),
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    autosaveDelay: 1,
  });
}

const warningsOf = (issues: readonly { severity: string }[]) =>
  issues.filter((i) => i.severity === 'warning').length;

describe('Catalog and Diagnostics count the same package warnings', () => {
  it('freshly applied package (in-memory copy) and reopened from disk', async () => {
    const root = new MemoryDirectory('p');
    const base: Project = { ...sampleProject(), revision: 1 };
    root.put('mapping.json', serialize(base));
    const first = await open(base, root);
    current = first;
    expect(first.actions.applySpecialization(spec, pkg()).ok).toBe(true);
    await first.flush();

    const fromMemory = async (s: ProjectSession) => {
      s.catalogs.request();
      await s.catalogs.whenIdle();
      return s.catalogs.entries.value?.[0]?.catalog.report.warnings.length;
    };
    const diag = warningsOf([...first.libraryIssues.value.values()].flat());
    expect(diag).toBeGreaterThan(0);
    expect(await fromMemory(first)).toBe(diag);

    // Reopened: Diagnostics reads the disk; the Catalog too.
    const saved = first.store.committed.peek();
    if (!saved) throw new Error('no project');
    await first.close();
    const second = await open(saved, root);
    current = second;
    const diagDisk = warningsOf([...second.libraryIssues.value.values()].flat());
    expect(diagDisk).toBe(diag);
    expect(await fromMemory(second)).toBe(diagDisk);
  }, 60_000);
});
