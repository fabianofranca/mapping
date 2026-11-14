// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import type { ProjectStorage } from '../../src/storage/types';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

// Disk integrity when switching the version of a library package: at no moment does the
// written `mapping.json` cite a specialization file that does not exist (nothing is deleted before
// the new `mapping.json` is on disk).

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/material3';
const SPEC_FILE = `${DIR}/material3.spec.json`;

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

interface Harness {
  readonly root: MemoryDirectory;
  readonly session: ProjectSession;
  readonly inner: ProjectStorage;
  /** Violations of the invariant seen in any storage operation. */
  readonly violations: string[];
  /** How many write/removal operations the invariant checked. */
  readonly checks: () => number;
  /** The next removal of a package file fails (once). */
  failNextFileRemoval(): void;
}

function start(): Harness {
  const root = new MemoryDirectory('p');
  const inner = createFolderStorage(root);
  const violations: string[] = [];
  let checks = 0;
  let failRemoval = false;

  /** Does the specialization file that the `mapping.json` now written cites exist? */
  const assertInvariant = async (op: string) => {
    checks++;
    const text = await root.read('mapping.json');
    if (!text) return;
    const mapping = JSON.parse(text) as { specializations?: { file: string }[] };
    for (const s of mapping.specializations ?? []) {
      if ((await inner.readSpec(s.file)) === null) {
        violations.push(`${op}: ${s.file} does not exist`);
      }
    }
  };
  const around =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await assertInvariant(`before ${name}`);
      const result = await fn(...args);
      await assertInvariant(`after ${name}`);
      return result;
    };
  const storage: ProjectStorage = {
    ...inner,
    saveMapping: around('saveMapping', inner.saveMapping),
    writeSpec: around('writeSpec', inner.writeSpec),
    removeSpec: around('removeSpec', inner.removeSpec),
    writeSpecFile: around('writeSpecFile', inner.writeSpecFile),
    removeSpecDir: around('removeSpecDir', inner.removeSpecDir),
    removeSpecFile: around('removeSpecFile', async (path: string) => {
      if (failRemoval) {
        failRemoval = false;
        throw new Error('disk busy');
      }
      await inner.removeSpecFile(path);
    }),
  };
  let n = 0;
  const session = openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('no images')),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return {
    root,
    session,
    inner,
    violations,
    checks: () => checks,
    failNextFileRemoval: () => {
      failRemoval = true;
    },
  };
}

async function undo(h: Harness) {
  h.session.store.undo();
  await vi.advanceTimersByTimeAsync(300);
  await settle();
}

describe('library package: the disk never cites an already deleted file', () => {
  let h: Harness | null = null;
  afterEach(async () => {
    await h?.session.close();
    h = null;
    vi.restoreAllMocks();
  });

  /** Applies v1 (with `docs/old.md`) and updates to v2 (with `docs/new.md`). */
  async function updated() {
    const harness = start();
    h = harness;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/old.md', '# old');
    harness.session.actions.applySpecialization(v1, files);
    await settle();
    const next = material3Package();
    next.set('docs/new.md', '# new');
    const result = harness.session.actions.updateSpecialization(
      { ...v1, version: 2 },
      undefined,
      next,
    );
    expect(result.ok).toBe(true);
    await settle();
    return harness;
  }

  it('updating v1 → v2: the invariant holds on every operation and the folder ends with v2 only', async () => {
    const harness = await updated();
    expect(harness.checks()).toBeGreaterThan(10);
    expect(harness.violations).toEqual([]);
    const files = await harness.inner.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/new.md`);
    expect(files).not.toContain(`${DIR}/docs/old.md`);
    expect(files).toContain(SPEC_FILE);
    const spec = JSON.parse((await harness.root.read(SPEC_FILE)) ?? '{}') as {
      version: number;
    };
    expect(spec.version).toBe(2);
  });

  it('undoing goes back to v1 (with the file that left), without violating the invariant', async () => {
    const harness = await updated();
    await undo(harness);
    expect(harness.violations).toEqual([]);
    const files = await harness.inner.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/old.md`);
    expect(files).not.toContain(`${DIR}/docs/new.md`);
    expect(files).toContain(SPEC_FILE);
    const spec = JSON.parse((await harness.root.read(SPEC_FILE)) ?? '{}') as {
      version: number;
    };
    expect(spec.version).toBe(1);
    expect(
      new TextDecoder().decode(
        await (await harness.inner.readSpecFile(`${DIR}/docs/old.md`))?.arrayBuffer(),
      ),
    ).toBe('# old');
  });

  it('failing to remove the v1 leftovers does not lose the cleanup: the next write removes it', async () => {
    const harness = start();
    h = harness;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/old.md', '# old');
    harness.session.actions.applySpecialization(v1, files);
    await settle();

    harness.failNextFileRemoval();
    const next = material3Package();
    next.set('docs/new.md', '# new');
    harness.session.actions.updateSpecialization({ ...v1, version: 2 }, undefined, next);
    await settle();
    // The removal failed: the v1 leftover stays in the folder, and `mapping.json` already cites v2.
    expect(await harness.inner.listSpecDir(DIR)).toContain(`${DIR}/docs/old.md`);
    expect(await harness.inner.listSpecDir(DIR)).toContain(`${DIR}/docs/new.md`);
    expect(console.error).toHaveBeenCalledWith('[session.cleanup]', expect.any(Error));

    // Any other project change: the next write redoes the cleanup.
    expect(harness.session.actions.renameProject('Other name').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    const after = await harness.inner.listSpecDir(DIR);
    expect(after).not.toContain(`${DIR}/docs/old.md`);
    expect(after).toContain(`${DIR}/docs/new.md`);
    expect(after).toContain(SPEC_FILE);
    expect(harness.violations).toEqual([]);
  });
});
