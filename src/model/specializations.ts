import { fail } from './errors';
import { countBrokenRefs, type LabelTexts } from './refs';
import type { Spec, SpecLayer } from './spec';
import { getSpecialization } from './specLookup';
import { annotationsOfSpec, freeVersionOf } from './typed';
import type { Annotation, Layer, Project, ProjectSpecialization } from './types';

// Ciclo de vida da especialização no projeto: aplicar, atualizar e remover.
// Ver PLAN.md 13.4. O conteúdo fica em `specializations[].spec` (em memória) e é
// gravado em `specs/<id>.json` pelo armazenamento; por isso o desfazer cobre tudo.

/** Pasta das cópias das especializações, relativa à raiz do projeto. */
export const SPECS_DIR = 'specs';

export interface SpecOpOptions {
  /** Gera os ids das camadas e tuplas novas. Padrão: `crypto.randomUUID()`. */
  readonly newId?: () => string;
  /** Textos usados ao converter referências em texto. */
  readonly texts?: LabelTexts;
}

/** `specs/<id>.json`, com o id limpo para nome de arquivo e sem colidir com outro. */
export function specFileFor(p: Project, specId: string): string {
  const base = specId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '') || 'spec';
  const taken = new Set(
    p.specializations.filter((s) => s.id !== specId).map((s) => s.file),
  );
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
    file: specFileFor(p, spec.id),
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

/**
 * Atualiza para uma versão maior: substitui a cópia; camadas novas são criadas;
 * as existentes mantêm cor e anotações e seguem o nome novo; as que sumiram viram
 * livres (com as anotações convertidas). Anotações que ficarem inválidas não são
 * alteradas: aparecem como pendências.
 */
export function updateSpecialization(
  p: Project,
  spec: Spec,
  options: SpecOpOptions = {},
): Project {
  const current = getSpecialization(p, spec.id) ?? fail('not-found', spec.id);
  if (spec.version <= current.version) fail('spec-not-newer', spec.id);
  const newId = options.newId ?? (() => crypto.randomUUID());
  const byId = new Map(spec.layers.map((l) => [l.id, l]));

  const vanished = new Set(
    p.layers
      .filter((l) => l.spec?.specId === spec.id && !byId.has(l.spec.layerId))
      .map((l) => l.id),
  );
  const toConvert = new Set(
    p.annotations.filter((a) => vanished.has(a.layerId)).map((a) => a.id),
  );
  const annotations = convertAnnotations(p, toConvert, options);

  const existing = new Set<string>();
  const layers = p.layers.map((l): Layer => {
    if (l.spec?.specId !== spec.id) return l;
    const next = byId.get(l.spec.layerId);
    if (!next) return { ...l, spec: null };
    existing.add(next.id);
    return { ...l, name: next.name };
  });
  const added = spec.layers
    .filter((l) => !existing.has(l.id))
    .map((l) => newLayer(spec.id, l, newId()));

  return {
    ...p,
    specializations: p.specializations.map((s) =>
      s.id === spec.id ? { ...s, version: spec.version, spec } : s,
    ),
    layers: [...layers, ...added],
    annotations,
  };
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
  /** Referências que vão ficar quebradas. */
  readonly brokenRefs: number;
}

/** Efeito de atualizar para `spec` (que precisa ter `version` maior). */
export function specializationUpdateImpact(p: Project, spec: Spec): SpecUpdateImpact {
  const after = updateSpecialization(p, spec);
  const current = new Set(
    p.layers.filter((l) => l.spec?.specId === spec.id).map((l) => l.spec?.layerId),
  );
  const next = new Set(spec.layers.map((l) => l.id));
  return {
    addedLayers: spec.layers.filter((l) => !current.has(l.id)),
    freedLayers: p.layers.filter(
      (l) => l.spec?.specId === spec.id && !next.has(l.spec.layerId),
    ),
    brokenRefs: countBrokenRefs(p, after),
  };
}
