import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  parseSpec,
  updateSpecialization,
  type ComponentCatalog,
  type Project,
  type Proposal,
  type Spec,
} from '../../src/model';
import type { LoadedFont } from '../../src/model/components/library';
import type { FontRegistry } from '../../src/storage/fonts';
import { createEditorDerived } from '../../src/store/derived';
import { createProposedComponents } from '../../src/store/proposedCatalog';
import { createEditorUi } from '../../src/store/ui';
import { clearReportedErrors } from '../../src/utils/report';
import {
  COMPONENTS,
  SPEC_ID,
  SPEC_JSON,
  packageTexts,
  testCatalog,
} from '../model/componentFixtures';
import { emptyProject } from '../model/fixtures';
import { changeOf, propose } from '../model/proposalFixtures';
import { openHarness, type Harness } from './proposalHarness';

// Etapa Proposto com componentes (PC1): na visão Proposto o catálogo inclui os pacotes que a
// proposta cria ou atualiza, lidos de `proposals/<id>/<pasta>/`, sem gravar nada em `specs/`.

beforeEach(() => localStorage.clear());
afterEach(() => clearReportedErrors());

const rect = { x: 100, y: 100, width: 100, height: 40 };

function baseProject(): Project {
  return addContainer(emptyProject(), {
    id: 'I1',
    file: 'images/tela.png',
    width: 1000,
    height: 800,
  });
}

function specOf(id: string, version: number): Spec {
  const parsed = parseSpec({ ...SPEC_JSON, id, name: id, version });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const ids = (prefix: string) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

function withSpec(p: Project, spec: Spec, name: string): Project {
  return applySpecialization(p, spec, {
    newId: ids(`L-${spec.id}-`),
    packageSpecName: name,
  });
}

function withMarking(p: Project, id: string, specId: string): Project {
  const catalog: ComponentCatalog = new Map(
    [...testCatalog()].map(([, v]) => [specId, { ...v, specId }]),
  );
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId,
      typeId: 'text',
      rect,
    },
    approximateMeasurer,
  );
}

/** Texto de cada arquivo do pacote de `specs/<dir>/` no disco (`prefix` = onde ele espera). */
function packageFiles(
  dir: string,
  prefix = '',
  overrides: Record<string, string | null> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, text] of packageTexts(overrides)) {
    out[`${prefix}${path.replace('specs/test/', `specs/${dir}/`)}`] = text;
  }
  return out;
}

function setup(h: Harness) {
  const ui = createEditorUi();
  const derived = createEditorDerived(
    h.session.store,
    ui,
    h.review.derived.shownProject,
    h.review.components,
  );
  return { derived, components: h.review.components };
}

/** Abre a revisão e espera os pacotes (e a biblioteca) carregarem. */
async function open(h: Harness, view: 'current' | 'proposed') {
  expect(h.review.open('P1').ok).toBe(true);
  h.review.setView(view);
  await h.session.components.whenIdle();
  await h.review.components.whenIdle();
}

/** Proposta que cria `extra` (pacote em `proposals/P1/`) e uma marcação dele sobre `base`. */
function createsExtra(base: Project, id = 'extra'): { proposal: Proposal } {
  const after = withMarking(withSpec(base, specOf(id, 1), `${id}.spec.json`), 'E1', id);
  return { proposal: propose(base, after, { id: 'P1' }) };
}

function countReads(h: Harness) {
  const reads: string[] = [];
  const original = h.storage.readImage.bind(h.storage);
  vi.spyOn(h.storage, 'readImage').mockImplementation((path: string) => {
    reads.push(path);
    return original(path);
  });
  return reads;
}

async function specsOnDisk(h: Harness, dir: string): Promise<string[]> {
  return h.storage.listSpecDir(dir);
}

