/**
 * Motor dos componentes (etapa Biblioteca): a biblioteca, lida de arquivos. A especialização (`mapping-spec`)
 * aponta, em cada tipo de anotação, para o arquivo do componente (`component`, caminho relativo
 * ao arquivo da especialização); cada componente é validado por `parseComponent`.
 *
 * As fontes dos arquivos (exemplos embutidos, `<input type="file" multiple>`, pasta pelo
 * `showDirectoryPicker`) viram a mesma lista `{ path, text }` antes de chegar aqui.
 */
import type { ComponentFile, FieldValue } from './componentFormat';
import { findSlot } from './arrange';
import {
  type FieldSource,
  type Origin,
  type TypeSource,
  parseFieldSources,
  parseOrigins,
  parsePath,
  parseTypeSources,
} from './origin';
import { parseIconsFile, type IconSet } from './icons';
import { parseComponent } from './parseComponent';
import { resolveTokens, type HostFonts, type SpecTokens } from './tokens';
import { isRecord } from '../isRecord';

export interface TextFile {
  /** Caminho relativo à raiz escolhida, com `/`. */
  readonly path: string;
  /** Conteúdo dos `.json` (ausente nos arquivos binários). */
  readonly text?: string;
  /** Bytes dos arquivos de fonte (`.ttf`, `.otf`, `.woff`, `.woff2`). */
  readonly bytes?: ArrayBuffer;
}

/** Extensões lidas como bytes (fontes do design system). */
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const;

export function isFontPath(path: string): boolean {
  const lower = path.toLowerCase();
  return FONT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Fonte declarada na especialização (`fonts`), com os bytes quando o arquivo veio junto. */
export interface LoadedFont {
  readonly family: string;
  /** Peso CSS: `"400"`, `"500"` ou uma faixa de fonte variável, `"100 900"`. */
  readonly weight: string;
  readonly style: 'normal' | 'italic';
  /** Caminho resolvido, relativo à raiz. */
  readonly path: string;
  readonly bytes?: ArrayBuffer;
}

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'table' | 'ref';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly default?: FieldValue;
  readonly description?: string;
  /** Origens do campo (`sources`); numa origem executável o `path` é o caminho dentro de `props`. */
  readonly sources: readonly FieldSource[];
}

export interface TypeDef {
  readonly id: string;
  readonly name: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly layerColor: string;
  readonly labelField?: string;
  readonly fields: readonly FieldDef[];
  /** Caminho do arquivo do componente, como está na especialização. */
  readonly componentPath?: string;
  /** O componente carregado (ausente quando o arquivo faltou ou era inválido). */
  readonly component?: ComponentFile;
  /** Elementos de sistemas externos a que o tipo corresponde (`sources`). */
  readonly sources: readonly TypeSource[];
}

export interface Library {
  readonly specId: string;
  readonly specName: string;
  readonly specPath: string;
  readonly types: readonly TypeDef[];
  /** Fontes declaradas pela especialização (`fonts`), com bytes quando o arquivo existe. */
  readonly fonts: readonly LoadedFont[];
  /** Origens executáveis declaradas (`origins`): como ler um JSON externo como tela. */
  readonly origins: readonly Origin[];
  /** `tokens` da especialização (lidos sem validar; o validador da biblioteca confere). */
  readonly tokens?: SpecTokens;
  /** Conjunto de ícones da especialização (`icons`), quando o arquivo existe e é válido. */
  readonly icons?: IconSet;
  /** O que não carregou: arquivo ausente, componente inválido, tipo sem componente. */
  readonly problems: readonly string[];
}

