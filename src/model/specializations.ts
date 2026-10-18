import { fail } from './errors';
import { projectIssues, type AnnotationIssue } from './issues';
import {
  runLibraryMigrations,
  type MigrationLoss,
  type MigrationRun,
  type MigrationStepReport,
} from './libraryMigrations';
import { countBrokenRefs, type LabelTexts } from './refs';
import type { Spec, SpecLayer, SpecMigrationStep } from './spec';
import { isPackageFile } from './libraryPackage';
import { findTypeInSpec, getSpecialization } from './specLookup';
import {
  diffSpecs,
  migrationChain,
  missingMigrations,
  type SpecChange,
} from './specVersions';
import { annotationsOfSpec, freeVersionOf } from './typed';
import type { Annotation, Layer, Project, ProjectSpecialization } from './types';

// Ciclo de vida da especialização no projeto: aplicar, atualizar e remover.
// Ver docs/history/PLAN-etapas-1-2.md 13.4. O conteúdo fica em `specializations[].spec` (em memória) e é
// gravado em `specs/<id>.json` pelo armazenamento; por isso o desfazer cobre tudo.

/** Pasta das cópias das especializações, relativa à raiz do projeto. */
export const SPECS_DIR = 'specs';

export interface SpecOpOptions {
  /** Gera os ids das camadas e tuplas novas. Padrão: `crypto.randomUUID()`. */
  readonly newId?: () => string;
  /** Textos usados ao converter referências em texto. */
  readonly texts?: LabelTexts;
  /**
   * Nome do arquivo da especialização dentro do pacote (`material3.spec.json`): a cópia é a
   * pasta `specs/<id>/` e o `file` aponta para ele. Sem ele, a cópia é `specs/<id>.json`.
   */
  readonly packageSpecName?: string;
}

/**
 * `specs/<id>.json` (v1 a v3), com o id limpo para nome de arquivo e sem colidir com outro.
 * Com `packageSpecName` (pacote da biblioteca): `specs/<id>/<packageSpecName>`, a pasta também
 * sem colidir com a de outra especialização.
 */
export function specFileFor(
  p: Project,
  specId: string,
  packageSpecName?: string,
): string {
  const base = specId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '') || 'spec';
  const others = p.specializations.filter((s) => s.id !== specId).map((s) => s.file);
  if (packageSpecName !== undefined) {
    const name = packageSpecName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '');
    const takenDirs = new Set(others.map((f) => /^specs\/([^/]+)\//.exec(f)?.[1]));
    let dir = base;
    for (let n = 2; takenDirs.has(dir); n++) dir = `${base}-${n}`;
    return `${SPECS_DIR}/${dir}/${name || 'spec.json'}`;
  }
  const taken = new Set(others);
  let file = `${SPECS_DIR}/${base}.json`;
  for (let n = 2; taken.has(file); n++) file = `${SPECS_DIR}/${base}-${n}.json`;
  return file;
}

/**
 * O que acontece ao aplicar `spec`: `apply` (nova no projeto), `update` (já existe
 * com `version` menor) ou `not-newer` (já existe com a mesma versão ou maior).
 */
export function checkSpecApply(p: Project, spec: Spec): 'apply' | 'update' | 'not-newer' {
  const current = getSpecialization(p, spec.id);
  if (!current) return 'apply';
  return spec.version > current.version ? 'update' : 'not-newer';
}

function newLayer(specId: string, layer: SpecLayer, id: string): Layer {
  return {
    id,
    name: layer.name,
    color: layer.color.toUpperCase(),
    spec: { specId, layerId: layer.id },
  };
}

/** Aplica a especialização: guarda a cópia e cria as camadas dela no fim da lista. */
export function applySpecialization(
  p: Project,
  spec: Spec,
  options: SpecOpOptions = {},
): Project {
  if (getSpecialization(p, spec.id)) fail('spec-already-applied', spec.id);
  const newId = options.newId ?? (() => crypto.randomUUID());
  const entry: ProjectSpecialization = {
    id: spec.id,
    version: spec.version,
    file: specFileFor(p, spec.id, options.packageSpecName),
    spec,
  };
  return {
    ...p,
    specializations: [...p.specializations, entry],
    layers: [...p.layers, ...spec.layers.map((l) => newLayer(spec.id, l, newId()))],
  };
}

