// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderStorage } from '../../src/storage/folder';
import type { ProjectStorage } from '../../src/storage/types';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW, sampleProject } from '../model/fixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { MemoryDirectory } from '../storage/memoryFs';

// Integridade do disco ao trocar a versão de um pacote da biblioteca: em nenhum momento o
// `mapping.json` gravado cita um arquivo da especialização que não existe (nada é apagado antes
// de o `mapping.json` novo estar no disco).

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
  /** Violações do invariante vistas em qualquer operação do storage. */
  readonly violations: string[];
  /** Quantas operações de escrita/remoção o invariante conferiu. */
  readonly checks: () => number;
  /** A próxima remoção de arquivo de pacote falha (uma vez). */
  failNextFileRemoval(): void;
}

function start(): Harness {
  const root = new MemoryDirectory('p');
  const inner = createFolderStorage(root);
  const violations: string[] = [];
  let checks = 0;
  let failRemoval = false;

  /** O arquivo da especialização que o `mapping.json` gravado agora cita existe? */
  const assertInvariant = async (op: string) => {
    checks++;
    const text = await root.read('mapping.json');
    if (!text) return;
    const mapping = JSON.parse(text) as { specializations?: { file: string }[] };
    for (const s of mapping.specializations ?? []) {
      if ((await inner.readSpec(s.file)) === null) {
        violations.push(`${op}: ${s.file} não existe`);
      }
    }
  };
  const around =
    <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await assertInvariant(`antes de ${name}`);
      const result = await fn(...args);
      await assertInvariant(`depois de ${name}`);
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
        throw new Error('disco ocupado');
      }
      await inner.removeSpecFile(path);
    }),
  };
  let n = 0;
  const session = openSession({
    storage,
    project: sampleProject(),
    prepareImage: () => Promise.reject(new Error('sem imagens')),
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

describe('pacote da biblioteca: o disco nunca cita arquivo já apagado', () => {
  let h: Harness | null = null;
  afterEach(async () => {
    await h?.session.close();
    h = null;
    vi.restoreAllMocks();
  });

  /** Aplica a v1 (com `docs/antigo.md`) e atualiza para a v2 (com `docs/novo.md`). */
  async function updated() {
    const harness = start();
    h = harness;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/antigo.md', '# antigo');
    harness.session.actions.applySpecialization(v1, files);
    await settle();
    const next = material3Package();
    next.set('docs/novo.md', '# novo');
    const result = harness.session.actions.updateSpecialization(
      { ...v1, version: 2 },
      undefined,
      next,
    );
    expect(result.ok).toBe(true);
    await settle();
    return harness;
  }

  it('atualizar v1 → v2: o invariante vale em toda operação e a pasta fica só com a v2', async () => {
    const harness = await updated();
    expect(harness.checks()).toBeGreaterThan(10);
    expect(harness.violations).toEqual([]);
    const files = await harness.inner.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/novo.md`);
    expect(files).not.toContain(`${DIR}/docs/antigo.md`);
    expect(files).toContain(SPEC_FILE);
    const spec = JSON.parse((await harness.root.read(SPEC_FILE)) ?? '{}') as {
      version: number;
    };
    expect(spec.version).toBe(2);
  });

  it('desfazer volta à v1 (com o arquivo que saiu), sem violar o invariante', async () => {
    const harness = await updated();
    await undo(harness);
    expect(harness.violations).toEqual([]);
    const files = await harness.inner.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/antigo.md`);
    expect(files).not.toContain(`${DIR}/docs/novo.md`);
    expect(files).toContain(SPEC_FILE);
    const spec = JSON.parse((await harness.root.read(SPEC_FILE)) ?? '{}') as {
      version: number;
    };
    expect(spec.version).toBe(1);
    expect(
      new TextDecoder().decode(
        await (await harness.inner.readSpecFile(`${DIR}/docs/antigo.md`))?.arrayBuffer(),
      ),
    ).toBe('# antigo');
  });

  it('falha ao remover os restos da v1 não perde a limpeza: a próxima gravação remove', async () => {
    const harness = start();
    h = harness;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const v1 = { ...material3Spec(), version: 1 };
    const files = material3Package();
    files.set('docs/antigo.md', '# antigo');
    harness.session.actions.applySpecialization(v1, files);
    await settle();

    harness.failNextFileRemoval();
    const next = material3Package();
    next.set('docs/novo.md', '# novo');
    harness.session.actions.updateSpecialization({ ...v1, version: 2 }, undefined, next);
    await settle();
    // A remoção falhou: o resto da v1 continua na pasta, e o `mapping.json` já cita a v2.
    expect(await harness.inner.listSpecDir(DIR)).toContain(`${DIR}/docs/antigo.md`);
    expect(await harness.inner.listSpecDir(DIR)).toContain(`${DIR}/docs/novo.md`);
    expect(console.error).toHaveBeenCalledWith('[session.cleanup]', expect.any(Error));

    // Outra mudança do projeto, qualquer: a gravação seguinte refaz a limpeza.
    expect(harness.session.actions.renameProject('Outro nome').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    const after = await harness.inner.listSpecDir(DIR);
    expect(after).not.toContain(`${DIR}/docs/antigo.md`);
    expect(after).toContain(`${DIR}/docs/novo.md`);
    expect(after).toContain(SPEC_FILE);
    expect(harness.violations).toEqual([]);
  });
});