function parseJson(file: TextFile): unknown {
  try {
    return JSON.parse(file.text ?? '');
  } catch (error) {
    throw new Error(
      `${file.path}: JSON inválido (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
}

/**
 * Resolve `ref` relativo ao diretório de `from` (`a/b/spec.json` + `components/x.json` →
 * `a/b/components/x.json`). Devolve `undefined` quando um `..` sai da raiz da biblioteca.
 */
export function resolvePathChecked(from: string, ref: string): string | undefined {
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts: string[] = [];
  for (const part of `${dir}${ref}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.join('/');
}

/**
 * Como `resolvePathChecked`, mas um `..` que sai da raiz é descartado. Quem valida a biblioteca
 * (`loadLibrary`) usa a versão conferida e registra o problema.
 */
export function resolvePath(from: string, ref: string): string {
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts: string[] = [];
  for (const part of `${dir}${ref}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

type PathResolver = (from: string, ref: string) => string | undefined;

/** Opções de `loadLibrary`. */
export interface LoadLibraryOptions {
  /**
   * Um `..` que sai da raiz é descartado em vez de virar problema (`resolvePath`). Só para
   * quem carrega por URL, onde `../` é relativo à URL da especialização e não à biblioteca.
   */
  readonly allowOutside?: boolean;
}

const outsideLibrary = (ref: string): string => `caminho fora da biblioteca: ${ref}`;

function readField(
  raw: unknown,
  path: string,
  problems: string[],
  systems: ReadonlySet<string>,
): FieldDef | undefined {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.type !== 'string') {
    problems.push(`${path}: campo sem key/type`);
    return undefined;
  }
  const type = raw.type as FieldType;
  const def = raw.default;
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === 'string')
    : undefined;
  const sources = parseFieldSources(raw.sources, `${path}.sources`, problems);
  sources.forEach((source, index) => {
    const at = `${path}.sources[${index}]`;
    if (source.values) {
      if (type !== 'enum') {
        problems.push(`${at}.values: só vale em campo enum`);
      } else {
        for (const [from, to] of Object.entries(source.values)) {
          if (!options?.includes(to)) {
            problems.push(`${at}.values.${from}: destino fora de options: ${to}`);
          }
        }
      }
    }
    // Numa origem executável o `path` é o caminho dentro de `props` (sem `[*]`) e é obrigatório.
    if (systems.has(source.system)) {
      if (source.path === undefined) {
        problems.push(`${at}.path: obrigatório em sistema declarado em origins`);
      } else {
        const parsed = parsePath(source.path);
        if (!parsed.ok || parsed.segments.includes(null)) {
          problems.push(`${at}.path: caminho inválido "${source.path}"`);
        }
      }
    }
  });
  return {
    key: raw.key,
    label: typeof raw.label === 'string' ? raw.label : raw.key,
    type,
    required: raw.required === true,
    options,
    default: typeof def === 'string' || typeof def === 'number' ? def : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    sources,
  };
}

/** Confere o `slot` das origens do tipo contra o slot do componente. */
function checkTypeSources(
  id: string,
  sources: readonly TypeSource[],
  component: ComponentFile | undefined,
  problems: string[],
): void {
  if (!component) return;
  const slot = findSlot(component);
  sources.forEach((source, index) => {
    if (source.slot === undefined) return;
    const at = `${id}.sources[${index}].slot`;
    if (!slot) problems.push(`${at}: o componente não tem slot`);
    else if (slot.name !== source.slot) {
      problems.push(
        `${at}: o slot do componente é "${slot.name ?? ''}", não "${source.slot}"`,
      );
    }
  });
}

/** O componente do tipo: arquivo fora da biblioteca, ausente ou inválido vira problema. */
function loadComponent(
  typeId: string,
  componentPath: string,
  specPath: string,
  parsed: ReadonlyMap<string, unknown>,
  problems: string[],
  resolve: PathResolver,
): ComponentFile | undefined {
  const full = resolve(specPath, componentPath);
  if (full === undefined) {
    problems.push(`${typeId}: ${outsideLibrary(componentPath)}`);
    return undefined;
  }
  const json = parsed.get(full);
  if (json === undefined) {
    problems.push(`${typeId}: arquivo do componente não encontrado: ${full}`);
    return undefined;
  }
  const result = parseComponent(json);
  if (result.ok) return result.component;
  for (const issue of result.issues)
    problems.push(`${full}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  return undefined;
}

/** O `scrim` de cada raiz de tela precisa ser um tipo da biblioteca. */
function checkScrims(
  origins: readonly Origin[],
  typeIds: ReadonlySet<string>,
  problems: string[],
): void {
  origins.forEach((origin, oi) => {
    origin.screen.roots.forEach((root, ri) => {
      if (root.scrim !== undefined && !typeIds.has(root.scrim)) {
        problems.push(
          `origins[${oi}].screen.roots[${ri}].scrim: tipo inexistente: ${root.scrim}`,
        );
      }
    });
  });
}

/**
 * Monta a biblioteca a partir dos arquivos. Acha a especialização (o arquivo com
 * `"format": "mapping-spec"`; se houver mais de uma, usa a primeira e avisa) e carrega cada
 * componente referenciado. Lança só quando não há especialização.
 */
export function loadLibrary(
  files: readonly TextFile[],
  options: LoadLibraryOptions = {},
): Library {
  const resolve = options.allowOutside ? resolvePath : resolvePathChecked;
  const problems: string[] = [];
  const parsed = new Map<string, unknown>();
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.json')) continue;
    try {
      parsed.set(file.path, parseJson(file));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  const specs = [...parsed].filter(
    ([, json]) => isRecord(json) && json.format === 'mapping-spec',
  );
  const first = specs[0];
  if (!first) {
    throw new Error(
      'Nenhuma especialização encontrada: a pasta precisa de um arquivo com "format": "mapping-spec".',
    );
  }
  if (specs.length > 1) {
    problems.push(`há ${specs.length} especializações; usando ${first[0]}`);
  }
  const [specPath, specJson] = first;
  const spec = specJson as Record<string, unknown>;
  const parsedOrigins = parseOrigins(spec.origins);
  problems.push(...parsedOrigins.problems);
  const origins = parsedOrigins.origins;
  const systems = new Set(origins.map((o) => o.system));
  const types: TypeDef[] = [];
  const layers = Array.isArray(spec.layers) ? spec.layers : [];
  layers.forEach((layer, li) => {
    if (!isRecord(layer)) return;
    const layerId = typeof layer.id === 'string' ? layer.id : `layer-${li}`;
    const layerName = typeof layer.name === 'string' ? layer.name : layerId;
    const layerColor = typeof layer.color === 'string' ? layer.color : '#1E88E5';
    const annotationTypes = Array.isArray(layer.annotationTypes)
      ? layer.annotationTypes
      : [];
    annotationTypes.forEach((type, ti) => {
      if (!isRecord(type) || typeof type.id !== 'string') {
        problems.push(`layers[${li}].annotationTypes[${ti}]: tipo sem id`);
        return;
      }
      const fieldsRaw = Array.isArray(type.fields) ? type.fields : [];
      const fields = fieldsRaw
        .map((f, fi) => readField(f, `${type.id}.fields[${fi}]`, problems, systems))
        .filter((f): f is FieldDef => f !== undefined);
      const componentPath =
        typeof type.component === 'string' ? type.component : undefined;
      const component = componentPath
        ? loadComponent(type.id, componentPath, specPath, parsed, problems, resolve)
        : undefined;
      const sources = parseTypeSources(type.sources, `${type.id}.sources`, problems);
      checkTypeSources(type.id, sources, component, problems);
      types.push({
        id: type.id,
        name: typeof type.name === 'string' ? type.name : type.id,
        layerId,
        layerName,
        layerColor,
        labelField: typeof type.labelField === 'string' ? type.labelField : undefined,
        fields,
        componentPath,
        component,
        sources,
      });
    });
  });
  checkScrims(origins, new Set(types.map((t) => t.id)), problems);
  const fonts = readFonts(spec.fonts, specPath, files, problems, resolve);
  return withHostTokens(
    {
      specId: typeof spec.id === 'string' ? spec.id : 'spec',
      specName: typeof spec.name === 'string' ? spec.name : 'Especialização',
      specPath,
      types,
      fonts,
      origins,
      tokens: readTokens(spec.tokens),
      icons: readIcons(spec.icons, specPath, parsed, problems, resolve),
      problems,
    },
    {},
  );
}

/** O conjunto de ícones apontado por `icons` (arquivo ausente ou inválido vira problema). */
function readIcons(
  raw: unknown,
  specPath: string,
  parsed: ReadonlyMap<string, unknown>,
  problems: string[],
  resolve: PathResolver,
): IconSet | undefined {
  if (typeof raw !== 'string') return undefined;
  const path = resolve(specPath, raw);
  if (path === undefined) {
    problems.push(`icons: ${outsideLibrary(raw)}`);
    return undefined;
  }
  const json = parsed.get(path);
  if (json === undefined) {
    problems.push(`arquivo de ícones não encontrado: ${path}`);
    return undefined;
  }
  const result = parseIconsFile(json);
  if (result.ok) return result.set;
  for (const issue of result.issues)
    problems.push(`${path}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  return undefined;
}

/** `tokens` do JSON da especialização, na forma mínima (modos texto e valores texto, número ou por modo). */
function readTokens(raw: unknown): SpecTokens | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.modes) || !isRecord(raw.values))
    return undefined;
  const modes = raw.modes.filter((m): m is string => typeof m === 'string');
  return modes.length === 0
    ? undefined
    : { modes, values: raw.values as SpecTokens['values'] };
}

/**
 * A biblioteca com os componentes levando os tokens do modo (`resolvedTokens`): `font-sans` e
 * `font-mono` valem a fonte do hospedeiro, a menos que a especialização os redefina.
 */
export function withHostTokens(
  library: Library,
  fonts: HostFonts,
  mode?: string,
): Library {
  const resolvedTokens = resolveTokens(library.tokens, fonts, mode);
  const resolvedIcons = library.icons;
  return {
    ...library,
    types: library.types.map((type) =>
      type.component === undefined
        ? type
        : {
            ...type,
            component: {
              ...type.component,
              resolvedTokens,
              ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
            },
          },
    ),
  };
}

/**
 * `fonts` da especialização: `[{ "family": "Roboto", "file": "fonts/Roboto-Regular.ttf",
 * "weight": 400, "style": "normal" }]`. `weight` aceita número ou faixa (`"100 900"`, fonte
 * variável). Arquivo ausente não é problema da biblioteca: aparece no status das fontes.
 */
function readFonts(
  raw: unknown,
  specPath: string,
  files: readonly TextFile[],
  problems: string[],
  resolve: PathResolver,
): LoadedFont[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push('fonts: esperava uma lista');
    return [];
  }
  const byPath = new Map(files.filter((f) => f.bytes).map((f) => [f.path, f.bytes]));
  // Arquivos escolhidos soltos ("Abrir arquivos…") chegam só com o nome: vale o nome do arquivo.
  const byName = new Map(
    files
      .filter((f) => f.bytes)
      .map((f) => [f.path.slice(f.path.lastIndexOf('/') + 1), f.bytes]),
  );
  const out: LoadedFont[] = [];
  raw.forEach((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.family !== 'string' ||
      typeof entry.file !== 'string'
    ) {
      problems.push(`fonts[${index}]: precisa de family e file`);
      return;
    }
    const weight =
      typeof entry.weight === 'number'
        ? String(entry.weight)
        : typeof entry.weight === 'string' && entry.weight.trim() !== ''
          ? entry.weight.trim()
          : '400';
    const style = entry.style === 'italic' ? 'italic' : 'normal';
    const path = resolve(specPath, entry.file);
    if (path === undefined) {
      problems.push(`fonts[${index}]: ${outsideLibrary(entry.file)}`);
      return;
    }
    const bytes = byPath.get(path) ?? byName.get(path.slice(path.lastIndexOf('/') + 1));
    out.push({ family: entry.family, weight, style, path, bytes });
  });
  return out;
}

/** Valores iniciais de uma instância nova: `preview` do componente, senão o `default` do campo. */
export function initialValues(type: TypeDef): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of type.fields) {
    const preview = type.component?.preview?.[field.key];
    values[field.key] = preview !== undefined ? preview : (field.default ?? null);
  }
  return values;
}

/** Rótulo de uma instância: `labelField` preenchido, senão o nome do tipo. */
export function instanceLabel(
  type: TypeDef,
  values: Readonly<Record<string, FieldValue>>,
): string {
  const key = type.labelField;
  const value = key ? values[key] : undefined;
  // Só texto e número entram no rótulo; valor de tabela (lista) conta como vazio.
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text.trim() === '' ? type.name : text;
}
