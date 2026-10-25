import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { deserialize, parseProposalText, type Proposal } from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import { createEditorDerived } from '../../src/store/derived';
import { createEditorUi } from '../../src/store/ui';
import {
  SHOWCASE_NAMES,
  SHOWCASE_PROPOSAL_ID,
  showcase,
  showcaseZip,
} from '../e2e/proposedComponentsFixture';
import { openHarness } from '../store/proposalHarness';

// `examples/proposta-componentes.zip`: o projeto "Telas" com uma proposta aberta de componentes
// novos, para o roteiro R13 (Proposto com componentes) do docs/TESTING.md. O zip sai de
// `tests/e2e/proposedComponentsFixture.ts`; este teste confere que ele está em dia e que, ao
// abrir, a revisão tem os estados que o roteiro descreve. Para gerar de novo:
// `npm run build:proposal-components`.

const EXAMPLE = 'examples/proposta-componentes.zip';
const HINT = 'Rode `npm run build:proposal-components` para regerar o zip.';

beforeEach(() => localStorage.clear());

async function readExample() {
  const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
  if (!read.ok) throw new Error(`zip ilegível: ${read.error}`);
  const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
  if (!parsed.ok) throw new Error(`mapping.json inválido: ${parsed.error.code}`);
  const text = read.files.proposals.get(
    `proposals/${SHOWCASE_PROPOSAL_ID}/proposal.json`,
  );
  const proposal = text ? parseProposalText(text) : null;
  if (!proposal?.ok) throw new Error('proposal.json inválido');
  return { project: parsed.project, proposal: proposal.proposal };
}

describe('zip de exemplo com componentes novos na proposta', () => {
  it('examples/proposta-componentes.zip está em dia com o gerador', async () => {
    const expected = showcase().files;
    if (process.env.UPDATE_EXAMPLES === '1') {
      writeFileSync(EXAMPLE, await showcaseZip());
    }
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      expect(await zip.file(path)?.async('string'), `${path}. ${HINT}`).toBe(content);
    }
  });

  it('o pacote specs/material3/ do zip é uma biblioteca válida (sem erro no Diagnóstico)', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const prefix = 'specs/material3/';
    const files: LibraryFile[] = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith(prefix)) continue;
      files.push({ path: name.slice(prefix.length), text: await entry.async('string') });
    }
    const report = validateLibrary({ files, specPath: 'material3.spec.json' });
    expect(report.errors.map((i) => `${i.file} ${i.path} ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a app lê o zip: o projeto e a proposta aberta com as decisões gravadas', async () => {
    const { project, proposal } = await readExample();
    expect(project.containers).toHaveLength(1);
    expect(project.markings.map((m) => m.name)).toEqual([SHOWCASE_NAMES.existing]);
    expect(proposal.status).toBe('open');
    const ids = showcase().createIds;
    const stateOf = (id: string) => proposal.decisions[id]?.state ?? null;
    expect(stateOf(ids.pending)).toBeNull();
    expect(stateOf(ids.accepted)).toBe('accepted');
    expect(stateOf(ids.rejected)).toBe('rejected');
    expect(stateOf(ids.invalid)).toBe('accepted');
    expect(stateOf(ids.noLabel)).toBeNull();
    expect(stateOf(ids.package)).toBeNull();
  });

  it('na revisão: pendente, aceito, rejeitado, inválido, sem rótulo, do pacote e alterado', async () => {
    const { project, proposal } = await readExample();
    const files: Record<string, string> = {};
    for (const [path, text] of showcase().files) {
      if (path !== 'mapping.json' && !path.endsWith('/proposal.json')) files[path] = text;
    }
    const h = await openHarness({
      project,
      proposals: [proposal as Proposal],
      files,
    });
    const ui = createEditorUi();
    const derived = createEditorDerived(
      h.session.store,
      ui,
      h.review.derived.shownProject,
      h.review.components,
    );
    expect(h.review.open(SHOWCASE_PROPOSAL_ID).ok).toBe(true);
    h.review.setView('proposed');
    await h.session.components.whenIdle();
    await h.review.components.whenIdle();

    const shown = h.review.derived.shownProject.value;
    const idOf = (name: string) => shown?.markings.find((m) => m.name === name)?.id;
    const scenes = derived.componentScenes.value;
    const ids = showcase().createIds;

    // Desenhados no Proposto: existente, pendente, aceito, inválido, sem rótulo, do pacote.
    for (const name of [
      SHOWCASE_NAMES.existing,
      SHOWCASE_NAMES.pending,
      SHOWCASE_NAMES.accepted,
      SHOWCASE_NAMES.invalid,
      SHOWCASE_NAMES.noLabel,
      SHOWCASE_NAMES.package,
    ]) {
      const id = idOf(name);
      expect(id, name).toBeDefined();
      expect(scenes.has(id ?? ''), name).toBe(true);
    }
    // Rejeitado: a marcação não existe na visão Proposto (só o fantasma, desenhado pelo canvas).
    expect(idOf(SHOWCASE_NAMES.rejected)).toBeUndefined();
    expect(scenes.size).toBe(6);

    // O inválido está no conjunto que bloqueia Aplicar; os outros, não.
    const invalid = h.review.derived.invalid.value.changeIds;
    expect(invalid.has(ids.invalid)).toBe(true);
    for (const key of [
      'pending',
      'accepted',
      'rejected',
      'noLabel',
      'package',
    ] as const) {
      expect(invalid.has(ids[key]), key).toBe(false);
    }

    // O "Sem rótulo" leva a pendência de incompleta; o "Pendente" não.
    const incomplete = derived.incompleteMarkings.value;
    expect(incomplete.has(idOf(SHOWCASE_NAMES.noLabel) ?? '')).toBe(true);
    expect(incomplete.has(idOf(SHOWCASE_NAMES.pending) ?? '')).toBe(false);

    // O existente aparece com o valor proposto.
    const existing = shown?.annotations.find(
      (a) => a.markingId === idOf(SHOWCASE_NAMES.existing),
    );
    expect(existing?.values?.label).toBe('Novo valor');

    // Atual: nenhum componente criado; nada gravado em specs/ antes de aplicar.
    h.review.setView('current');
    expect(derived.componentScenes.value.size).toBe(1);
    expect(await h.root.read('specs/m3novo/m3novo.spec.json')).toBeNull();
  });
});