/** Converte as anotações tipadas `ids` em livres, calculando tudo a partir de `p`. */
function convertAnnotations(
  p: Project,
  ids: ReadonlySet<string>,
  options: SpecOpOptions,
): Annotation[] {
  return p.annotations.map((a) =>
    ids.has(a.id) && a.type ? freeVersionOf(p, a, options) : a,
  );
}

/** O que a atualização faz: o projeto depois e o relatório das migrações que rodaram. */
interface UpdatePlan {
  readonly project: Project;
  readonly run: MigrationRun;
}

/**
 * Planeja a atualização: confere o contrato (se `enforceContract`), executa as migrações
 * (`libraryMigrations.ts`) e só então cuida das camadas. O impacto usa `enforceContract: false`
 * para poder mostrar o que uma atualização recusada faria.
 */
function planSpecializationUpdate(
  p: Project,
  spec: Spec,
  options: SpecOpOptions,
  enforceContract: boolean,
): UpdatePlan {
  const current = getSpecialization(p, spec.id) ?? fail('not-found', spec.id);
  if (spec.version <= current.version) fail('spec-not-newer', spec.id);
  // Contrato (v4 em diante): quebra sem migração declarada é recusada. As v1 a v3 não declaram
  // `migrations` e seguem como antes: o que ficar inválido vira pendência.
  if (
    enforceContract &&
    spec.formatVersion >= 4 &&
    current.spec !== null &&
    missingMigrations(current.spec, spec).length > 0
  ) {
    fail('spec-missing-migrations', spec.id);
  }
  const newId = options.newId ?? (() => crypto.randomUUID());
  const run = runLibraryMigrations(p, spec, current.version, options);
  const migrated = run.project;
  const byId = new Map(spec.layers.map((l) => [l.id, l]));

  const vanished = new Set(
    migrated.layers
      .filter((l) => l.spec?.specId === spec.id && !byId.has(l.spec.layerId))
      .map((l) => l.id),
  );
  // Converter com a especialização nova quando o tipo resolve nela (ordem e nome dos campos
  // já migrados); senão com a antiga, que o projeto migrado ainda tem.
  const renewed: Project = {
    ...migrated,
    specializations: migrated.specializations.map((s) =>
      s.id === spec.id ? { ...s, version: spec.version, spec } : s,
    ),
  };
  const annotations = migrated.annotations.map((a) => {
    if (!vanished.has(a.layerId) || !a.type) return a;
    const inNew = a.type.specId === spec.id && findTypeInSpec(spec, a.type.typeId);
    return freeVersionOf(inNew ? renewed : migrated, a, options);
  });

  const existing = new Set<string>();
  const layers = migrated.layers.map((l): Layer => {
    if (l.spec?.specId !== spec.id) return l;
    const next = byId.get(l.spec.layerId);
    if (!next) return { ...l, spec: null };
    existing.add(next.id);
    return { ...l, name: next.name };
  });
  const added = spec.layers
    .filter((l) => !existing.has(l.id))
    .map((l) => newLayer(spec.id, l, newId()));

  // O layout acompanha o que chega: pacote → pasta; sem pacote → arquivo único.
  const packaged = options.packageSpecName !== undefined;
  const file =
    packaged === isPackageFile(current.file)
      ? current.file
      : specFileFor(p, spec.id, options.packageSpecName);
  return {
    run,
    project: {
      ...migrated,
      specializations: migrated.specializations.map((s) =>
        s.id === spec.id ? { ...s, version: spec.version, spec, file } : s,
      ),
      layers: [...layers, ...added],
      annotations,
    },
  };
}