describe('catálogo do Proposto: especialização criada pela proposta', () => {
  it('Proposto tem os tipos do pacote e desenha a marcação criada; Atual não; nada vai a specs/', async () => {
    const base = baseProject();
    const { proposal } = createsExtra(base);
    const h = await openHarness({
      project: base,
      proposals: [proposal],
      files: packageFiles('extra', 'proposals/P1/'),
    });
    const { derived, components } = setup(h);
    await open(h, 'proposed');

    expect([...components.catalog.value.keys()]).toEqual(['extra']);
    expect([...(components.catalog.value.get('extra')?.byType.keys() ?? [])]).toContain(
      'text',
    );
    expect(derived.componentScenes.value.has('E1')).toBe(true);
    expect(derived.componentScenes.value.get('E1')?.annotationId).toBe('A_E1');

    h.review.setView('current');
    expect(components.catalog.value).toBe(h.session.components.catalog.value);
    expect(derived.componentScenes.value.size).toBe(0);

    await h.session.flush();
    expect(await specsOnDisk(h, 'specs/extra')).toEqual([]);
    expect(await h.root.read('specs/extra/extra.spec.json')).toBeNull();
    expect(h.session.components.catalog.value.size).toBe(0);
  });

  it('enquanto o pacote carrega, a marcação fica sem desenho', async () => {
    const base = baseProject();
    const { proposal } = createsExtra(base);
    const h = await openHarness({
      project: base,
      proposals: [proposal],
      files: packageFiles('extra', 'proposals/P1/'),
    });
    const { derived } = setup(h);
    expect(h.review.open('P1').ok).toBe(true);
    h.review.setView('proposed');
    expect(derived.componentScenes.value.size).toBe(0);
    await h.review.components.whenIdle();
    expect(derived.componentScenes.value.has('E1')).toBe(true);
  });

  it('pacote sem os arquivos: entrada com o motivo, sem desenho e sem nova leitura', async () => {
    const base = baseProject();
    const { proposal } = createsExtra(base);
    const h = await openHarness({ project: base, proposals: [proposal] });
    const { derived, components } = setup(h);
    const reads = countReads(h);
    await open(h, 'proposed');
    const problems = components.catalog.value.get('extra')?.problems ?? [];
    expect(problems.length).toBeGreaterThan(0);
    expect(derived.componentScenes.value.size).toBe(0);
    const n = reads.length;
    h.review.setView('current');
    h.review.setView('proposed');
    await h.review.components.whenIdle();
    expect(reads.length).toBe(n);
  });
});

describe('catálogo do Proposto: especialização atualizada pela proposta', () => {
  const v2Text = {
    ...(COMPONENTS.text as Record<string, unknown>),
    name: 'Texto v2',
  };

  async function updating() {
    const v1 = withMarking(
      withSpec(baseProject(), specOf(SPEC_ID, 1), 'test.spec.json'),
      'T1',
      SPEC_ID,
    );
    const v2 = specOf(SPEC_ID, 2);
    const after = updateSpecialization(v1, v2, { packageSpecName: 'test.spec.json' });
    const proposal = propose(v1, after, { id: 'P1' });
    const h = await openHarness({
      project: v1,
      proposals: [proposal],
      files: {
        'specs/test/test.spec.json': JSON.stringify(specOf(SPEC_ID, 1)),
        ...packageFiles('test'),
        ...packageFiles('test', 'proposals/P1/', {
          'specs/test/components/text.json': JSON.stringify(v2Text),
        }),
      },
    });
    return { h, proposal };
  }

  it('Proposto usa os componentes da versão proposta; Atual, os da aplicada', async () => {
    const { h } = await updating();
    const { derived, components } = setup(h);
    await open(h, 'current');
    const applied = h.session.components.catalog.value.get(SPEC_ID);
    expect(applied?.version).toBe(1);
    expect(components.catalog.value).toBe(h.session.components.catalog.value);
    const sceneV1 = derived.componentScenes.value.get('T1');
    expect(sceneV1).toBeDefined();

    h.review.setView('proposed');
    const proposed = components.catalog.value.get(SPEC_ID);
    expect(proposed?.version).toBe(2);
    expect(proposed?.byType.get('text')?.name).toBe('Texto v2');
    expect(applied?.byType.get('text')?.name).not.toBe('Texto v2');
    expect(derived.componentScenes.value.get('T1')).toBeDefined();
    expect(derived.componentScenes.value.get('T1')).not.toBe(sceneV1);

    h.review.setView('current');
    expect(components.catalog.value.get(SPEC_ID)).toBe(applied);
  });
});

