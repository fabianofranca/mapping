import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  updateSpecialization,
  type Proposal,
  type Spec,
} from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import { clearReportedErrors } from '../../src/utils/report';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';
import { openHarness, writeOutside, type Harness } from './proposalHarness';

// FA2, decisão 10: ao aplicar uma proposta, as imagens (e os arquivos do pacote) esperando em
// `proposals/<id>/` são lidas em paralelo com limite; as verificações, os erros e as gravações
// de imagem da aplicação seguem na ordem de sempre.

afterEach(() => clearReportedErrors());

const NAMES = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Proposta com seis imagens novas, aceita por inteiro e pronta para aplicar. */
async function sixImages(missing?: string): Promise<Harness> {
  const base = sampleProject();
  let after = base;
  NAMES.forEach((n, i) => {
    after = addContainer(after, {
      id: `I${i + 10}`,
      file: `images/${n}.webp`,
      width: 8,
      height: 6,
    });
  });
  const proposal = propose(base, after, { id: 'P1' });
  const files = Object.fromEntries(
    NAMES.filter((n) => n !== missing).map((n) => [
      `proposals/P1/images/${n}.webp`,
      n.toUpperCase(),
    ]),
  );
  const h = await openHarness({ proposals: [proposal], files });
  h.review.open('P1');
  await h.review.decide({ level: 'proposal', id: null }, 'accepted');
  expect(h.review.derived.canApply.value).toBe(true);
  return h;
}

/** Mede o pico de leituras de imagem simultâneas (com latência) e a ordem em que começaram. */
function probeReads(h: Harness) {
  const state = { inFlight: 0, peak: 0, started: [] as string[] };
  const original = h.storage.readImage.bind(h.storage);
  vi.spyOn(h.storage, 'readImage').mockImplementation(async (path) => {
    state.started.push(path);
    state.inFlight++;
    state.peak = Math.max(state.peak, state.inFlight);
    await new Promise((r) => setTimeout(r, 3));
    state.inFlight--;
    return original(path);
  });
  return state;
}

describe('aplicar uma proposta: leituras em paralelo com limite', () => {
  it('as 6 imagens da proposta são lidas com pico de 4 e gravadas em série, na ordem', async () => {
    const h = await sixImages();
    const reads = probeReads(h);
    const original = h.storage.writeImage.bind(h.storage);
    const writes: string[] = [];
    let writing = 0;
    let writePeak = 0;
    vi.spyOn(h.storage, 'writeImage').mockImplementation(async (path, data) => {
      writes.push(path);
      writing++;
      writePeak = Math.max(writePeak, writing);
      await new Promise((r) => setTimeout(r, 1));
      writing--;
      return original(path, data);
    });
    expect(await h.review.apply()).toMatchObject({ ok: true, applied: 6, files: 6 });
    expect(reads.peak).toBe(FOLDER_CONCURRENCY);
    expect(writePeak).toBe(1);
    expect(writes.filter((w) => w.startsWith('images/'))).toEqual(
      NAMES.map((n) => `images/${n}.webp`),
    );
    for (const n of NAMES)
      expect(await h.root.read(`images/${n}.webp`)).toBe(n.toUpperCase());
  });

  it('origem ausente: image-missing com o mesmo caminho, nada gravado', async () => {
    const h = await sixImages('c');
    const reads = probeReads(h);
    const result = await h.review.apply();
    expect(result).toMatchObject({
      ok: false,
      error: 'image-missing',
      path: 'proposals/P1/images/c.webp',
    });
    expect(reads.peak).toBe(FOLDER_CONCURRENCY);
    for (const n of NAMES) expect(await h.root.read(`images/${n}.webp`)).toBeNull();
    expect(h.session.store.project.value?.containers.map((c) => c.id)).not.toContain(
      'I10',
    );
  });

  it('o pacote da proposta é lido com pico de 4 e a versão nova chega ao disco', async () => {
    const h = await openHarness({ proposals: [] });
    const v1: Spec = { ...material3Spec(), version: 1 };
    h.session.actions.applySpecialization(v1, material3Package());
    await h.session.flush();
    const base = h.session.store.project.value;
    if (!base) throw new Error('sem projeto');
    const proposal: Proposal = propose(
      base,
      updateSpecialization(
        base,
        { ...v1, version: 2 },
        { packageSpecName: 'material3.spec.json' },
      ),
      { id: 'P1' },
    );
    const files = material3Package();
    files.delete('material3.spec.json');
    expect(files.size).toBeGreaterThan(FOLDER_CONCURRENCY);
    const storage = createFolderStorage(h.root);
    for (const [path, data] of files)
      await storage.writeImage(`proposals/P1/specs/material3/${path}`, new Blob([data]));
    writeOutside(h.root, proposal);
    await h.session.proposals.scan();
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    const reads = probeReads(h);
    expect(await h.review.apply()).toMatchObject({ ok: true });
    expect(reads.peak).toBe(FOLDER_CONCURRENCY);
    const spec = JSON.parse(
      (await h.root.read('specs/material3/material3.spec.json')) ?? '{}',
    ) as {
      version: number;
    };
    expect(spec.version).toBe(2);
  });
});
