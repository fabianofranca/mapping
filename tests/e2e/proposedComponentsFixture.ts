import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  buildProposal,
  createProject,
  decide,
  loadSpecComponents,
  parseSpec,
  proposalFilePath,
  renameMarking,
  reviewTree,
  serialize,
  serializeProposal,
  serializeSpec,
  setFieldValue,
  specFiles,
  type ComponentCatalog,
  type Project,
  type Proposal,
  type Spec,
} from '../../src/model';

// Etapa Proposto com componentes: projetos e propostas montados pelo modelo, com os pacotes do
// biblioteca `material3-compose` (`libraries/material3-compose`). Usado pelo e2e (`proposedComponents.spec.ts`)
// e pelo zip `examples/proposta-componentes.zip` (roteiro R13 do `docs/TESTING.md`).

export const PACKAGE_DIR = 'libraries/material3-compose';
export const NOW = '2026-10-24T12:00:00.000Z';

/** Arquivos de componente do Material 3 (caminho relativo ao pacote → texto). */
export function componentTexts(): Map<string, string> {
  const dir = join(PACKAGE_DIR, 'components');
  return new Map(
    readdirSync(dir)
      .sort()
      .map((name) => [`components/${name}`, readFileSync(join(dir, name), 'utf8')]),
  );
}

const TEXT_EXTENSIONS = /\.(json|md|txt)$/;

/**
 * Todos os arquivos do pacote (caminho relativo → conteúdo), ordenados: texto como string e as
 * fontes (`.woff2`) como bytes.
 */
export function packageTexts(): Map<string, string | Buffer> {
  const out = new Map<string, string | Buffer>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out.set(
          relative(PACKAGE_DIR, full).split('\\').join('/'),
          TEXT_EXTENSIONS.test(name) ? readFileSync(full, 'utf8') : readFileSync(full),
        );
    }
  };
  walk(PACKAGE_DIR);
  return out;
}