describe('catálogo do Proposto: identidade e leituras', () => {
  async function withExtra(given?: { proposal: Proposal }) {
    const base = withMarking(
      withSpec(baseProject(), specOf(SPEC_ID, 1), 'test.spec.json'),
      'T1',
      SPEC_ID,
    );
    const { proposal } = given ?? createsExtra(base);
    const h = await openHarness({
      project: base,
      proposals: [proposal],
      files: {
        'specs/test/test.spec.json': JSON.stringify(specOf(SPEC_ID, 1)),
        ...packageFiles('test'),
        ...packageFiles('extra', 'proposals/P1/'),
      },
    });
    return { h, proposal };
  }

  it('o que a proposta não muda é o mesmo objeto da base', async () => {
    const { h } = await withExtra();
    const { components } = setup(h);
    await open(h, 'proposed');
    const catalog = components.catalog.value;
    expect([...catalog.keys()].sort()).toEqual(['extra', SPEC_ID]);
    expect(catalog.get(SPEC_ID)).toBe(h.session.components.catalog.value.get(SPEC_ID));
    expect(components.catalog.value).toBe(catalog);
  });

  it('proposta sem pacote: o catálogo é o objeto da base nas duas visões', async () => {
    const base = withSpec(baseProject(), specOf(SPEC_ID, 1), 'test.spec.json');
    const after = { ...base, project: { ...base.project, name: 'Outro' } };
    const h = await openHarness({
      project: base,
      proposals: [propose(base, after, { id: 'P1' })],
      files: {
        'specs/test/test.spec.json': JSON.stringify(specOf(SPEC_ID, 1)),
        ...packageFiles('test'),
      },
    });
    const { components } = setup(h);
    await open(h, 'proposed');
    expect(components.catalog.value).toBe(h.session.components.catalog.value);
    h.review.setView('current');
    expect(components.catalog.value).toBe(h.session.components.catalog.value);
  });

  it('trocar de visão e decidir não leem de novo nem reinstanciam as outras marcações', async () => {
    const { h, proposal } = await withExtra();
    const { derived, components } = setup(h);
    const reads = countReads(h);
    await open(h, 'proposed');
    const n = reads.length;
    expect(n).toBeGreaterThan(0);
    const catalog = components.catalog.value;
    const t1 = derived.componentScenes.value.get('T1');
    expect(t1).toBeDefined();
    expect(derived.componentScenes.value.has('E1')).toBe(true);

    h.review.setView('current');
    expect(derived.componentScenes.value.get('T1')).toBe(t1);
    h.review.setView('proposed');
    expect(components.catalog.value).toBe(catalog);
    expect(derived.componentScenes.value.get('T1')).toBe(t1);
    // E1 só existe no Proposto: o cache a soltou na Atual, e a de agora vale até decidir.
    const e1 = derived.componentScenes.value.get('E1');
    expect(e1).toBeDefined();

    const markingChange = changeOf(proposal, 'marking', 'E1').id;
    await h.review.decide({ level: 'change', id: markingChange }, 'accepted');
    await h.review.components.whenIdle();
    expect(derived.componentScenes.value.get('E1')).toBe(e1);
    expect(derived.componentScenes.value.get('T1')).toBe(t1);
    await h.review.decide({ level: 'proposal', id: null }, 'rejected');
    await h.review.components.whenIdle();
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    await h.review.components.whenIdle();

    expect(reads.length).toBe(n);
    expect(components.catalog.value).toBe(catalog);
    expect(components.catalog.value.get(SPEC_ID)).toBe(
      h.session.components.catalog.value.get(SPEC_ID),
    );
    expect(derived.componentScenes.value.get('T1')).toBe(t1);
    expect(derived.componentScenes.value.get('E1')).toBe(e1);
  });

  it('especialização rejeitada com a marcação pendente: a marcação fica sem desenho', async () => {
    const { proposal } = await withExtra();
    const specChange = changeOf(proposal, 'specialization', 'extra').id;
    // A decisão vem gravada por fora: decidir pela app rejeitaria a marcação junto (dependência).
    const rejected: Proposal = {
      ...proposal,
      decisions: { [specChange]: { state: 'rejected', at: proposal.createdAt } },
    };
    const h = (await withExtra({ proposal: rejected })).h;
    const { derived, components } = setup(h);
    const reads = countReads(h);
    await open(h, 'proposed');
    // O pacote carrega do mesmo jeito: a decisão não impede a leitura.
    expect(reads.length).toBeGreaterThan(0);
    const shown = h.review.derived.shownProject.value;
    expect(shown?.markings.some((m) => m.id === 'E1')).toBe(true);
    expect(shown?.specializations.some((s) => s.id === 'extra')).toBe(false);
    expect(components.catalog.value.has('extra')).toBe(false);
    expect(derived.componentScenes.value.has('E1')).toBe(false);
    expect(derived.componentScenes.value.has('T1')).toBe(true);
  });
});

