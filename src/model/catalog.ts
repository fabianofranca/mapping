import { hasSlotComponent } from './componentCatalog';
import { modelMessage, rawMessage, type ModelMessage } from './modelMessage';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import {
  type TextMeasurer,
  instantiate,
  measureComponent,
} from './components/instantiate';
import { type Library, loadLibrary, resolvePath } from './components/library';
import { screenFromSource } from './components/origin';
import { parseComponentText } from './components/parseComponent';
import { type FrameNode, baseNode, translate } from './components/scene';
import { renderOrder } from './components/screen';
import { resolveTokens } from './components/tokens';
import type { Size } from './geometry';
import { type LibraryFile, type LibraryReport, validateLibrary } from './library';
import { defaultValues, nodeProbeLibrary, withoutNodePrefix } from './libraryDrawing';
import { resolveCode } from './codeVariants';
import { repoLink } from './codeLocations';
import { packageSpecNameOf } from './libraryPackage';
import {
  type FieldType,
  type Spec,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecField,
  type SpecRefAccepts,
  type SpecTypeSource,
} from './spec';

// Catálogo da biblioteca (etapa Biblioteca, B5): a especialização de um pacote lido para a
// memória, reorganizada para a interface mostrar (camadas, tipos, tabela de propriedades,
// código por plataforma, fontes, exemplos) e para desenhar um tipo ou um exemplo. Puro: recebe
// os arquivos já lidos (o mesmo formato do validador) e nunca lê disco nem rede. Nunca lança:
// um pacote quebrado devolve o `report` e o que deu para montar.

/** Campo pronto para a tabela de propriedades. */
export interface CatalogField {
  readonly key: string;
  /** `label` do campo ou, sem ele, a `key`. */
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Opções do `enum`. */
  readonly options?: readonly string[];
  readonly default?: string | number;
  readonly description?: string;
  /** Colunas de um campo `table`. */
  readonly columns?: readonly CatalogField[];
  readonly rowLabel?: string;
  /** O que um campo `ref` aceita. */
  readonly accepts?: SpecRefAccepts;
}

/** Um caso de `variants` já resolvido sobre a base: o símbolo (e o arquivo) do valor. */
export interface CatalogCodeVariantCase {
  /** Valor do campo da variante (uma das `options`). */
  readonly value: string;
  readonly symbol: string;
  readonly path?: string;
}

/** `variants` do `code` para a interface: o campo e a tabela valor → símbolo, na ordem das `options`. */
export interface CatalogCodeVariants {
  readonly field: string;
  /** `label` do campo ou, sem ele, a `key`. */
  readonly fieldLabel: string;
  readonly cases: readonly CatalogCodeVariantCase[];
}

/** `code` do tipo em uma plataforma. A UI monta os links com o `repo` da especialização (`codeLink`). */
export interface CatalogCode {
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly language?: string;
  };
  readonly symbol: string;
  readonly path?: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly notes?: string;
  /** Presente com `variants` na especialização: o resto é a base. */
  readonly variants?: CatalogCodeVariants;
}

/** Elementos de um sistema externo a que o tipo corresponde. */
export interface CatalogSourceGroup {
  readonly system: string;
  readonly items: readonly SpecTypeSource[];
}

/**
 * Exemplo de um tipo. Modo `values`: `values` direto. Modo `system`: o JSON do nó (`json`,
 * `undefined` se o arquivo faltou ou não é JSON) passa pela declaração de `origins`.
 */
export interface CatalogExample {
  readonly name: string;
  readonly description?: string;
  readonly mode: 'values' | 'system';
  /** Os valores do exemplo; num campo `table`, as linhas, com `_id` como as do `preview`. */
  readonly values?: FieldValues;
  readonly system?: string;
  readonly file?: string;
  readonly json?: unknown;
}

/** Documento de um tipo que vive num repositório declarado em `docRepos` (nada é lido aqui). */
export interface CatalogDocExternal {
  /** Id do `docRepos` citado por `doc.repo`. */
  readonly repo: string;
  readonly path: string;
  /** `url` do repositório declarado; `null` se o id não existe na especialização. */
  readonly repoUrl: string | null;
  /** Link do arquivo pelo `urlTemplate` do repositório; `null` sem repositório ou sem template válido. */
  readonly url: string | null;
}

