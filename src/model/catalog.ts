import { isContainerComponent } from './componentCatalog';
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
import { type LibraryFile, type LibraryReport, validateLibrary } from './library';
import { defaultValues, nodeProbeLibrary, withoutNodePrefix } from './libraryDrawing';
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
  readonly values?: Readonly<Record<string, string | number | null>>;
  readonly system?: string;
  readonly file?: string;
  readonly json?: unknown;
}

export interface CatalogEntry {
  readonly type: SpecAnnotationType;
  readonly layerId: string;
  readonly component: ComponentFile | null;
  /** Por que não há componente (arquivo ausente ou inválido); ausente se o tipo não declara `component`. */
  readonly componentProblem?: string;
  readonly container: boolean;
  /** Texto do `.md` do tipo; `null` sem `doc` ou com o arquivo ausente. */
  readonly docText: string | null;
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

function codeOf(spec: Spec, type: SpecAnnotationType): CatalogCode[] {
  const platforms = new Map((spec.platforms ?? []).map((p) => [p.id, p]));
  const out: CatalogCode[] = [];
  for (const [id, code] of Object.entries(type.code ?? {})) {
    const platform = platforms.get(id);
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
    });
  }
  return out;
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
function locateSpecPath(files: readonly LibraryFile[], spec: Spec): string {
  const texts = new Map<string, unknown>();
  for (const file of files) if (file.text !== undefined) texts.set(file.path, file.text);
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

  const specPath = locateSpecPath(files, spec);
  const texts = new Map<string, string>();
  for (const file of files) if (file.text !== undefined) texts.set(file.path, file.text);
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

  const layers: CatalogLayer[] = spec.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    color: layer.color,
    entries: layer.annotationTypes.map((type): CatalogEntry => {
      let component: ComponentFile | null = null;
      let componentProblem: string | undefined;
      if (type.component !== undefined) {
        const path = resolve(type.component);
        const text = texts.get(path);
        if (text === undefined) {
          componentProblem = `arquivo ausente (${path})`;
        } else {
          const parsed = parseComponentText(text);
          if (parsed.ok) component = parsed.component;
          else componentProblem = parsed.errors[0] ?? 'componente inválido';
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
        return { ...base, mode: 'values', values: example.values ?? {} };
      });
      return {
        type,
        layerId: layer.id,
        component,
        ...(componentProblem === undefined ? {} : { componentProblem }),
        container: component !== null && isContainerComponent(component),
        docText: type.doc === undefined ? null : (texts.get(resolve(type.doc)) ?? null),
        fields: type.fields.map(fieldOf),
        code: codeOf(spec, type),
        sources: sourcesOf(type),
        examples,
        previewValues:
          component === null
            ? null
            : { ...defaultValues(type), ...(component.preview ?? {}) },
      };
    }),
  }));
  return { spec, report, layers, library };
}

/** A entrada do tipo `typeId` (em qualquer camada), ou `undefined`. */
export function findEntry(catalog: Catalog, typeId: string): CatalogEntry | undefined {
  for (const layer of catalog.layers) {
    const found = layer.entries.find((entry) => entry.type.id === typeId);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------------------

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CatalogDrawing {
  readonly root: FrameNode;
  readonly warnings: readonly string[];
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
  return instantiate(entry.component, { ...defaultValues(entry.type), ...values }, box, {
    measure,
  });
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
  const warnings = (result.warnings ?? []).map(withoutNodePrefix);
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
      warnings.push(`tipo "${instance.typeId}" fora da especialização`);
      continue;
    }
    const drawn = drawEntry(entry, instance.values, measure, {
      width: instance.box.width,
      height: instance.box.height,
    });
    if (drawn === null) {
      warnings.push(`tipo "${instance.typeId}" sem componente`);
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
