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
import { parseComponent } from './parseComponent';

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
  /** Origens do campo (`sources`); numa origem executável o `name` é o caminho dentro de `props`. */
  readonly sources: readonly FieldSource[];
}

export interface TypeDef {
  readonly id: string;
  readonly name: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly layerColor: string;
  readonly labelField?: string;
  /** Ids dos tipos que podem ser filhos (ausente = qualquer um). */
  readonly allowedChildren?: readonly string[];
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
  /** O que não carregou: arquivo ausente, componente inválido, tipo sem componente. */
  readonly problems: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Resolve `ref` relativo ao diretório de `from` (`a/b/spec.json` + `components/x.json` → `a/b/components/x.json`). */
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
    // Numa origem executável o `name` é um caminho dentro de `props` (sem `[*]`).
    if (systems.has(source.system)) {
      const parsed = parsePath(source.name);
      if (!parsed.ok || parsed.segments.includes(null)) {
        problems.push(`${at}.name: caminho inválido "${source.name}"`);
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

/**
 * Monta a biblioteca a partir dos arquivos. Acha a especialização (o arquivo com
 * `"format": "mapping-spec"`; se houver mais de uma, usa a primeira e avisa) e carrega cada
 * componente referenciado. Lança só quando não há especialização.
 */
export function loadLibrary(files: readonly TextFile[]): Library {
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
      let component: ComponentFile | undefined;
      if (componentPath) {
        const full = resolvePath(specPath, componentPath);
        const json = parsed.get(full);
        if (json === undefined) {
          problems.push(`${type.id}: arquivo do componente não encontrado: ${full}`);
        } else {
          const result = parseComponent(json);
          if (result.ok) component = result.component;
          else
            for (const issue of result.issues)
              problems.push(
                `${full}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`,
              );
        }
      }
      const sources = parseTypeSources(type.sources, `${type.id}.sources`, problems);
      checkTypeSources(type.id, sources, component, problems);
      types.push({
        id: type.id,
        name: typeof type.name === 'string' ? type.name : type.id,
        layerId,
        layerName,
        layerColor,
        labelField: typeof type.labelField === 'string' ? type.labelField : undefined,
        allowedChildren: Array.isArray(type.allowedChildren)
          ? type.allowedChildren.filter((c): c is string => typeof c === 'string')
          : undefined,
        fields,
        componentPath,
        component,
        sources,
      });
    });
  });
  origins.forEach((origin, oi) => {
    origin.screen.roots.forEach((root, ri) => {
      if (root.scrim !== undefined && !types.some((t) => t.id === root.scrim)) {
        problems.push(
          `origins[${oi}].screen.roots[${ri}].scrim: tipo inexistente: ${root.scrim}`,
        );
      }
    });
  });
  const fonts = readFonts(spec.fonts, specPath, files, problems);
  return {
    specId: typeof spec.id === 'string' ? spec.id : 'spec',
    specName: typeof spec.name === 'string' ? spec.name : 'Especialização',
    specPath,
    types,
    fonts,
    origins,
    problems,
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
    const path = resolvePath(specPath, entry.file);
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
  return value === null || value === undefined || String(value).trim() === ''
    ? type.name
    : String(value);
}
