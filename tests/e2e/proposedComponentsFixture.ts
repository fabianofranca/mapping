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

// Proposed-with-components stage: projects and proposals built by the model, with the packages of the
// `material3-compose` library (`libraries/material3-compose`). Used by the e2e (`proposedComponents.spec.ts`)
// and by the zip `examples/proposta-componentes.zip` (script R13 of `docs/TESTING.md`).
// pt-BR kept: shared fixture data (project 'Telas', proposal 'Componentes novos', marking names, labels) asserted by
// tests/examples, tests/store, tests/components and the e2e specs

export const PACKAGE_DIR = 'libraries/material3-compose';
export const NOW = '2026-10-24T12:00:00.000Z';

/** Material 3 component files (path relative to the package → text). */
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
 * All the package files (relative path → content), sorted: text as a string and the
 * fonts (`.woff2`) as bytes.
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

/**
 * The Material 3 specialization with another `id` (to simulate a package the proposal brings).
 * With the library's `id` it keeps its name ("Material 3 (Compose)"); with another, the name is the `id`.
 */
export function loadSpec(id: string): Spec {
  const raw = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'material3-compose.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  const parsed = parseSpec({
    ...raw,
    id,
    name: id === raw.id ? raw.name : id,
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Catalog of a specialization whose package is in `specs/<id>/`. */
export function catalogOf(spec: Spec, texts: Map<string, string>): ComponentCatalog {
  const file = `specs/${spec.id}/${spec.id}.spec.json`;
  const loaded = loadSpecComponents(spec, file, spec.version, (path) =>
    texts.get(path.replace(`specs/${spec.id}/`, '')),
  );
  return new Map([[spec.id, loaded]]);
}

/** The base project files: `mapping.json`, `specs/` and the Material 3 package. */
function baseFiles(base: Project): Map<string, string | Buffer> {
  const files = new Map<string, string | Buffer>([['mapping.json', serialize(base)]]);
  for (const [path, text] of specFiles(base)) files.set(path, text);
  // The whole package (components, docs, examples, fonts): the app's Diagnostics checks it.
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
// Simple e2e fixture: an already applied type (`material3-compose`) and one from the proposal package.

export const PROPOSAL_ID = 'telas-novas';

/** The project "Telas" (Material 3 applied, blank screen 360 × 800). */
function baseProject(counter: { n: number }): Project {
  let base = createProject({
    id: '00000000-0000-4000-8000-000000000e2e',
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
 * The project "Telas" and the proposal that creates in it a Button of an already applied type (`material3-compose`) and
 * one from a package the proposal brings (`m3novo`).
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
// Sample proposal of script R13 (`examples/proposta-componentes.zip`).

export const SHOWCASE_PROPOSAL_ID = 'componentes-novos';
export const SHOWCASE_PROPOSAL_TITLE = 'Componentes novos';
/** Fixed date on the zip entries: the same content always generates the same bytes. */
const ENTRY_DATE = new Date('2026-10-24T00:00:00Z');

/** The names of the markings created by the proposal, per script case. */
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
  /**
   * Id of the marking creation change, per case (`marking:create`); in "invalid", that of the
   * tampered annotation creation (`annotation:create`), which is the one the review points at; in
   * `acceptedAnnotation`, that of the "accepted" annotation (decided, so that Aceito is not left partial).
   */
  readonly createIds: Readonly<
    Record<
      Exclude<keyof typeof SHOWCASE_NAMES, 'existing'> | 'acceptedAnnotation',
      string
    >
  >;
  readonly files: Map<string, string | Buffer>;
}

/**
 * The project "Telas" (a blank 360 × 800 screen and the existing component "Existente") and the
 * open proposal "Componentes novos": a new pending Button, an accepted one, a rejected one, an
 * accepted and invalid one (a small `text-field` that does not fit, with the annotation created in a layer that does not exist), one without the required label, one of a type
 * from the proposal package (`m3novo`) and the "Existente" with the label changed. The decisions are already
 * written in `proposal.json`.
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
    typeId = 'button',
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
        typeId,
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
    ['N5', SHOWCASE_NAMES.noLabel, 'material3-compose', 460, { label: '' }],
    ['N6', SHOWCASE_NAMES.package, 'm3novo', 540, { label: 'Do pacote' }],
  ];
  for (const [id, name, specId, y, values] of creations) {
    // The Inválido is a `text-field` (the `button` and the `chip`, with a root without layout and content that hugs the text, do not give
    // "does not fit" until #1078 also warns on the `none` parent); the rectangle is shrunk below.
    const typeId = id === 'N4' ? 'text-field' : 'button';
    after = renameMarking(button(after, id, specId, y, values, 180, typeId), id, name);
  }
  const built = buildProposal(base, after, {
    id: SHOWCASE_PROPOSAL_ID,
    title: SHOWCASE_PROPOSAL_TITLE,
    createdAt: NOW,
  });

  // The "Inválido": a `text-field` (Rótulo `Inválido`) of 40×32 in the top-left corner, smaller than the
  // content (`component-overflow`: the component does not fit); the created annotation sits in a layer that
  // does not exist (`missing-layer`), which the review marks as invalid. Incomplete lists both
  // reasons (R13.9).
  const createOf = (markingId: string) => {
    const found = built.changes.find(
      (c) => c.entity === 'marking' && c.entityId === markingId && c.kind === 'create',
    );
    if (!found) throw new Error(`no creation change for ${markingId}`);
    return found;
  };
  const annotationOf = (markingId: string) => {
    const found = built.changes.find(
      (c) =>
        c.entity === 'annotation' &&
        c.entityId === `A_${markingId}` &&
        c.kind === 'create',
    );
    if (!found) throw new Error(`no annotation creation change for ${markingId}`);
    return found;
  };
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const tampered: Proposal = {
    ...built,
    changes: built.changes.map((c) => {
      if (!isRecord(c.to)) return c;
      if (c.id === annotationOf('N4').id)
        return { ...c, to: { ...c.to, layerId: 'GHOST' } };
      if (c.id === createOf('N4').id)
        return { ...c, to: { ...c.to, rect: { x: 20, y: 364, width: 40, height: 32 } } };
      return c;
    }),
  };

  let proposal = tampered;
  for (const [change, state] of [
    [createOf('N2'), 'accepted'],
    [annotationOf('N2'), 'accepted'],
    [createOf('N3'), 'rejected'],
    [createOf('N4'), 'accepted'],
    [annotationOf('N4'), 'accepted'],
  ] as const) {
    const result = decide(
      proposal,
      reviewTree(proposal, base),
      { level: 'change', id: change.id },
      state,
      NOW,
    );
    if (!result.ok) throw new Error(`decision for ${change.entityId}: ${result.reason}`);
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
      acceptedAnnotation: annotationOf('N2').id,
      rejected: createOf('N3').id,
      invalid: annotationOf('N4').id,
      noLabel: createOf('N5').id,
      package: createOf('N6').id,
    },
    files,
  };
}

/** The bytes of `examples/proposta-componentes.zip` (deterministic). */
export async function showcaseZip(): Promise<Buffer> {
  return zipOf(showcase().files, ENTRY_DATE);
}
