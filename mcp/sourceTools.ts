import {
  findBySource,
  findTypesBySource,
  type Change,
  type SpecColumn,
  type SpecField,
} from '../src/model';
import { ToolError } from './errors';
import { Refs } from './items';
import type { Roots } from './paths';
import {
  discoverProjects,
  findProject,
  loadProject,
  type ProjectLocation,
} from './projects';
import { ProposalRefs } from './proposalRefs';
import { listStored } from './proposalStore';
import { stateOf } from './proposalViews';

// Identidade externa (etapa 4.2): do elemento de um sistema de origem para o que o projeto já
// tem (`find_by_source`) e para o tipo de anotação que o representa (`find_types_by_source`).
// O núcleo não interpreta `system` nem os nomes: só compara textos.

type Json = Record<string, unknown>;

async function locationsOf(roots: Roots, project?: string): Promise<ProjectLocation[]> {
  if (project !== undefined) return [await findProject(roots, project)];
  const all = await discoverProjects(roots);
  if (all.length === 0) {
    throw new ToolError('project-not-found', 'nenhum projeto nas raízes configuradas');
  }
  return all;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameSource(value: unknown, system: string, id: string): boolean {
  return isRecord(value) && value.system === system && value.id === id;
}

/** A mudança cria o elemento com essa origem, ou passa a dar essa origem a ele. */
function givesSource(c: Change, system: string, id: string): boolean {
  if (c.entity !== 'image' && c.entity !== 'marking') return false;
  if (c.kind === 'create') return isRecord(c.to) && sameSource(c.to.source, system, id);
  return c.kind === 'update' && c.field === 'source' && sameSource(c.to, system, id);
}

export async function findBySourceResult(
  roots: Roots,
  args: { project?: string | undefined; system: string; id: string },
): Promise<Json> {
  const system = args.system.trim();
  const id = args.id.trim();
  if (system === '' || id === '') {
    throw new ToolError('missing-query', 'informe `system` e `id` não vazios');
  }
  const locations = await locationsOf(roots, args.project);
  const searchingAll = args.project === undefined;
  const matches: Json[] = [];
  const proposed: Json[] = [];
  const searched: string[] = [];
  const unreadable: string[] = [];
  for (const location of locations) {
    let loaded;
    try {
      loaded = await loadProject(roots, location);
    } catch (error) {
      if (!searchingAll || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    searched.push(location.path);
    const refs = new Refs(loaded);
    for (const match of findBySource(loaded.project, system, id)) {
      if (match.kind === 'image') {
        matches.push({
          project: location.name,
          kind: 'image',
          ref: refs.ref('i', match.image.id),
          name: match.image.name,
          file: match.image.file,
          source: match.image.source,
        });
      } else {
        matches.push({
          project: location.name,
          kind: 'marking',
          ref: refs.ref('m', match.marking.id),
          name: match.marking.name,
          image: refs.ref('i', match.marking.imageId),
          rect: match.marking.rect,
          source: match.marking.source,
        });
      }
    }
    // Elementos que propostas ainda abertas criam com essa origem: uma nova proposta não
    // deve duplicá-los (use `supersedes` ou espere a revisão).
    const stored = await listStored(roots, location);
    const proposalRefs = new ProposalRefs(location.name, stored);
    for (const s of stored.proposals) {
      const p = s.proposal;
      if (p.status !== 'open' && p.status !== 'superseded') continue;
      for (const c of p.changes) {
        const state = stateOf(p, c.id);
        if (state === 'applied' || state === 'rejected') continue;
        if (!givesSource(c, system, id)) continue;
        proposed.push({
          project: location.name,
          proposal: proposalRefs.ref(s.id),
          change: c.id,
          kind: c.kind,
          entity: c.entity,
          entityId: c.entityId,
          state,
        });
      }
    }
  }
  return {
    query: { system, id },
    searched,
    ...(unreadable.length > 0 ? { unreadable } : {}),
    total: matches.length,
    matches,
    ...(proposed.length > 0 ? { proposed } : {}),
  };
}

/** As propriedades de origem de um campo (e das colunas de uma tabela), só as do sistema pedido. */
function fieldView(field: SpecField | SpecColumn, system: string): Json | null {
  const sources = (field.sources ?? []).filter((s) => s.system === system);
  const columns =
    field.type === 'table'
      ? field.columns
          .map((column) => fieldView(column, system))
          .filter((column): column is Json => column !== null)
      : [];
  if (sources.length === 0 && columns.length === 0) return null;
  return {
    key: field.key,
    type: field.type,
    ...(field.type === 'enum' ? { options: field.options } : {}),
    ...(sources.length > 0
      ? {
          sources: sources.map((s) => ({
            name: s.name,
            ...(s.values ? { values: s.values } : {}),
          })),
        }
      : {}),
    ...(columns.length > 0 ? { columns } : {}),
  };
}

export async function findTypesBySourceResult(
  roots: Roots,
  args: {
    project: string;
    system: string;
    id?: string | undefined;
    name?: string | undefined;
  },
): Promise<Json> {
  const system = args.system.trim();
  if (system === '') throw new ToolError('missing-query', 'informe `system` não vazio');
  if (args.id === undefined && args.name === undefined) {
    throw new ToolError(
      'missing-query',
      'informe `id` e/ou `name` do elemento de origem',
    );
  }
  const location = await findProject(roots, args.project);
  const loaded = await loadProject(roots, location);
  const specs = loaded.project.specializations;
  const found = findTypesBySource(
    specs.map((s) => s.spec),
    system,
    {
      ...(args.id !== undefined ? { id: args.id } : {}),
      ...(args.name !== undefined ? { name: args.name } : {}),
    },
  );
  const unavailable = specs.filter((s) => s.spec === null).map((s) => s.id);
  return {
    query: {
      system,
      ...(args.id !== undefined ? { id: args.id } : {}),
      ...(args.name !== undefined ? { name: args.name } : {}),
    },
    project: { name: location.name, path: location.path },
    total: found.length,
    types: found.map((m) => ({
      type: `${m.specId}/${m.type.id}`,
      name: m.type.name,
      spec: m.specId,
      layer: { id: m.layer.id, name: m.layer.name },
      by: m.by,
      source: m.source,
      requiresOwner: m.type.requiresOwner === true,
      fields: m.type.fields
        .map((field) => fieldView(field, system))
        .filter((field): field is Json => field !== null),
    })),
    ...(unavailable.length > 0 ? { unavailableSpecs: unavailable } : {}),
  };
}