export interface CatalogEntry {
  readonly type: SpecAnnotationType;
  readonly layerId: string;
  readonly component: ComponentFile | null;
  /** Por que não há componente (arquivo ausente ou inválido); ausente se o tipo não declara `component`. */
  readonly componentProblem?: ModelMessage;
  readonly container: boolean;
  /** Texto do `.md` do tipo; `null` sem `doc` ou com o arquivo ausente. */
  readonly docText: string | null;
  /** `doc` objeto (v11): o `.md` vive num repositório de `docRepos`; `null` nos demais casos. */
  readonly docExternal: CatalogDocExternal | null;
  readonly fields: readonly CatalogField[];
  readonly code: readonly CatalogCode[];
  readonly sources: readonly CatalogSourceGroup[];
  readonly examples: readonly CatalogExample[];
  /** Valores do `preview` do componente sobre os padrões dos campos; `null` sem componente. */
  readonly previewValues: FieldValues | null;
}

export interface CatalogLayer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly entries: readonly CatalogEntry[];
}

export interface Catalog {
  readonly spec: Spec | null;
  readonly report: LibraryReport;
  readonly layers: readonly CatalogLayer[];
  /** Biblioteca do motor (origens para os exemplos de sistema externo); `null` se não montou. */
  readonly library: Library | null;
}

/**
 * As linhas do `preview` de uma tabela ganham `_id` (o formulário do playground edita linhas
 * por `_id`); o desenho ignora o `_id`.
 */
function withRowIds(values: FieldValues): FieldValues {
  const out: Record<string, FieldValues[string]> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = Array.isArray(value)
      ? value.map((row, i) => ({ _id: `preview-${i + 1}`, ...row }))
      : value;
  }
  return out;
}

function fieldOf(field: SpecField | SpecColumn): CatalogField {
  const base = {
    key: field.key,
    label: field.label ?? field.key,
    type: field.type,
    required: field.required === true,
    ...(field.description === undefined ? {} : { description: field.description }),
  };
  switch (field.type) {
    case 'enum':
      return {
        ...base,
        options: field.options,
        ...(field.default === undefined ? {} : { default: field.default }),
      };
    case 'table':
      return {
        ...base,
        columns: field.columns.map(fieldOf),
        ...(field.rowLabel === undefined ? {} : { rowLabel: field.rowLabel }),
      };
    case 'ref':
      return { ...base, accepts: field.accepts };
    default:
      return {
        ...base,
        ...(field.default === undefined ? {} : { default: field.default }),
      };
  }
}

/** `variants` do `code` para a tabela do Catálogo; `undefined` sem `variants` ou sem campo `enum`. */
function variantsOf(
  type: SpecAnnotationType,
  code: NonNullable<SpecAnnotationType['code']>[string],
): CatalogCodeVariants | undefined {
  const { variants } = code;
  if (variants === undefined) return undefined;
  const field = type.fields.find((f) => f.key === variants.field);
  if (field?.type !== 'enum') return undefined;
  const cases = field.options.flatMap((value) => {
    if (!Object.hasOwn(variants.cases, value)) return [];
    const resolved = resolveCode(code, { [field.key]: value }, type.fields);
    return [
      {
        value,
        symbol: resolved.symbol,
        ...(resolved.path === undefined ? {} : { path: resolved.path }),
      },
    ];
  });
  return { field: field.key, fieldLabel: field.label ?? field.key, cases };
}

function codeOf(spec: Spec, type: SpecAnnotationType): CatalogCode[] {
  const platforms = new Map((spec.platforms ?? []).map((p) => [p.id, p]));
  const out: CatalogCode[] = [];
  for (const [id, code] of Object.entries(type.code ?? {})) {
    const platform = platforms.get(id);
    const variants = variantsOf(type, code);
    out.push({
      platform: {
        id,
        name: platform?.name ?? id,
        ...(platform?.language === undefined ? {} : { language: platform.language }),
      },
      symbol: code.symbol,
      ...(code.path === undefined ? {} : { path: code.path }),
      ...(code.params === undefined ? {} : { params: code.params }),
      ...(code.values === undefined ? {} : { values: code.values }),
      ...(code.notes === undefined ? {} : { notes: code.notes }),
      ...(variants === undefined ? {} : { variants }),
    });
  }
  return out;
}

