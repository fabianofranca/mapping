import { basename } from 'node:path';
import {
  ancestorsOf,
  annotationShortLabel,
  formatRef,
  matchShortCode,
  parseRef,
  projectIndex,
  shortCode,
  type ItemKind,
  type Project,
} from '../src/model';
import { ToolError } from './errors';
import {
  discoverProjects,
  findProject,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';
import type { Roots } from './paths';

export const KIND_NAMES: Record<ItemKind, string> = {
  m: 'marcação',
  i: 'imagem',
  a: 'anotação',
};

const PATH_SEPARATOR = ' › ';

/** Referências `mapping://` e rótulos legíveis dos itens de um projeto carregado. */
export class Refs {
  readonly project: Project;

  constructor(readonly loaded: LoadedProject) {
    this.project = loaded.project;
  }

  get projectName(): string {
    return this.loaded.location.name;
  }

  imageLabel(imageId: string): string {
    const image = projectIndex(this.project).images.get(imageId);
    if (!image) return imageId;
    return image.name ?? basename(image.file);
  }

  /** Nome da marcação; sem nome, "Marcação <código>" (único no projeto). */
  markingName(markingId: string): string {
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return markingId;
    return marking.name ?? `Marcação ${shortCode(this.project, 'm', markingId)}`;
  }

  /** `Imagem › Pai › Marcação`: o mesmo texto entre parênteses das referências copiadas. */
  markingPath(markingId: string): string[] {
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return [markingId];
    const chain = [...ancestorsOf(this.project, markingId).reverse(), marking];
    return [
      this.imageLabel(marking.imageId),
      ...chain.map((m) => this.markingName(m.id)),
    ];
  }

  label(kind: ItemKind, id: string): string {
    const index = projectIndex(this.project);
    if (kind === 'i') return this.imageLabel(id);
    if (kind === 'm') return this.markingPath(id).join(PATH_SEPARATOR);
    const annotation = index.annotations.get(id);
    if (!annotation) return id;
    return [
      ...this.markingPath(annotation.markingId),
      annotationShortLabel(this.project, annotation),
    ].join(PATH_SEPARATOR);
  }

  /** Referência completa, com o caminho legível. */
  ref(kind: ItemKind, id: string): string {
    return formatRef({
      project: this.projectName,
      kind,
      code: shortCode(this.project, kind, id),
      label: this.label(kind, id),
    });
  }

  /** Referência sem o caminho legível (para referências cruzadas, mais curta). */
  bare(kind: ItemKind, id: string): string {
    return formatRef({
      project: this.projectName,
      kind,
      code: shortCode(this.project, kind, id),
    });
  }
}

export interface ResolvedItem {
  readonly loaded: LoadedProject;
  readonly refs: Refs;
  readonly kind: ItemKind;
  readonly id: string;
}

const ACCEPTED_FORMATS = [
  'mapping://projeto/m/3f2a9c1e (caminho legível)',
  'm/3f2a9c1e (com o projeto informado à parte)',
  'o id completo do item (com o projeto informado à parte)',
];

/**
 * Interpreta o que o agente colou (`ref`) e acha o item. Aceita a referência completa, só
 * `m/código` com `project`, ou o id completo. Sem projeto na referência nem em `project`, procura
 * em todos os das raízes. Ambiguidade (código curto, projetos homônimos) devolve as candidatas.
 */
export async function resolveItem(
  roots: Roots,
  refText: string,
  projectArg?: string,
  expected?: ItemKind,
): Promise<ResolvedItem> {
  const parsed = parseRef(refText);
  if (!parsed) {
    throw new ToolError('invalid-ref', `referência inválida: ${refText}`, {
      accepted: ACCEPTED_FORMATS,
    });
  }
  if (expected && parsed.kind && parsed.kind !== expected) {
    throw new ToolError(
      'wrong-kind',
      `a referência é de uma ${KIND_NAMES[parsed.kind]}, não de uma ${KIND_NAMES[expected]}`,
      { kind: parsed.kind },
    );
  }
  const kind = parsed.kind ?? expected ?? null;

  let locations: ProjectLocation[];
  const named = parsed.project ?? projectArg;
  if (parsed.project !== null && projectArg !== undefined) {
    const [fromRef, fromArg] = [
      await findProject(roots, parsed.project),
      await findProject(roots, projectArg),
    ];
    if (fromRef.dir !== fromArg.dir) {
      throw new ToolError(
        'project-mismatch',
        `a referência é do projeto "${fromRef.name}", mas \`project\` indica "${fromArg.name}"`,
      );
    }
    locations = [fromRef];
  } else if (named !== undefined) {
    locations = [await findProject(roots, named)];
  } else {
    locations = await discoverProjects(roots);
    if (locations.length === 0) {
      throw new ToolError('project-not-found', 'nenhum projeto nas raízes configuradas');
    }
  }

  const searchingAll = named === undefined;
  const found: { loaded: LoadedProject; kind: ItemKind; id: string }[] = [];
  const unreadable: string[] = [];
  for (const location of locations) {
    let loaded: LoadedProject;
    try {
      loaded = await loadProject(roots, location);
    } catch (error) {
      if (!searchingAll || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    for (const match of matchShortCode(loaded.project, kind, parsed.code)) {
      found.push({ loaded, ...match });
    }
  }

  if (found.length === 1) {
    const [only] = found;
    return { ...only!, refs: new Refs(only!.loaded) };
  }
  if (found.length === 0) {
    throw new ToolError('not-found', `nenhum item corresponde a ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
      ...(unreadable.length > 0 ? { unreadable } : {}),
    });
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} itens começam com esse código: use a referência completa de um deles`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => {
        const refs = new Refs(c.loaded);
        return { ref: refs.ref(c.kind, c.id), dir: c.loaded.location.dir };
      }),
    },
  );
}