describe('catálogo do Proposto: fontes', () => {
  function fakeRegistry() {
    const register = vi.fn(async (fonts: readonly LoadedFont[]) =>
      fonts.map((font) => ({ font, status: 'loaded' as const })),
    );
    const clear = vi.fn();
    return { register, clear, registry: { register, clear } as unknown as FontRegistry };
  }

  it('registra as fontes do pacote ao abrir, não troca com a visão e limpa ao fechar', async () => {
    const withFont: Spec = {
      ...specOf('extra', 1),
      fonts: [{ family: 'Test Sans', file: 'fonts/test.ttf', weight: 400 }],
    };
    const base = baseProject();
    const after = withMarking(withSpec(base, withFont, 'extra.spec.json'), 'E1', 'extra');
    const proposal = propose(base, after, { id: 'P1' });
    const h = await openHarness({
      project: base,
      proposals: [proposal],
      files: {
        ...packageFiles('extra', 'proposals/P1/'),
        'proposals/P1/specs/extra/fonts/test.ttf': 'FONTBYTES',
      },
    });
    const fake = fakeRegistry();
    // Pelo estado da revisão: a proposta abre, as fontes entram; a visão não mexe nelas.
    const own = createProposedComponents({
      base: h.session.components,
      proposal: h.review.derived.proposal,
      view: h.review.view,
      shown: h.review.derived.shownProject,
      read: (path) => h.session.readImage(path),
      fonts: fake.registry,
    });
    expect(h.review.open('P1').ok).toBe(true);
    await own.whenIdle();
    expect(fake.register).toHaveBeenCalledTimes(1);
    const registered = fake.register.mock.calls[0]?.[0] ?? [];
    expect(registered.map((f) => f.family)).toEqual(['Test Sans']);
    expect(registered[0]?.bytes?.byteLength).toBe('FONTBYTES'.length);
    const epoch = own.fontsEpoch.value;

    h.review.setView('proposed');
    h.review.setView('current');
    await h.review.decide({ level: 'proposal', id: null }, 'rejected');
    await own.whenIdle();
    expect(own.fontsEpoch.value).toBe(epoch);
    expect(fake.register).toHaveBeenCalledTimes(1);

    h.review.close();
    await own.whenIdle();
    expect(fake.register).toHaveBeenLastCalledWith([]);
    own.dispose();
    expect(fake.clear).toHaveBeenCalled();
  });
});
