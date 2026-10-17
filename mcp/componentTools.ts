import { parseComponent } from '../src/model/components/parseComponent';
import type { ComponentFile } from '../src/model/components/componentFormat';
import {
  getSpec,
  getSpecialization,
  type Spec,
  type SpecAnnotationType,
} from '../src/model';
import { ToolError } from './errors';
import {
  MAX_EXAMPLE_JSON_BYTES,
  packageByPath,
  packageOfProject,
  type PackageSource,
} from './library';
import { findProject, loadProject } from './projects';
import type { Roots } from './paths';

// `list_components` e `get_component` (etapa Biblioteca, B2): o que um agente precisa saber de
// um componente da biblioteca (documento, campos, exemplos, `code`, `sources`) sem abrir os
// arquivos do pacote. Somente leitura. O pacote vem da cópia aplicada ao projeto
// (`project` + `specId`, lendo `specs/<pasta>/`) ou de uma pasta qualquer (`path`).

type Json = Record<string, unknown>;

export interface ComponentArgs {
  project?: string | undefined;
  specId?: string | undefined;
  path?: string | undefined;
}

async function openPackage(roots: Roots, args: ComponentArgs): Promise<PackageSource> {
  const byPath = args.path !== undefined;
  if (byPath === (args.project !== undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'informe `project` + `specId` (a cópia aplicada) ou `path` (a pasta do pacote ou o arquivo da especialização), não os dois',
    );
  }
  if (args.path !== undefined) return packageByPath(roots, args.path);
  if (args.specId === undefined) {
    throw new ToolError('invalid-arguments', 'informe `specId` (veja get_project)');
  }
  const location = await findProject(roots, args.project!);
  const loaded = await loadProject(roots, location);
  const applied = getSpecialization(loaded.project, args.specId);
  if (!applied) {
    throw new ToolError('not-found', `especialização não aplicada: ${args.specId}`, {
      applied: loaded.project.specializations.map((s) => s.id),
    });
  }
  const spec = getSpec(loaded.project, args.specId);
  if (!spec) {
    throw new ToolError(
      'spec-unavailable',
      `a cópia da especialização está ausente ou inválida: ${applied.file}`,
      { specId: args.specId, file: applied.file },
    );
  }
  return packageOfProject(roots, location.dir, applied.file, spec);
}

interface LoadedComponent {
  readonly path: string;
  readonly json?: unknown;
  readonly component?: ComponentFile;
  /** Por que não carregou. */
  readonly problem?: string;
}

async function loadComponent(
  source: PackageSource,
  type: SpecAnnotationType,
): Promise<LoadedComponent | null> {
  if (type.component === undefined) return null;
  const path = source.resolve(type.component);
  const text = await source.read(path);
  if (text === null) return { path, problem: 'arquivo do componente ausente no pacote' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { path, problem: 'o arquivo do componente não é um JSON válido' };
  }
  const parsed = parseComponent(json);
  if (!parsed.ok) {
    return {
      path,
      json,
      problem: `componente inválido: ${parsed.errors.slice(0, 3).join('; ')}`,
    };
  }
  return { path, json, component: parsed.component };
}

const sizeView = (size: { width: number; height: number } | undefined) =>
  size === undefined ? null : { width: size.width, height: size.height };

function typeEntries(
  spec: Spec,
): { layerId: string; layerName: string; type: SpecAnnotationType }[] {
  return spec.layers.flatMap((layer) =>
    layer.annotationTypes.map((type) => ({
      layerId: layer.id,
      layerName: layer.name,
      type,
    })),
  );
}

/** `list_components`: um item por tipo com componente. */
export async function listComponents(roots: Roots, args: ComponentArgs): Promise<Json> {
  const source = await openPackage(roots, args);
  const withComponent = typeEntries(source.spec).filter(
    (e) => e.type.component !== undefined,
  );
  const components: Json[] = [];
  for (const { layerId, layerName, type } of withComponent) {
    const loaded = await loadComponent(source, type);
    components.push({
      type: type.id,
      name: type.name,
      layer: layerId,
      layerName,
      component: loaded!.path,
      ...(loaded!.component
        ? {
            size: sizeView(loaded!.component.size),
            minSize: sizeView(loaded!.component.minSize),
          }
        : { problem: loaded!.problem }),
      hasDoc: type.doc !== undefined,
      examples: (type.examples ?? []).length,
    });
  }
  const without = typeEntries(source.spec).length - withComponent.length;
  return {
    spec: { id: source.spec.id, name: source.spec.name, version: source.spec.version },
    count: components.length,
    components,
    typesWithoutComponent: without,
    ...(components.length === 0
      ? {
          hint:
            source.spec.formatVersion < 4
              ? 'a especialização é anterior à formatVersion 4: não tem componentes (use get_specialization para os tipos)'
              : 'nenhum tipo declara `component`',
        }
      : {}),
  };
}