function docExternalOf(spec: Spec, type: SpecAnnotationType): CatalogDocExternal | null {
  const doc = type.doc;
  if (doc === undefined || typeof doc === 'string') return null;
  const repo = spec.docRepos?.find((r) => r.id === doc.repo);
  return {
    repo: doc.repo,
    path: doc.path,
    repoUrl: repo?.url ?? null,
    url: repoLink(repo, doc.path),
  };
}

function sourcesOf(type: SpecAnnotationType): CatalogSourceGroup[] {
  const groups = new Map<string, SpecTypeSource[]>();
  for (const source of type.sources ?? []) {
    const list = groups.get(source.system) ?? [];
    list.push(source);
    groups.set(source.system, list);
  }
  return [...groups].map(([system, items]) => ({ system, items }));
}

function parseJsonOrUndefined(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Caminho do arquivo da especialização dentro do pacote. */
function locateSpecPath(texts: ReadonlyMap<string, unknown>, spec: Spec): string {
  const root = packageSpecNameOf(texts, spec.id);
  if (texts.has(root)) return root;
  for (const [path, text] of texts) {
    if (!path.toLowerCase().endsWith('.json') || typeof text !== 'string') continue;
    const json = parseJsonOrUndefined(text);
    if (typeof json !== 'object' || json === null) continue;
    if (
      Reflect.get(json, 'id') === spec.id &&
      /^mapp(ing|eador)-spec$/.test(String(Reflect.get(json, 'format')))
    ) {
      return path;
    }
  }
  return root;
}

/** Monta o catálogo do pacote (validação nos três níveis incluída). Nunca lança. */
export function buildCatalog(files: readonly LibraryFile[]): Catalog {
  const report = validateLibrary({ files });
  const spec = report.spec ?? null;
  if (spec === null) return { spec: null, report, layers: [], library: null };

  const texts = new Map<string, string>();
  for (const file of files) if (file.text !== undefined) texts.set(file.path, file.text);
  const specPath = locateSpecPath(texts, spec);
  const resolve = (ref: string): string => resolvePath(specPath, ref);

  const library = ((): Library | null => {
    try {
      const textFiles = [...texts]
        .filter(([path]) => path.toLowerCase().endsWith('.json'))
        .sort(([a], [b]) => Number(b === specPath) - Number(a === specPath))
        .map(([path, text]) => ({ path, text }));
      return loadLibrary(textFiles);
    } catch {
      return null;
    }
  })();

  // Galeria e Experimentar desenham com os tokens (modo padrão) e os ícones da especialização,
  // como o canvas; sem isso o texto sai preto sobre cinza e todo ícone é desconhecido.
  const resolvedTokens = resolveTokens(library?.tokens, {});
  const resolvedIcons = library?.icons;
  const themed = (parsed: ComponentFile): ComponentFile => ({
    ...parsed,
    resolvedTokens,
    ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
  });

  const layers: CatalogLayer[] = spec.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    color: layer.color,
    entries: layer.annotationTypes.map((type): CatalogEntry => {
      let component: ComponentFile | null = null;
      let componentProblem: ModelMessage | undefined;
      if (type.component !== undefined) {
        const path = resolve(type.component);
        const text = texts.get(path);
        if (text === undefined) {
          componentProblem = modelMessage(
            'catalog.fileMissing',
            { path },
            `arquivo ausente (${path})`,
          );
        } else {
          const parsed = parseComponentText(text);
          if (parsed.ok) component = themed(parsed.component);
          else componentProblem = parseProblem(parsed.errors[0]);
        }
      }
      const examples = (type.examples ?? []).map((example): CatalogExample => {
        const base = {
          name: example.name,
          ...(example.description === undefined
            ? {}
            : { description: example.description }),
        };
        if (example.system !== undefined) {
          return {
            ...base,
            mode: 'system',
            system: example.system,
            ...(example.file === undefined
              ? {}
              : {
                  file: example.file,
                  json: parseJsonOrUndefined(texts.get(resolve(example.file))),
                }),
          };
        }
        return { ...base, mode: 'values', values: withRowIds(example.values ?? {}) };
      });
      return {
        type,
        layerId: layer.id,
        component,
        ...(componentProblem === undefined ? {} : { componentProblem }),
        container: component !== null && hasSlotComponent(component),
        docText:
          typeof type.doc === 'string' ? (texts.get(resolve(type.doc)) ?? null) : null,
        docExternal: docExternalOf(spec, type),
        fields: type.fields.map(fieldOf),
        code: codeOf(spec, type),
        sources: sourcesOf(type),
        examples,
        previewValues:
          component === null
            ? null
            : withRowIds({ ...defaultValues(type), ...(component.preview ?? {}) }),
      };
    }),
  }));
  return { spec, report, layers, library };
}