/**
 * Atualiza para uma versão maior: executa as `migrations` da versão nova (renomear e remover
 * campo, mapear valores, renomear e remover tipo, preencher campo obrigatório) sobre as
 * anotações; substitui a cópia; camadas novas são criadas; as existentes mantêm cor e anotações
 * e seguem o nome novo; as que sumiram viram livres (com as anotações convertidas). Anotações
 * que ficarem inválidas não são alteradas: aparecem como pendências.
 *
 * Contrato de versão (`formatVersion` 4 em diante, com a cópia aplicada disponível): uma quebra
 * sem migração declarada falha com `spec-missing-migrations`; atualização aditiva aplica direto.
 */
export function updateSpecialization(
  p: Project,
  spec: Spec,
  options: SpecOpOptions = {},
): Project {
  return planSpecializationUpdate(p, spec, options, true).project;
}

export type SpecRemovalMode = 'delete' | 'convert';

/**
 * Remove a especialização. `delete`: apaga as camadas dela, as anotações delas e
 * as vinculadas a elas em outras camadas. `convert`: as camadas viram livres e
 * as anotações tipadas viram livres (valores em texto). A cópia em `specs/` sai
 * nos dois casos.
 */
export function removeSpecialization(
  p: Project,
  specId: string,
  mode: SpecRemovalMode,
  options: SpecOpOptions = {},
): Project {
  if (!getSpecialization(p, specId)) fail('not-found', specId);
  const specializations = p.specializations.filter((s) => s.id !== specId);
  if (mode === 'delete') {
    const doomed = annotationsOfSpec(p, specId);
    const layers = p.layers.filter((l) => l.spec?.specId !== specId);
    if (layers.length === 0) fail('last-layer');
    return {
      ...p,
      specializations,
      layers,
      annotations: p.annotations.filter((a) => !doomed.has(a.id)),
    };
  }
  const typed = new Set(
    p.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id),
  );
  return {
    ...p,
    specializations,
    layers: p.layers.map((l) => (l.spec?.specId === specId ? { ...l, spec: null } : l)),
    annotations: convertAnnotations(p, typed, options),
  };
}

export interface SpecRemovalImpact {
  /** Anotações apagadas (`delete`) ou convertidas (`convert`). */
  readonly annotations: number;
  /** Contagem por camada (inclui as vinculadas em outras camadas, no `delete`). */
  readonly byLayer: ReadonlyMap<string, number>;
  /** Referências de outras anotações que vão ficar quebradas. */
  readonly brokenRefs: number;
}

/** Efeito de remover a especialização, para a confirmação. */
export function specializationRemovalImpact(
  p: Project,
  specId: string,
  mode: SpecRemovalMode,
): SpecRemovalImpact {
  if (!getSpecialization(p, specId)) fail('not-found', specId);
  const affected =
    mode === 'delete'
      ? annotationsOfSpec(p, specId)
      : new Set(p.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id));
  const byLayer = new Map<string, number>();
  for (const a of p.annotations) {
    if (affected.has(a.id)) byLayer.set(a.layerId, (byLayer.get(a.layerId) ?? 0) + 1);
  }
  // `delete` sem outras camadas falha; a contagem de referências continua útil.
  const after =
    mode === 'delete'
      ? {
          ...p,
          annotations: p.annotations.filter((a) => !affected.has(a.id)),
        }
      : removeSpecialization(p, specId, mode);
  return { annotations: affected.size, byLayer, brokenRefs: countBrokenRefs(p, after) };
}