function fieldView(field: SpecAnnotationType['fields'][number]): Json {
  const base: Json = {
    key: field.key,
    label: field.label ?? field.key,
    type: field.type,
    required: field.required === true,
    ...(field.description === undefined ? {} : { description: field.description }),
  };
  if (field.type === 'enum') {
    base.options = field.options;
    if (field.default !== undefined) base.default = field.default;
  } else if (field.type === 'table') {
    base.columns = field.columns.map((c) => fieldView(c));
  } else if (field.type === 'ref') {
    base.accepts = field.accepts;
  } else if (field.default !== undefined) {
    base.default = field.default;
  }
  return base;
}

/** O JSON do exemplo externo, quando pequeno; senão só o aviso. */
async function externalExample(source: PackageSource, file: string): Promise<Json> {
  const path = source.resolve(file);
  const text = await source.read(path);
  if (text === null) return { file: path, missing: true };
  if (Buffer.byteLength(text, 'utf8') > MAX_EXAMPLE_JSON_BYTES) {
    return { file: path, json: null, omitted: 'grande demais; leia o arquivo do pacote' };
  }
  try {
    return { file: path, json: JSON.parse(text) as unknown };
  } catch {
    return { file: path, json: null, omitted: 'JSON inválido' };
  }
}

/** `get_component`: tudo de um tipo da biblioteca. */
export async function getComponent(
  roots: Roots,
  args: ComponentArgs & { type: string },
): Promise<Json> {
  const source = await openPackage(roots, args);
  const entries = typeEntries(source.spec);
  const wanted = args.type.trim();
  let matches = entries.filter((e) => e.type.id === wanted);
  if (matches.length === 0) {
    const folded = wanted.toLowerCase();
    matches = entries.filter((e) => e.type.name.toLowerCase() === folded);
  }
  if (matches.length === 0) {
    throw new ToolError('unknown-type', `tipo não encontrado: ${args.type}`, {
      type: args.type,
      available: entries.slice(0, 50).map((e) => e.type.id),
    });
  }
  if (matches.length > 1) {
    throw new ToolError(
      'ambiguous-type',
      `mais de um tipo chamado "${args.type}": use o id`,
      {
        candidates: matches.map((e) => e.type.id),
      },
    );
  }
  const { layerId, layerName, type } = matches[0]!;
  const loaded = await loadComponent(source, type);
  const docPath = type.doc === undefined ? null : source.resolve(type.doc);
  const doc = docPath === null ? null : await source.read(docPath);
  const examples: Json[] = [];
  for (const example of type.examples ?? []) {
    examples.push({
      name: example.name,
      ...(example.description === undefined ? {} : { description: example.description }),
      ...(example.values === undefined ? {} : { values: example.values }),
      ...(example.system === undefined ? {} : { system: example.system }),
      ...(example.file === undefined ? {} : await externalExample(source, example.file)),
    });
  }
  const hint =
    loaded === null && doc === null
      ? 'o tipo não tem componente nem documento na biblioteca (só campos); ele não desenha na app'
      : loaded?.problem !== undefined
        ? `o componente não carregou: ${loaded.problem}; rode validate_library no pacote`
        : docPath !== null && doc === null
          ? 'o documento do tipo está ausente no pacote; rode validate_library'
          : undefined;
  return {
    spec: { id: source.spec.id, name: source.spec.name, version: source.spec.version },
    type: type.id,
    name: type.name,
    layer: layerId,
    layerName,
    ...(type.description === undefined ? {} : { description: type.description }),
    hasComponent: loaded?.component !== undefined,
    ...(loaded === null
      ? { componentPath: null, component: null }
      : {
          componentPath: loaded.path,
          ...(loaded.component
            ? {
                size: sizeView(loaded.component.size),
                minSize: sizeView(loaded.component.minSize),
              }
            : { problem: loaded.problem }),
          component: loaded.json ?? null,
        }),
    docPath,
    doc,
    fields: type.fields.map(fieldView),
    examples,
    ...(type.code === undefined ? {} : { code: type.code }),
    sources: type.sources ?? [],
    ...(hint === undefined ? {} : { hint }),
  };
}