/** A entrada do tipo `typeId` (em qualquer camada), ou `undefined`. */
export function findEntry(catalog: Catalog, typeId: string): CatalogEntry | undefined {
  let byId = entryIndexes.get(catalog);
  if (byId === undefined) {
    byId = new Map();
    for (const layer of catalog.layers) {
      for (const entry of layer.entries) {
        if (!byId.has(entry.type.id)) byId.set(entry.type.id, entry);
      }
    }
    entryIndexes.set(catalog, byId);
  }
  return byId.get(typeId);
}

/** O problema de um componente que não passou no parse: o erro vem do parser, em texto. */
function parseProblem(error: string | undefined): ModelMessage {
  return error === undefined
    ? modelMessage('catalog.invalidComponent', {}, 'componente inválido')
    : rawMessage(error);
}

/** Entradas por id de tipo, uma vez por catálogo (o catálogo é imutável). */
const entryIndexes = new WeakMap<Catalog, Map<string, CatalogEntry>>();

// ---------------------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------------------

export interface CatalogDrawing {
  readonly root: FrameNode;
  readonly warnings: readonly ModelMessage[];
}

/** Intervalo do playground: do `minSize` (ou 1×1) ao dobro do `size`. */
export function playgroundSizeRange(component: ComponentFile): {
  min: Size;
  max: Size;
} {
  const min = {
    width: component.minSize?.width ?? 1,
    height: component.minSize?.height ?? 1,
  };
  return {
    min,
    max: {
      width: Math.max(min.width, component.size.width * 2),
      height: Math.max(min.height, component.size.height * 2),
    },
  };
}

/** Limita `size` (arredondado) ao intervalo do playground. */
export function clampPlaygroundSize(component: ComponentFile, size: Size): Size {
  const { min, max } = playgroundSizeRange(component);
  const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  return {
    width: clamp(size.width, min.width, max.width),
    height: clamp(size.height, min.height, max.height),
  };
}

export interface Axes {
  readonly width: boolean;
  readonly height: boolean;
}

/** Eixos em que o componente declara `sizing: 'hug'` (o tamanho acompanha o conteúdo). */
export function hugAxes(component: ComponentFile): Axes {
  return {
    width: component.sizing?.width === 'hug',
    height: component.sizing?.height === 'hug',
  };
}

/**
 * Tamanho do desenho que respeita o `sizing`: nos eixos `auto` (padrão: os `hug` do
 * componente) o tamanho é o do conteúdo, medido com `values`; nos demais fica o `base`
 * (padrão: o `size`). Tudo limitado ao intervalo do playground. Sem componente: 1×1.
 */
export function fittedSize(
  entry: CatalogEntry,
  values: FieldValues,
  measure: TextMeasurer,
  options: { readonly base?: Size; readonly auto?: Partial<Axes> } = {},
): Size {
  const component = entry.component;
  if (component === null) return { width: 1, height: 1 };
  const base = options.base ?? component.size;
  const hug = hugAxes(component);
  const autoW = options.auto?.width ?? hug.width;
  const autoH = options.auto?.height ?? hug.height;
  if (!autoW && !autoH) return clampPlaygroundSize(component, base);
  try {
    const measured = measureComponent(
      component,
      { ...defaultValues(entry.type), ...values },
      { width: autoW ? null : base.width, height: autoH ? null : base.height },
      { measure },
    );
    const fit = (v: number): number => Math.ceil(v - 1e-6);
    return clampPlaygroundSize(component, {
      width: autoW ? fit(measured.width) : base.width,
      height: autoH ? fit(measured.height) : base.height,
    });
  } catch {
    return clampPlaygroundSize(component, base);
  }
}