/** A especialização do Material 3 com outro `id` (para simular um pacote que a proposta traz). */
export function loadSpec(id: string): Spec {
  const raw = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'material3-compose.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  const parsed = parseSpec({ ...raw, id, name: id });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Catálogo de uma especialização cujo pacote está em `specs/<id>/`. */
export function catalogOf(spec: Spec, texts: Map<string, string>): ComponentCatalog {
  const file = `specs/${spec.id}/${spec.id}.spec.json`;
  const loaded = loadSpecComponents(spec, file, spec.version, (path) =>
    texts.get(path.replace(`specs/${spec.id}/`, '')),
  );
  return new Map([[spec.id, loaded]]);
}

/** Os arquivos do projeto base: `mapping.json`, `specs/` e o pacote do Material 3. */
function baseFiles(base: Project): Map<string, string | Buffer> {
  const files = new Map<string, string | Buffer>([['mapping.json', serialize(base)]]);
  for (const [path, text] of specFiles(base)) files.set(path, text);
  // O pacote inteiro (componentes, docs, exemplos, fontes): o Diagnóstico da app o confere.
  for (const [path, text] of packageTexts()) {
    const target = `specs/material3-compose/${path}`;
    if (!files.has(target)) files.set(target, text);
  }
  return files;
}

async function zipOf(files: Map<string, string | Buffer>, date?: Date): Promise<Buffer> {
  const zip = new JSZip();
  for (const path of [...files.keys()].sort()) {
    zip.file(path, files.get(path) ?? '', {
      createFolders: false,
      ...(date && { date }),
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

// ---------------------------------------------------------------------------------------
// Fixture simples do e2e: um tipo já aplicado (`material3-compose`) e um do pacote da proposta.

export const PROPOSAL_ID = 'telas-novas';

/** O projeto "Telas" (Material 3 aplicado, tela em branco 360 × 800). */
function baseProject(counter: { n: number }): Project {
  let base = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  base = applySpecialization(base, loadSpec('material3-compose'), {
    newId: () => `LS${++counter.n}`,
    packageSpecName: 'material3-compose.spec.json',
  });
  return addBackgroundContainer(base, {
    id: 'B1',
    name: 'Tela',
    width: 360,
    height: 800,
    background: '#FFFFFF',
    center: { x: 180, y: 400 },
  });
}

/**
 * O projeto "Telas" e a proposta que cria nela um Button de tipo já aplicado (`material3-compose`) e
 * um de um pacote que a proposta traz (`m3novo`).
 */
export async function fixtureZip(): Promise<Buffer> {
  const texts = componentTexts();
  const applied = loadSpec('material3-compose');
  const extra = loadSpec('m3novo');
  const counter = { n: 0 };
  const base = baseProject(counter);
  let after = applySpecialization(base, extra, {
    newId: () => `LS${++counter.n}`,
    packageSpecName: 'm3novo.spec.json',
  });
  const catalog: ComponentCatalog = new Map([
    ...catalogOf(applied, texts),
    ...catalogOf(extra, texts),
  ]);
  for (const [markingId, specId, y] of [
    ['N1', 'material3-compose', 100],
    ['N2', 'm3novo', 300],
  ] as const) {
    after = addComponentMarking(
      after,
      catalog,
      {
        markingId,
        annotationId: `A_${markingId}`,
        containerId: 'B1',
        parentId: null,
        specId,
        typeId: 'button',
        center: { x: 180, y },
        values: { label: 'Pagar' },
      },
      approximateMeasurer,
    );
  }
  const proposal = buildProposal(base, after, {
    id: PROPOSAL_ID,
    title: 'Telas novas',
    createdAt: NOW,
  });
  const files = baseFiles(base);
  files.set(proposalFilePath(PROPOSAL_ID), serializeProposal(proposal));
  const pkg = `proposals/${PROPOSAL_ID}/specs/m3novo`;
  files.set(`${pkg}/m3novo.spec.json`, serializeSpec(extra));
  for (const [path, text] of packageTexts()) {
    if (path !== 'material3-compose.spec.json') files.set(`${pkg}/${path}`, text);
  }
  return zipOf(files);
}

// ---------------------------------------------------------------------------------------
// Proposta de exemplo do roteiro R13 (`examples/proposta-componentes.zip`).

export const SHOWCASE_PROPOSAL_ID = 'componentes-novos';
export const SHOWCASE_PROPOSAL_TITLE = 'Componentes novos';
/** Data fixa nas entradas do zip: o mesmo conteúdo gera sempre os mesmos bytes. */
const ENTRY_DATE = new Date('2026-10-24T00:00:00Z');

/** Os nomes das marcações criadas pela proposta, por caso do roteiro. */
export const SHOWCASE_NAMES = {
  existing: 'Existente',
  pending: 'Pendente',
  accepted: 'Aceito',
  rejected: 'Rejeitado',
  invalid: 'Inválido',
  noLabel: 'Sem rótulo',
  package: 'Do pacote',
} as const;

export interface Showcase {
  readonly base: Project;
  readonly proposal: Proposal;
  /** Id da mudança de criação da marcação, por caso (`marking:create`). */
  readonly createIds: Readonly<
    Record<Exclude<keyof typeof SHOWCASE_NAMES, 'existing'>, string>
  >;
  readonly files: Map<string, string | Buffer>;
}

/**
 * O projeto "Telas" (uma tela em branco 360 × 800 e o componente existente "Existente") e a
 * proposta aberta "Componentes novos": um Button novo pendente, um aceito, um rejeitado, um
 * aceito e inválido (retângulo menor que o mínimo), um sem o rótulo obrigatório, um de um tipo
 * do pacote da proposta (`m3novo`) e o "Existente" com o rótulo alterado. As decisões já estão
 * gravadas em `proposal.json`.
 */
export function showcase(): Showcase {
  const texts = componentTexts();
  const applied = loadSpec('material3-compose');
  const extra = loadSpec('m3novo');
  const counter = { n: 0 };
  const catalog: ComponentCatalog = new Map([
    ...catalogOf(applied, texts),
    ...catalogOf(extra, texts),
  ]);
  const button = (
    p: Project,
    id: string,
    specId: string,
    y: number,
    values: Record<string, string>,
    x = 180,
  ): Project =>
    addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: 'B1',
        parentId: null,
        specId,
        typeId: 'button',
        center: { x, y },
        values,
      },
      approximateMeasurer,
    );

  const base = renameMarking(
    button(baseProject(counter), 'N0', 'material3-compose', 60, { label: 'Antigo' }),
    'N0',
    SHOWCASE_NAMES.existing,
  );

  let after = applySpecialization(base, extra, {
    newId: () => `LS${++counter.n}`,
    packageSpecName: 'm3novo.spec.json',
  });
  after = setFieldValue(after, 'A_N0', 'label', 'Novo valor');
  const creations: readonly [string, string, string, number, Record<string, string>][] = [
    ['N1', SHOWCASE_NAMES.pending, 'material3-compose', 140, { label: 'Pendente' }],
    ['N2', SHOWCASE_NAMES.accepted, 'material3-compose', 220, { label: 'Aceito' }],
    ['N3', SHOWCASE_NAMES.rejected, 'material3-compose', 300, { label: 'Rejeitado' }],
    ['N4', SHOWCASE_NAMES.invalid, 'material3-compose', 380, { label: 'Inválido' }],
    ['N5', SHOWCASE_NAMES.noLabel, 'material3-compose', 460, {}],
    ['N6', SHOWCASE_NAMES.package, 'm3novo', 540, { label: 'Do pacote' }],
  ];
  for (const [id, name, specId, y, values] of creations) {
    after = renameMarking(button(after, id, specId, y, values), id, name);
  }
  const built = buildProposal(base, after, {
    id: SHOWCASE_PROPOSAL_ID,
    title: SHOWCASE_PROPOSAL_TITLE,
    createdAt: NOW,
  });

  // O "Inválido": a criação adulterada fica menor que o mínimo de marcação.
  const createOf = (markingId: string) => {
    const found = built.changes.find(
      (c) => c.entity === 'marking' && c.entityId === markingId && c.kind === 'create',
    );
    if (!found) throw new Error(`sem mudança de criação de ${markingId}`);
    return found;
  };
  const tampered: Proposal = {
    ...built,
    changes: built.changes.map((c) =>
      c.id === createOf('N4').id &&
      typeof c.to === 'object' &&
      c.to !== null &&
      !Array.isArray(c.to)
        ? { ...c, to: { ...c.to, rect: { x: 20, y: 380, width: 3, height: 3 } } }
        : c,
    ),
  };

  let proposal = tampered;
  for (const [markingId, state] of [
    ['N2', 'accepted'],
    ['N3', 'rejected'],
    ['N4', 'accepted'],
  ] as const) {
    const result = decide(
      proposal,
      reviewTree(proposal, base),
      { level: 'change', id: createOf(markingId).id },
      state,
      NOW,
    );
    if (!result.ok) throw new Error(`decisão de ${markingId}: ${result.reason}`);
    proposal = { ...proposal, decisions: result.decisions };
  }

  const files = baseFiles(base);
  files.set(proposalFilePath(SHOWCASE_PROPOSAL_ID), serializeProposal(proposal));
  const pkg = `proposals/${SHOWCASE_PROPOSAL_ID}/specs/m3novo`;
  files.set(`${pkg}/m3novo.spec.json`, serializeSpec(extra));
  for (const [path, text] of packageTexts()) {
    if (path !== 'material3-compose.spec.json') files.set(`${pkg}/${path}`, text);
  }

  return {
    base,
    proposal,
    createIds: {
      pending: createOf('N1').id,
      accepted: createOf('N2').id,
      rejected: createOf('N3').id,
      invalid: createOf('N4').id,
      noLabel: createOf('N5').id,
      package: createOf('N6').id,
    },
    files,
  };
}

/** Os bytes de `examples/proposta-componentes.zip` (determinísticos). */
export async function showcaseZip(): Promise<Buffer> {
  return zipOf(showcase().files, ENTRY_DATE);
}