export interface SpecUpdateImpact {
  /** Camadas que serão criadas. */
  readonly addedLayers: readonly SpecLayer[];
  /** Camadas do projeto que viram livres (sumiram na nova versão). */
  readonly freedLayers: readonly Layer[];
  /** Referências que vão ficar quebradas (depois de executar as migrações). */
  readonly brokenRefs: number;
  /** Diferenças da versão aplicada para a nova (vazio se a cópia não está disponível). */
  readonly changes: readonly SpecChange[];
  /** As diferenças que são quebra (subconjunto de `changes`). */
  readonly breaking: readonly SpecChange[];
  /** Quebras sem migração declarada: a atualização v4 é recusada (`refused`). */
  readonly missingMigrations: readonly SpecChange[];
  /** Os passos da cadeia declarada, na ordem (a lista achatada de `steps[].step`). */
  readonly migrations: readonly SpecMigrationStep[];
  /** `false` quando a cópia aplicada não está disponível (`spec: null`): não dá para comparar. */
  readonly comparable: boolean;
  /** Comparável e sem quebra: a atualização aplica direto, sem diálogo de impacto. */
  readonly additive: boolean;
  /** O contrato recusa: v4, comparável e com quebra sem migração (`spec-missing-migrations`). */
  readonly refused: boolean;
  /** O que cada passo da cadeia faz neste projeto (o relatório de `runLibraryMigrations`). */
  readonly steps: readonly MigrationStepReport[];
  /** Os valores que as migrações apagam ou sobrescrevem, na ordem dos passos. */
  readonly losses: readonly MigrationLoss[];
  /** Anotações convertidas em livres pelos passos `remove-type` com `convert`. */
  readonly converted: number;
  /** Anotações apagadas pelos passos `remove-type` com `delete` (com as vinculadas). */
  readonly deleted: number;
  /**
   * Pendências NOVAS depois da atualização (já descontadas as que existiam antes, por anotação,
   * código, campo, linha e coluna): das anotações tipadas desta especialização e das que as
   * migrações converteram em livres. Calculadas sobre o depois real, com as migrações.
   */
  readonly pending: readonly {
    readonly annotationId: string;
    readonly issue: AnnotationIssue;
  }[];
}

const issueKey = (i: AnnotationIssue): string =>
  [i.code, i.key ?? '', i.rowId ?? '', i.column ?? ''].join('\u0000');

/** Pendências que existem em `after` e não existiam em `before`, nas anotações da especialização. */
function newIssues(
  before: Project,
  after: Project,
  specId: string,
): SpecUpdateImpact['pending'] {
  const was = new Set(
    before.annotations.filter((a) => a.type?.specId === specId).map((a) => a.id),
  );
  const prior = projectIssues(before);
  const pending: { annotationId: string; issue: AnnotationIssue }[] = [];
  for (const a of after.annotations) {
    // Tipadas da especialização, ou convertidas em livres no caminho.
    if (a.type?.specId !== specId && !was.has(a.id)) continue;
    const known = new Set((prior.get(a.id) ?? []).map(issueKey));
    for (const issue of projectIssues(after).get(a.id) ?? []) {
      if (!known.has(issueKey(issue))) pending.push({ annotationId: a.id, issue });
    }
  }
  return pending;
}

/**
 * Efeito de atualizar para `spec` (que precisa ter `version` maior). Não lança por causa do
 * contrato: quando a atualização seria recusada, `refused` é `true` e o resto descreve o que
 * aconteceria sem a recusa.
 */
export function specializationUpdateImpact(p: Project, spec: Spec): SpecUpdateImpact {
  const { project: after, run } = planSpecializationUpdate(p, spec, {}, false);
  const current = new Set(
    p.layers.filter((l) => l.spec?.specId === spec.id).map((l) => l.spec?.layerId),
  );
  const next = new Set(spec.layers.map((l) => l.id));
  const applied = getSpecialization(p, spec.id)?.spec ?? null;
  const changes = applied ? diffSpecs(applied, spec) : [];
  const breaking = changes.filter((c) => c.kind === 'breaking');
  const missing = applied ? missingMigrations(applied, spec) : [];
  return {
    addedLayers: spec.layers.filter((l) => !current.has(l.id)),
    freedLayers: p.layers.filter(
      (l) => l.spec?.specId === spec.id && !next.has(l.spec.layerId),
    ),
    brokenRefs: countBrokenRefs(p, after),
    changes,
    breaking,
    missingMigrations: missing,
    migrations: applied
      ? (migrationChain(spec, applied.version) ?? []).flatMap((m) => m.steps)
      : [],
    comparable: applied !== null,
    additive: applied !== null && breaking.length === 0,
    refused: applied !== null && spec.formatVersion >= 4 && missing.length > 0,
    steps: run.steps,
    losses: run.losses,
    converted: run.steps.reduce((n, s) => n + s.converted, 0),
    deleted: run.steps.reduce((n, s) => n + s.deleted, 0),
    pending: newIssues(p, after, spec.id),
  };
}
