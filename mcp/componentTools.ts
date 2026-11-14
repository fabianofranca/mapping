import { parseComponent } from '../src/model/components/parseComponent';
import type { ComponentFile } from '../src/model/components/componentFormat';
import {
  getSpec,
  getSpecialization,
  repoLink,
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
import { LocalFileChecker } from './codeFiles';
import {
  MAX_DOC_BYTES,
  docLocalPath,
  readExternalDoc,
  type ExternalDoc,
} from './docFiles';
import { packageCodeView } from './codeViews';
import { packageSignatureReader } from './signatureFiles';
import { Refs } from './items';
import { findProject, loadProject, type LoadedProject } from './projects';
import type { Roots } from './paths';

// `list_components` and `get_component` (Library stage, B2): what an agent needs to know about
// a library component (document, fields, examples, `code`, `sources`) without opening the
// package files. Read-only. The package comes from the copy applied to the project
// (`project` + `specId`, reading `specs/<folder>/`) or from any folder (`path`).

type Json = Record<string, unknown>;

export interface ComponentArgs {
  project?: string | undefined;
  specId?: string | undefined;
  path?: string | undefined;
}

interface OpenedPackage {
  readonly source: PackageSource;
  /** Project that applies the package (`project` + `specId`); `null` when reading by `path`. */
  readonly loaded: LoadedProject | null;
}

async function openPackage(roots: Roots, args: ComponentArgs): Promise<OpenedPackage> {
  const byPath = args.path !== undefined;
  if (byPath === (args.project !== undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'provide `project` + `specId` (the applied copy) or `path` (the package folder or the specialization file), not both',
    );
  }
  if (args.path !== undefined) {
    return { source: await packageByPath(roots, args.path), loaded: null };
  }
  if (args.specId === undefined) {
    throw new ToolError('invalid-arguments', 'provide `specId` (see get_project)');
  }
  const location = await findProject(roots, args.project!);
  const loaded = await loadProject(roots, location);
  const applied = getSpecialization(loaded.project, args.specId);
  if (!applied) {
    throw new ToolError('not-found', `specialization not applied: ${args.specId}`, {
      applied: loaded.project.specializations.map((s) => s.id),
    });
  }
  const spec = getSpec(loaded.project, args.specId);
  if (!spec) {
    throw new ToolError(
      'spec-unavailable',
      `the specialization copy is missing or invalid: ${applied.file}`,
      { specId: args.specId, file: applied.file },
    );
  }
  return {
    source: await packageOfProject(roots, location.dir, applied.file, spec),
    loaded,
  };
}

interface LoadedComponent {
  readonly path: string;
  readonly json?: unknown;
  readonly component?: ComponentFile;
  /** Why it did not load. */
  readonly problem?: string;
}

async function loadComponent(
  source: PackageSource,
  type: SpecAnnotationType,
): Promise<LoadedComponent | null> {
  if (type.component === undefined) return null;
  const path = source.resolve(type.component);
  const text = await source.read(path);
  if (text === null) return { path, problem: 'component file missing from the package' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { path, problem: 'the component file is not valid JSON' };
  }
  const parsed = parseComponent(json);
  if (!parsed.ok) {
    return {
      path,
      json,
      problem: `invalid component: ${parsed.errors.slice(0, 3).join('; ')}`,
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

/** `list_components`: one item per type with a component. */
export async function listComponents(roots: Roots, args: ComponentArgs): Promise<Json> {
  const { source } = await openPackage(roots, args);
  const entries = typeEntries(source.spec);
  const withComponent = entries.filter((e) => e.type.component !== undefined);
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
  const without = entries.length - withComponent.length;
  return {
    spec: { id: source.spec.id, name: source.spec.name, version: source.spec.version },
    count: components.length,
    components,
    typesWithoutComponent: without,
    ...(components.length === 0
      ? {
          hint:
            source.spec.formatVersion < 4
              ? 'the specialization predates formatVersion 4: it has no components (use get_specialization for the types)'
              : 'no type declares `component`',
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

/** The external example's JSON, when small; otherwise only the notice. */
async function externalExample(source: PackageSource, file: string): Promise<Json> {
  const path = source.resolve(file);
  const text = await source.read(path);
  if (text === null) return { file: path, missing: true };
  if (Buffer.byteLength(text, 'utf8') > MAX_EXAMPLE_JSON_BYTES) {
    return { file: path, json: null, omitted: 'too large; read the package file' };
  }
  try {
    return { file: path, json: JSON.parse(text) as unknown };
  } catch {
    return { file: path, json: null, omitted: 'invalid JSON' };
  }
}

interface ExternalDocument {
  readonly text: string | null;
  readonly view: Json;
  readonly hint?: string;
}

/**
 * The `doc` object (v11): the `.md` lives in a `docRepos` repository. With the project's clone
 * (`docRepos[<id>].localPath`) and the file inside the working directory, it returns the text;
 * without them, the link (`url`, from the `urlTemplate`) and the hint of what to do.
 */
async function externalDocument(
  roots: Roots,
  spec: Spec,
  project: LoadedProject | null,
  doc: { readonly repo: string; readonly path: string },
): Promise<ExternalDocument> {
  const repo = spec.docRepos?.find((r) => r.id === doc.repo);
  const url = repoLink(repo, doc.path);
  const found =
    project === null
      ? null
      : await readExternalDoc(
          new LocalFileChecker(roots.workDir),
          roots.workDir,
          project.location.dir,
          docLocalPath(project.project, doc.repo, doc.path),
        );
  const view = externalDocView(doc, url, found);
  if (found?.text != null) return { text: found.text, view };
  return {
    text: null,
    view,
    hint: externalDocHint(doc, found, url),
  };
}

function externalDocView(
  doc: { readonly repo: string; readonly path: string },
  url: string | null,
  found: ExternalDoc | null,
): Json {
  return {
    repo: doc.repo,
    path: doc.path,
    url,
    localFile: found?.localFile ?? null,
    exists: found?.exists ?? null,
    ...(found?.problem ? { localFileProblem: found.problem } : {}),
  };
}

/** What to do when the external document did not come: set up the clone or open the link (if there is one). */
function externalDocHint(
  doc: { readonly repo: string; readonly path: string },
  found: ExternalDoc | null,
  url: string | null,
): string {
  // Without a urlTemplate there is no link: the hint only says the path in the repository.
  const orLink =
    url === null
      ? `; the document is at ${doc.path}, in the repository ${doc.repo}`
      : `, or open the link: ${url}`;
  const orLinkAfter = url === null ? '' : ` or the link: ${url}`;
  if (found === null) {
    return `the document ${doc.path} is in the repository ${doc.repo}, outside the package; read it through a project (\`project\` + \`specId\`) with the clone configured (set_doc_repo)${url === null ? '' : ` or open the link: ${url}`}`;
  }
  if (found.tooLarge) {
    return `the document ${doc.path} exceeds ${MAX_DOC_BYTES} bytes and was not read; open the file in the clone${orLinkAfter}`;
  }
  if (found.exists === null) {
    return `the project does not configure the clone of the repository ${doc.repo} (or the path leaves the working directory): provide \`localPath\` with set_doc_repo${orLink}`;
  }
  return `the document ${doc.path} is not in the clone of ${doc.repo} (${found.localFile}); check the clone's ref${orLink}`;
}

/** `get_component`: everything about a library type. */
export async function getComponent(
  roots: Roots,
  args: ComponentArgs & { type: string },
): Promise<Json> {
  const { source, loaded: project } = await openPackage(roots, args);
  const entries = typeEntries(source.spec);
  const wanted = args.type.trim();
  let matches = entries.filter((e) => e.type.id === wanted);
  if (matches.length === 0) {
    const folded = wanted.toLowerCase();
    matches = entries.filter((e) => e.type.name.toLowerCase() === folded);
  }
  if (matches.length === 0) {
    throw new ToolError('unknown-type', `type not found: ${args.type}`, {
      type: args.type,
      available: entries.slice(0, 50).map((e) => e.type.id),
    });
  }
  if (matches.length > 1) {
    throw new ToolError(
      'ambiguous-type',
      `more than one type named "${args.type}": use the id`,
      {
        candidates: matches.map((e) => e.type.id),
      },
    );
  }
  const { layerId, layerName, type } = matches[0]!;
  const loaded = await loadComponent(source, type);
  // `doc` object: the document lives in another repository, with no text in the package.
  const docPath = typeof type.doc === 'string' ? source.resolve(type.doc) : null;
  const packageDoc = docPath === null ? null : await source.read(docPath);
  const external =
    typeof type.doc === 'object'
      ? await externalDocument(roots, source.spec, project, type.doc)
      : null;
  const doc = external ? external.text : packageDoc;
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
    external?.hint ??
    (loaded === null && doc === null && type.doc === undefined
      ? 'the type has no component or document in the library (fields only); it does not draw in the app'
      : loaded?.problem !== undefined
        ? `the component did not load: ${loaded.problem}; run validate_library on the package`
        : docPath !== null && doc === null
          ? "the type's document is missing from the package; run validate_library"
          : undefined);
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
    ...(typeof type.doc === 'object' ? { docRef: { ...type.doc } } : {}),
    ...(external ? { docExternal: external.view } : {}),
    fields: type.fields.map(fieldView),
    examples,
    ...(type.code === undefined
      ? {}
      : {
          code: await packageCodeView(
            source.spec,
            type.code,
            project === null
              ? null
              : { refs: new Refs(project), files: new LocalFileChecker(roots.workDir) },
            packageSignatureReader(source),
          ),
        }),
    sources: type.sources ?? [],
    ...(hint === undefined ? {} : { hint }),
  };
}
