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

// Fase B4 (C2): a proposta que sobe a versão de um pacote de biblioteca traz os arquivos
// em `proposals/<id>/specs/<pasta>/`; aplicar os COPIA para `specs/<pasta>/` pela sessão.

beforeEach(() => localStorage.clear());
afterEach(() => clearReportedErrors());

const DIR = 'specs/material3';
const FROM = 'proposals/P1/specs/material3';
const SPEC_FILE = `${DIR}/material3.spec.json`;

async function projectOnDisk(h: Harness): Promise<Project> {
  await h.session.flush();
  const parsed = deserialize((await h.root.read('mapping.json')) ?? '');
  if (!parsed.ok) throw new Error('mapping.json inválido');
  return parsed.project;
}

/** O projeto com o pacote v1 aplicado e gravado (com um documento que a v2 não terá). */
async function withV1(): Promise<{ h: Harness; v1: Spec }> {
  const h = await openHarness({ proposals: [] });
  const v1: Spec = { ...material3Spec(), version: 1 };
  const files = material3Package();
  files.set('docs/antigo.md', '# antigo');
  expect(h.session.actions.applySpecialization(v1, files).ok).toBe(true);
  await h.session.flush();
  return { h, v1 };
}

interface Staged {
  /** Arquivos a pôr em `proposals/P1/specs/material3/` (o pacote da v2 por padrão). */
  readonly files?: Map<string, string | Blob>;
}

/** Monta a proposta da v2 sobre o projeto aberto e deixa os arquivos onde o MCP deixaria. */
async function propose2(h: Harness, v1: Spec, staged: Staged = {}): Promise<Proposal> {
  const base = h.session.store.project.value;
  if (!base) throw new Error('sem projeto');
  const v2: Spec = { ...v1, version: 2 };
  const proposal = propose(
    base,
    updateSpecialization(base, v2, { packageSpecName: 'material3.spec.json' }),
    { id: 'P1' },
  );
  const files = staged.files ?? material3Package();
  if (!staged.files) {
    files.delete('material3.spec.json');
    files.set('docs/novo.md', '# novo');
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

describe('aplicar proposta com pacote de biblioteca', () => {
  it('copia o pacote para specs/<pasta>/, e desfazer e refazer trocam a pasta junto com a versão', async () => {
    const { h, v1 } = await withV1();
    const beforeFiles = await dirFiles(h);
    expect(beforeFiles).toContain(`${DIR}/docs/antigo.md`);
    const proposal = await propose2(h, v1);
    const spec = proposal.changes.find((c) => c.entity === 'specialization');
    expect(spec?.kind).toBe('update');

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    const result = await h.review.apply();
    expect(result).toMatchObject({ ok: true });

    // Pasta regravada com os arquivos novos; o `mapping.json` na versão 2.
    const after = await dirFiles(h);
    expect(after).toContain(`${DIR}/docs/novo.md`);
    expect(after).not.toContain(`${DIR}/docs/antigo.md`);
    expect(after).toContain(SPEC_FILE);
    expect(await h.root.read(`${DIR}/docs/novo.md`)).toBe('# novo');
    expect(await specVersionOnDisk(h)).toBe(2);
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
    // Copiados, não movidos: a proposta continua com os arquivos.
    expect(await h.root.read(`${FROM}/docs/novo.md`)).toBe('# novo');
    expect((await diskProposal(h.root)).applied).not.toEqual({});

    // Desfazer: versão 1 e os arquivos da pasta como eram.
    h.session.store.undo();
    await h.session.proposals.settled();
    await h.session.flush();
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(1);
    expect(await dirFiles(h)).toEqual(beforeFiles);
    expect(await specVersionOnDisk(h)).toBe(1);
    expect(await h.root.read(`${DIR}/docs/antigo.md`)).toBe('# antigo');
    expect(await h.root.read(`${FROM}/docs/novo.md`)).toBe('# novo');

    // Refazer: de volta à versão 2.
    h.session.store.redo();
    await h.session.proposals.settled();
    await h.session.flush();
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
    expect(await dirFiles(h)).toEqual(after);
    expect(await h.root.read(`${DIR}/docs/novo.md`)).toBe('# novo');
    expect(await specVersionOnDisk(h)).toBe(2);
  });

  it('o arquivo da especialização vem de to.spec: o da pasta da proposta, se houver, não vale', async () => {
    const { h, v1 } = await withV1();
    // O pacote traz o `material3.spec.json` ainda na v1.
    await propose2(h, v1, { files: material3Package() });
    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true });
    await h.session.flush();
    expect(await specVersionOnDisk(h)).toBe(2);
    expect((await projectOnDisk(h)).specializations[0]?.version).toBe(2);
  });

  it('pacote ausente na proposta: package-missing e nada muda', async () => {
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

  it('pacote inválido na proposta: package-invalid e nada muda', async () => {
    const { h, v1 } = await withV1();
    const files = material3Package();
    files.set('components/quebrado.json', '{ não é json');
    files.delete('material3.spec.json');
    // Um componente citado pela especialização some: erro de nível 1.
    const [firstComponent] = [...files.keys()].filter((p) => p.startsWith('components/'));
    if (firstComponent === undefined) throw new Error('sem componentes no pacote');
    files.set(firstComponent, '{ "format": "nada" }');
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

  it('a exportação leva os arquivos do pacote enquanto a mudança não foi aplicada, e não depois', async () => {
    const { h, v1 } = await withV1();
    await propose2(h, v1);
    const exported = async () =>
      [...(await h.session.collectFiles()).proposalImages.keys()].filter((path) =>
        path.startsWith(`${FROM}/`),
      );
    const before = await exported();
    expect(before).toContain(`${FROM}/docs/novo.md`);
    expect(before).toContain(`${FROM}/components/m3-button.json`);

    h.review.open('P1');
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(await h.review.apply()).toMatchObject({ ok: true });
    expect(await exported()).toEqual([]);
  });
});