/** Desenha o componente da entrada com `values` no tamanho dado (padrão: o `size` do componente). `null` sem componente. */
export function drawEntry(
  entry: CatalogEntry,
  values: FieldValues,
  measure: TextMeasurer,
  size?: Size,
): CatalogDrawing | null {
  if (entry.component === null) return null;
  const box = { x: 0, y: 0, ...(size ?? entry.component.size) };
  const drawn = instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values },
    box,
    { measure },
  );
  // Os avisos do motor não têm código: seguem em texto.
  return { root: drawn.root, warnings: drawn.warnings.map(rawMessage) };
}

/**
 * Desenha um exemplo da entrada (`example` ausente = o `preview` do componente). Modo
 * `values`: instancia o componente; modo `system`: passa o JSON do nó pela declaração de
 * `origins` e desenha a árvore resultante (o `size` não vale: o tamanho vem do nó). `null`
 * quando não há o que desenhar (sem componente, arquivo ou origem ausentes); nunca lança.
 */
export function exampleDrawing(
  catalog: Catalog,
  entry: CatalogEntry,
  example: CatalogExample | undefined,
  measure: TextMeasurer,
  size?: Size,
): CatalogDrawing | null {
  try {
    if (example === undefined) {
      const values = entry.previewValues ?? {};
      return drawEntry(
        entry,
        values,
        measure,
        size ?? fittedSize(entry, values, measure),
      );
    }
    if (example.mode === 'values') {
      const values = example.values ?? {};
      return drawEntry(
        entry,
        values,
        measure,
        size ?? fittedSize(entry, values, measure),
      );
    }
    return systemDrawing(catalog, example, measure);
  } catch {
    return null;
  }
}

function systemDrawing(
  catalog: Catalog,
  example: CatalogExample,
  measure: TextMeasurer,
): CatalogDrawing | null {
  const origin = catalog.library?.origins.find((o) => o.system === example.system);
  if (catalog.library === null || origin === undefined || example.json === undefined) {
    return null;
  }
  const result = screenFromSource(
    nodeProbeLibrary(catalog.library, origin),
    { node: example.json },
    { system: origin.system, measure },
  );
  const warnings: ModelMessage[] = (result.warnings ?? []).map((w) =>
    rawMessage(withoutNodePrefix(w)),
  );
  if (result.error !== undefined) {
    return null;
  }
  const instances = result.screen === undefined ? [] : renderOrder(result.screen);
  const first = instances.find((i) => i.parentId === undefined);
  if (first === undefined) return null;
  const children: FrameNode[] = [];
  for (const instance of instances) {
    const entry = findEntry(catalog, instance.typeId);
    if (entry === undefined) {
      warnings.push(
        modelMessage(
          'catalog.typeOutside',
          { typeId: instance.typeId },
          `tipo "${instance.typeId}" fora da especialização`,
        ),
      );
      continue;
    }
    const drawn = drawEntry(entry, instance.values, measure, {
      width: instance.box.width,
      height: instance.box.height,
    });
    if (drawn === null) {
      warnings.push(
        modelMessage(
          'catalog.typeNoComponent',
          { typeId: instance.typeId },
          `tipo "${instance.typeId}" sem componente`,
        ),
      );
      continue;
    }
    warnings.push(...drawn.warnings);
    children.push({
      ...drawn.root,
      transform: translate(instance.box.x - first.box.x, instance.box.y - first.box.y),
    });
  }
  const root: FrameNode = {
    ...baseNode({
      id: 'example',
      name: example.name,
      width: first.box.width,
      height: first.box.height,
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  };
  return { root, warnings };
}
