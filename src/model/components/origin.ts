/**
 * Motor dos componentes (etapa Biblioteca): declaração de origem executável (fase L2). A especialização diz
 * como ler um JSON externo (SDUI de um backend, por exemplo) e transformá-lo numa tela:
 *
 * - `origins` (raiz da especialização): onde ficam a largura, a altura e as raízes da tela, e
 *   quais chaves do nó são o tipo, as props e os filhos;
 * - `sources` nos tipos e nos campos (o mesmo formato da `formatVersion` 3, com `slot` e
 *   `ignore` a mais): a que tipo externo cada tipo corresponde e de que caminho de `props` vem
 *   cada campo.
 *
 * O núcleo não conhece nenhum sistema: `system` é só um nome. `translateSource` produz a árvore
 * sem geometria (`LayoutScreen`); `screenFromSource` a arruma (`layoutScreen`) numa `Screen`.
 * Puro, sem DOM, e nunca lança: o que não deu certo vira `error` ou aviso.
 */
import { mergeMessages, textsOf } from '../messages/collector';
import { templateMessage, type ModelMessageTemplateCode } from '../messages';
import type { ModelMessage } from '../modelMessage';
import type { FieldValue, FieldValues } from './componentFormat';
import type { TextMeasurer } from './instantiate';
import {
  LAYOUT_ANCHORS,
  layoutScreen,
  type LayoutNode,
  type LayoutRoot,
  type LayoutScreen,
  type LayoutAnchor,
} from './layout';
import type { FieldDef, Library, TypeDef } from './library';
import type { Screen } from './screen';
import { packagePathError } from '../packagePaths';
import { packagePathMsg, pathErrorMsg } from '../specIssueCode';
import { originCodeForText, originSpecCodeForText } from '../messages/textLookup';
import { isRecord } from '../isRecord';

// ---------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------

export type Literal = string | number;

/** Um literal, ou um caminho (com tradução de valores e valor padrão). */
export type ValueSource =
  | Literal
  | {
      readonly path: string;
      /** Valor de origem (texto) → valor traduzido. */
      readonly values?: Readonly<Record<string, string>>;
      readonly default?: Literal;
    };

export interface RootSource {
  /** Caminho da raiz no documento; `[*]` = cada elemento da lista vira uma raiz. */
  readonly path: string;
  /** Âncora na tela (caminho relativo ao nó da raiz); ausente = no fluxo. */
  readonly anchor?: ValueSource;
  /** Margem das bordas da âncora, em px (caminho relativo ao nó da raiz). */
  readonly margin?: ValueSource;
  /** Id do tipo desenhado por baixo da raiz, cobrindo a tela (película de modal). */
  readonly scrim?: string;
}

export interface ScreenSource {
  readonly id?: ValueSource;
  readonly name?: ValueSource;
  readonly width: ValueSource;
  readonly height: ValueSource;
  readonly background?: ValueSource;
  readonly roots: readonly RootSource[];
}

/** Jeito de a origem produzir a tela: `tree` (padrão, JSON de backend) ou `measured` (retângulos medidos). */
export const ORIGIN_KINDS = ['tree', 'measured'] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

/** Chaves do nó de uma árvore medida: fixas (`{ type, id?, classes?, rect, props?, children? }`). */
const MEASURED_NODE: Origin['node'] = {
  type: 'type',
  props: 'props',
  children: 'children',
};
/** Tela sem raízes: uma origem `measured` não gera tela, só marcações (`importMeasured`). */
const MEASURED_SCREEN: ScreenSource = { width: 0, height: 0, roots: [] };

/**
 * Origem como a especialização a guarda e grava (`Spec.origins`): a `measured` não tem `node` nem
 * `screen` (o leitor recusa as duas chaves), a `tree` tem os dois.
 */
export type SpecOrigin = Omit<Origin, 'node' | 'screen'> &
  Partial<Pick<Origin, 'node' | 'screen'>>;

/** Tira de uma origem `measured` o `node` e a `screen` fixos internos: é a forma que se grava e se relê. */
export function toSpecOrigin(origin: Origin): SpecOrigin {
  if (origin.kind !== 'measured') return origin;
  return {
    system: origin.system,
    kind: origin.kind,
    ...(origin.name !== undefined ? { name: origin.name } : {}),
    ...(origin.booleans ? { booleans: origin.booleans } : {}),
  };
}

export interface Origin {
  readonly system: string;
  /** `tree` (padrão) ou `measured` (formatVersion 15): esta não tem `node`, `screen` nem `examples` próprios. */
  readonly kind?: OriginKind;
  readonly name?: string;
  /** Chaves do nó no documento. */
  readonly node: {
    readonly type: string;
    readonly props: string;
    readonly children: string;
  };
  readonly screen: ScreenSource;
  /** Tradução de um booleano JSON para texto, nos campos sem `values` próprio. */
  readonly booleans?: { readonly true: string; readonly false: string };
  /** Telas de exemplo (JSON inteiro de uma tela) no pacote da especialização. */
  readonly examples?: readonly OriginExample[];
}

/** Uma tela de exemplo de um sistema externo: nome único na origem e arquivo `.json` do pacote. */
export interface OriginExample {
  readonly name: string;
  readonly file: string;
}

/** `sources` de um tipo de anotação (formato v3 + `slot` e `ignore`). */
export interface TypeSource {
  readonly system: string;
  readonly id?: string;
  readonly name?: string;
  /** Nome do nó `slot` do template que recebe os filhos (ausente = o slot do componente). */
  readonly slot?: string;
  /** Props aceitas e não desenhadas (sem aviso de propriedade desconhecida). */
  readonly ignore?: readonly string[];
}

/**
 * `sources` de um campo. Numa origem executável o caminho do valor dentro de `props` vem de
 * `path` (obrigatório ali, conferido por `readField`) e `name` é só o nome da propriedade de
 * origem; nos demais sistemas vale `name`. Nunca se lê o caminho de `name`.
 */
export interface FieldSource {
  readonly system: string;
  readonly name?: string;
  /** Caminho do valor dentro de `props` do nó externo (`a.b[0].c`, sem `[*]`). */
  readonly path?: string;
  readonly values?: Readonly<Record<string, string>>;
}

export interface TranslateResult {
  readonly layout?: LayoutScreen;
  readonly warnings: string[];
  /** Os mesmos avisos com código e parâmetros (`warnings` = textos destes, na mesma ordem). */
  readonly messages: readonly ModelMessage[];
  readonly error?: string;
  /** O `error` com código e parâmetros (`error` = o texto dele); ausente se o erro foi uma exceção. */
  readonly errorMessage?: ModelMessage;
}

export interface SourceResult {
  readonly screen?: Screen;
  readonly warnings: readonly string[];
  readonly messages: readonly ModelMessage[];
  readonly error?: string;
  readonly errorMessage?: ModelMessage;
}

export interface SourceOptions {
  /** Sistema da origem; ausente = a primeira origem da especialização. */
  readonly system?: string;
}

// ---------------------------------------------------------------------------------------
// Caminhos: `a.b[0].c`
// ---------------------------------------------------------------------------------------

/** Chave (texto), índice (número) ou `[*]` (`null`). */
export type PathSegment = string | number | null;

export type ParsedPath =
  | { readonly ok: true; readonly segments: readonly PathSegment[] }
  | { readonly ok: false; readonly error: string };

export function parsePath(text: string): ParsedPath {
  const segments: PathSegment[] = [];
  let i = 0;
  const readKey = (): string | undefined => {
    const start = i;
    while (i < text.length && text[i] !== '.' && text[i] !== '[' && text[i] !== ']') i++;
    return i > start ? text.slice(start, i) : undefined;
  };
  const first = readKey();
  if (first === undefined) return { ok: false, error: 'segmento vazio' };
  segments.push(first);
  while (i < text.length) {
    const ch = text[i];
    if (ch === '.') {
      i++;
      const key = readKey();
      if (key === undefined) return { ok: false, error: 'segmento vazio' };
      segments.push(key);
    } else if (ch === '[') {
      const close = text.indexOf(']', i);
      if (close < 0) return { ok: false, error: 'faltou "]"' };
      const inner = text.slice(i + 1, close);
      if (inner === '*') segments.push(null);
      else if (/^\d+$/.test(inner)) segments.push(Number(inner));
      else return { ok: false, error: `índice inválido: [${inner}]` };
      i = close + 1;
    } else {
      return { ok: false, error: `caractere inesperado: ${ch ?? ''}` };
    }
  }
  return { ok: true, segments };
}

/** `['a', 'b', 0, 'c']` → `a.b[0].c` (`null` vira `[*]`). */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '';
  for (const segment of segments) {
    if (typeof segment === 'string') out += out === '' ? segment : `.${segment}`;
    else out += segment === null ? '[*]' : `[${segment}]`;
  }
  return out;
}

export interface ReadResult {
  readonly found: boolean;
  readonly value?: unknown;
}

const NOT_FOUND: ReadResult = { found: false };

/** Lê o caminho em `root`. `[*]` e valor `null`/`undefined` contam como não encontrado. */
export function readPath(
  root: unknown,
  path: string | readonly PathSegment[],
): ReadResult {
  let segments: readonly PathSegment[];
  if (typeof path === 'string') {
    const parsed = parsePath(path);
    if (!parsed.ok) return NOT_FOUND;
    segments = parsed.segments;
  } else {
    segments = path;
  }
  let current: unknown = root;
  for (const segment of segments) {
    if (segment === null) return NOT_FOUND;
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return NOT_FOUND;
      current = current[segment];
    } else {
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return NOT_FOUND;
      current = current[segment];
    }
  }
  if (current === null || current === undefined) return NOT_FOUND;
  return { found: true, value: current };
}

/** Expande os `[*]` do caminho: um resultado por elemento, com o caminho concreto. */
function expandPath(
  root: unknown,
  segments: readonly PathSegment[],
): { path: string; value: unknown }[] {
  const out: { path: string; value: unknown }[] = [];
  const visit = (current: unknown, index: number, done: readonly PathSegment[]): void => {
    if (current === null || current === undefined) return;
    if (index === segments.length) {
      out.push({ path: formatPath(done), value: current });
      return;
    }
    const segment = segments[index];
    if (segment === undefined) return;
    if (segment === null) {
      if (Array.isArray(current)) {
        current.forEach((item, i) => visit(item, index + 1, [...done, i]));
      }
    } else if (typeof segment === 'number') {
      if (Array.isArray(current) && segment < current.length) {
        visit(current[segment], index + 1, [...done, segment]);
      }
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      visit(current[segment], index + 1, [...done, segment]);
    }
  };
  visit(root, 0, []);
  return out;
}

// ---------------------------------------------------------------------------------------
// Validação (estrita, com caminho)
// ---------------------------------------------------------------------------------------

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Um problema da declaração das origens como dado: o `path` é o caminho em texto
 * (`origins[0].screen.roots[1].path`), o `message` o texto pt-BR sem o caminho e o `code` e os
 * `params` o do catálogo de mensagens do modelo (a interface traduz). Quem monta o texto com um
 * valor do usuário (chave, âncora, nome, caminho) o emite já com o código, por `codedProblem`, e
 * não se acha o código lendo o texto de volta.
 */
export interface OriginProblem {
  readonly path: string;
  readonly message: string;
  readonly code?: ModelMessageTemplateCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** O problema como texto (`caminho: mensagem`), o formato da biblioteca dos componentes. */
export function originProblemText(problem: OriginProblem): string {
  return `${problem.path}: ${problem.message}`;
}

/**
 * Acrescenta um problema de texto constante; o código sai pelo texto exato (catálogo `origins`,
 * depois `spec`), sem padrão: texto com valor do usuário vai por `codedProblem`.
 */
function problem(problems: OriginProblem[], path: string, message: string): void {
  const hit = originCodeForText(message) ?? originSpecCodeForText(message);
  problems.push(
    hit === undefined ? { path, message } : { path, message, code: hit.code },
  );
}

/** Acrescenta um problema do catálogo com parâmetros: o texto é o do modelo preenchido. */
function codedProblem(
  problems: OriginProblem[],
  path: string,
  code: ModelMessageTemplateCode,
  params: Readonly<Record<string, string | number>>,
): void {
  problems.push({ path, message: templateMessage(code, params).text, code, params });
}

function checkKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  problems: OriginProblem[],
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      codedProblem(problems, `${path}.${key}`, 'spec.tokenKeyUnknown', { key });
    }
  }
}

/** Confere um caminho; `wildcard` libera `[*]` (só em `roots[].path`). */
function checkPath(
  value: unknown,
  path: string,
  problems: OriginProblem[],
  wildcard = false,
): boolean {
  if (!nonEmptyString(value)) {
    problem(problems, path, 'esperava um caminho (texto não vazio)');
    return false;
  }
  const parsed = parsePath(value);
  if (!parsed.ok) {
    const error = pathErrorMsg(value, parsed.error);
    codedProblem(problems, path, error.code, error.params);
    return false;
  }
  if (!wildcard && parsed.segments.includes(null)) {
    problem(problems, path, '"[*]" só vale em roots[].path');
    return false;
  }
  return true;
}

function parseStringMap(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): Record<string, string> | undefined {
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava um objeto (origem → destino)');
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, target] of Object.entries(raw)) {
    if (typeof target !== 'string') {
      problem(problems, `${path}.${key}`, 'esperava texto');
    } else {
      out[key] = target;
    }
  }
  return out;
}

function parseValueSource(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): ValueSource | undefined {
  if (typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))) {
    return raw;
  }
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava um literal ou { path }');
    return undefined;
  }
  const before = problems.length;
  checkKeys(raw, ['path', 'values', 'default'], path, problems);
  checkPath(raw.path, `${path}.path`, problems);
  const values =
    raw.values === undefined
      ? undefined
      : parseStringMap(raw.values, `${path}.values`, problems);
  let def: Literal | undefined;
  if (raw.default !== undefined) {
    if (typeof raw.default === 'string' || typeof raw.default === 'number') {
      def = raw.default;
    } else {
      problem(problems, `${path}.default`, 'esperava texto ou número');
    }
  }
  if (problems.length > before) return undefined;
  return {
    path: raw.path as string,
    ...(values ? { values } : {}),
    ...(def !== undefined ? { default: def } : {}),
  };
}

function parseRoot(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): RootSource | undefined {
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava um objeto');
    return undefined;
  }
  const before = problems.length;
  checkKeys(raw, ['path', 'anchor', 'margin', 'scrim'], path, problems);
  checkPath(raw.path, `${path}.path`, problems, true);
  let anchor: ValueSource | undefined;
  if (raw.anchor !== undefined) {
    anchor = parseValueSource(raw.anchor, `${path}.anchor`, problems);
    const literal =
      typeof anchor === 'string'
        ? anchor
        : typeof anchor === 'object' && typeof anchor.default === 'string'
          ? anchor.default
          : undefined;
    if (literal !== undefined && !LAYOUT_ANCHORS.includes(literal as LayoutAnchor)) {
      codedProblem(problems, `${path}.anchor`, 'origins.anchorInvalid', {
        anchor: literal,
        anchors: LAYOUT_ANCHORS.join(', '),
      });
    }
  }
  const margin =
    raw.margin === undefined
      ? undefined
      : parseValueSource(raw.margin, `${path}.margin`, problems);
  if (margin !== undefined && anchor === undefined) {
    problem(problems, `${path}.margin`, 'margin só vale com anchor');
  }
  if (raw.scrim !== undefined && !nonEmptyString(raw.scrim)) {
    problem(problems, `${path}.scrim`, 'esperava o id de um tipo (texto não vazio)');
  }
  if (problems.length > before) return undefined;
  return {
    path: raw.path as string,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(typeof raw.scrim === 'string' ? { scrim: raw.scrim } : {}),
  };
}

function parseScreen(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): ScreenSource | undefined {
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava um objeto');
    return undefined;
  }
  const before = problems.length;
  checkKeys(
    raw,
    ['id', 'name', 'width', 'height', 'background', 'roots'],
    path,
    problems,
  );
  const optional = (key: 'id' | 'name' | 'background'): ValueSource | undefined =>
    raw[key] === undefined
      ? undefined
      : parseValueSource(raw[key], `${path}.${key}`, problems);
  const id = optional('id');
  const name = optional('name');
  const background = optional('background');
  const required = (key: 'width' | 'height'): ValueSource | undefined => {
    if (raw[key] === undefined) {
      problem(problems, `${path}.${key}`, 'obrigatório');
      return undefined;
    }
    return parseValueSource(raw[key], `${path}.${key}`, problems);
  };
  const width = required('width');
  const height = required('height');
  const roots: RootSource[] = [];
  if (!Array.isArray(raw.roots) || raw.roots.length === 0) {
    problem(problems, `${path}.roots`, 'esperava uma lista com pelo menos uma raiz');
  } else {
    raw.roots.forEach((item, index) => {
      const root = parseRoot(item, `${path}.roots[${index}]`, problems);
      if (root) roots.push(root);
    });
  }
  if (problems.length > before || width === undefined || height === undefined) {
    return undefined;
  }
  return {
    ...(id !== undefined ? { id } : {}),
    ...(name !== undefined ? { name } : {}),
    width,
    height,
    ...(background !== undefined ? { background } : {}),
    roots,
  };
}

function parseBooleans(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): Origin['booleans'] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava { "true": texto, "false": texto }');
    return undefined;
  }
  checkKeys(raw, ['true', 'false'], path, problems);
  const t = raw.true;
  const f = raw.false;
  if (typeof t !== 'string') problem(problems, `${path}.true`, 'esperava texto');
  if (typeof f !== 'string') problem(problems, `${path}.false`, 'esperava texto');
  return typeof t === 'string' && typeof f === 'string'
    ? { true: t, false: f }
    : undefined;
}

/** Origem `measured`: só `system`, `kind`, `name` e `booleans` (o nó e a árvore são fixos). */
function parseMeasuredOrigin(
  raw: Record<string, unknown>,
  path: string,
  problems: OriginProblem[],
): Origin | undefined {
  const before = problems.length;
  checkKeys(raw, ['system', 'kind', 'name', 'booleans'], path, problems);
  if (!nonEmptyString(raw.system)) {
    problem(problems, `${path}.system`, 'esperava texto não vazio');
  }
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    problem(problems, `${path}.name`, 'esperava texto');
  }
  const booleans = parseBooleans(raw.booleans, `${path}.booleans`, problems);
  if (problems.length > before) return undefined;
  return {
    system: raw.system as string,
    kind: 'measured',
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    node: MEASURED_NODE,
    screen: MEASURED_SCREEN,
    ...(booleans ? { booleans } : {}),
  };
}

function parseOrigin(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): Origin | undefined {
  if (!isRecord(raw)) {
    problem(problems, path, 'esperava um objeto');
    return undefined;
  }
  const kind = raw.kind === undefined ? 'tree' : raw.kind;
  if (!ORIGIN_KINDS.includes(kind as OriginKind)) {
    codedProblem(problems, `${path}.kind`, 'origins.expectedKind', {
      kinds: ORIGIN_KINDS.join(', '),
    });
    return undefined;
  }
  if (kind === 'measured') return parseMeasuredOrigin(raw, path, problems);
  const before = problems.length;
  checkKeys(
    raw,
    ['system', 'kind', 'name', 'node', 'screen', 'booleans', 'examples'],
    path,
    problems,
  );
  if (!nonEmptyString(raw.system)) {
    problem(problems, `${path}.system`, 'esperava texto não vazio');
  }
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    problem(problems, `${path}.name`, 'esperava texto');
  }
  let node: Origin['node'] | undefined;
  if (!isRecord(raw.node)) {
    problem(problems, `${path}.node`, 'esperava um objeto com type, props e children');
  } else {
    const nodePath = `${path}.node`;
    checkKeys(raw.node, ['type', 'props', 'children'], nodePath, problems);
    const keyOk = (key: 'type' | 'props' | 'children'): boolean => {
      if (nonEmptyString((raw.node as Record<string, unknown>)[key])) return true;
      problem(
        problems,
        `${nodePath}.${key}`,
        'obrigatório (nome da chave, texto não vazio)',
      );
      return false;
    };
    const ok = [keyOk('type'), keyOk('props'), keyOk('children')].every(Boolean);
    if (ok) {
      const n = raw.node;
      node = {
        type: n.type as string,
        props: n.props as string,
        children: n.children as string,
      };
    }
  }
  const screen =
    raw.screen === undefined
      ? (problem(problems, `${path}.screen`, 'obrigatório'), undefined)
      : parseScreen(raw.screen, `${path}.screen`, problems);
  const booleans = parseBooleans(raw.booleans, `${path}.booleans`, problems);
  const examples =
    raw.examples === undefined
      ? undefined
      : parseOriginExamples(raw.examples, `${path}.examples`, problems);
  if (problems.length > before || !node || !screen) return undefined;
  return {
    system: raw.system as string,
    ...(raw.kind === 'tree' ? { kind: 'tree' as const } : {}),
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    node,
    screen,
    ...(booleans ? { booleans } : {}),
    ...(examples ? { examples } : {}),
  };
}

/** `examples` de uma origem: `name` não vazio e único, `file` caminho de pacote `.json`. */
function parseOriginExamples(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): OriginExample[] | undefined {
  if (!Array.isArray(raw)) {
    problem(problems, path, 'esperava uma lista');
    return undefined;
  }
  const out: OriginExample[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) {
      problem(problems, at, 'esperava um objeto');
      return;
    }
    const before = problems.length;
    checkKeys(item, ['name', 'file'], at, problems);
    if (!nonEmptyString(item.name)) {
      problem(problems, `${at}.name`, 'esperava texto não vazio');
    } else if (seen.has(item.name)) {
      codedProblem(problems, `${at}.name`, 'spec.exampleNameRepeated', {
        name: item.name,
      });
    } else {
      seen.add(item.name);
    }
    if (typeof item.file !== 'string') {
      problem(problems, `${at}.file`, 'esperava o caminho de um arquivo .json do pacote');
    } else {
      const error = packagePathError(item.file, '.json');
      if (error !== undefined) {
        const msg = packagePathMsg(error);
        codedProblem(problems, `${at}.file`, msg.code, msg.params);
      }
    }
    if (problems.length > before) return;
    out.push({ name: item.name as string, file: item.file as string });
  });
  return out;
}

/**
 * `origins` da especialização. Estrito: chave desconhecida é problema, com o caminho
 * (`origins[0].screen.roots[1].path: …`). Uma origem com problema é descartada; as outras
 * seguem. `[*]` só vale em `roots[].path`.
 */
export function parseOrigins(
  raw: unknown,
  path = 'origins',
): { origins: Origin[]; problems: OriginProblem[] } {
  const problems: OriginProblem[] = [];
  const origins: Origin[] = [];
  if (raw === undefined) return { origins, problems };
  if (!Array.isArray(raw)) {
    problem(problems, path, 'esperava uma lista');
    return { origins, problems };
  }
  raw.forEach((item, index) => {
    const origin = parseOrigin(item, `${path}[${index}]`, problems);
    if (!origin) return;
    if (origins.some((o) => o.system === origin.system)) {
      codedProblem(problems, `${path}[${index}].system`, 'origins.systemRepeated', {
        system: origin.system,
      });
      return;
    }
    origins.push(origin);
  });
  return { origins, problems };
}

/** `sources` de um tipo (qualquer sistema). Entrada malformada vira problema e é descartada. */
export function parseTypeSources(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): TypeSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problem(problems, path, 'esperava uma lista');
    return [];
  }
  const out: TypeSource[] = [];
  raw.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) {
      problem(problems, at, 'esperava um objeto');
      return;
    }
    const before = problems.length;
    checkKeys(item, ['system', 'id', 'name', 'slot', 'ignore'], at, problems);
    if (!nonEmptyString(item.system))
      problem(problems, `${at}.system`, 'esperava texto não vazio');
    for (const key of ['id', 'name', 'slot'] as const) {
      if (item[key] !== undefined && !nonEmptyString(item[key])) {
        problem(problems, `${at}.${key}`, 'esperava texto não vazio');
      }
    }
    if (item.id === undefined && item.name === undefined) {
      problem(problems, at, 'precisa de id ou name');
    }
    let ignore: string[] | undefined;
    if (item.ignore !== undefined) {
      if (Array.isArray(item.ignore) && item.ignore.every(nonEmptyString)) {
        ignore = item.ignore as string[];
      } else {
        problem(problems, `${at}.ignore`, 'esperava uma lista de textos');
      }
    }
    if (problems.length > before) return;
    out.push({
      system: item.system as string,
      ...(typeof item.id === 'string' ? { id: item.id } : {}),
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.slot === 'string' ? { slot: item.slot } : {}),
      ...(ignore ? { ignore } : {}),
    });
  });
  return out;
}

/** `sources` de um campo (qualquer sistema). */
export function parseFieldSources(
  raw: unknown,
  path: string,
  problems: OriginProblem[],
): FieldSource[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problem(problems, path, 'esperava uma lista');
    return [];
  }
  const out: FieldSource[] = [];
  raw.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(item)) {
      problem(problems, at, 'esperava um objeto');
      return;
    }
    const before = problems.length;
    checkKeys(item, ['system', 'name', 'path', 'values'], at, problems);
    if (!nonEmptyString(item.system))
      problem(problems, `${at}.system`, 'esperava texto não vazio');
    if (item.name !== undefined && !nonEmptyString(item.name))
      problem(problems, `${at}.name`, 'esperava texto não vazio');
    if (item.path !== undefined) checkPath(item.path, `${at}.path`, problems);
    if (item.name === undefined && item.path === undefined)
      problem(problems, at, 'precisa de name ou path');
    const values =
      item.values === undefined
        ? undefined
        : parseStringMap(item.values, `${at}.values`, problems);
    if (problems.length > before) return;
    out.push({
      system: item.system as string,
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.path === 'string' ? { path: item.path } : {}),
      ...(values ? { values } : {}),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Tradução
// ---------------------------------------------------------------------------------------

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/** Valor de uma `ValueSource` no documento (ou no nó): traduzido por `values`, senão `default`. */
function readSource(source: ValueSource | undefined, doc: unknown): unknown {
  if (source === undefined) return undefined;
  if (typeof source !== 'object') return source;
  const read = readPath(doc, source.path);
  if (!read.found) return source.default;
  const value = read.value;
  if (isScalar(value) && source.values) {
    const key = String(value);
    if (Object.hasOwn(source.values, key)) return source.values[key];
  }
  return value;
}

function describeSource(source: ValueSource): string {
  return typeof source === 'object' ? source.path : String(source);
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

interface Context {
  readonly origin: Origin;
  readonly byName: ReadonlyMap<string, TypeDef>;
  readonly messages: ModelMessage[];
}

function sourceOf(type: TypeDef, system: string, name: string): TypeSource | undefined {
  return type.sources.find((s) => s.system === system && s.name === name);
}

function fieldPath(field: FieldDef, system: string): string | undefined {
  return field.sources.find((s) => s.system === system)?.path;
}

function firstKey(path: string): string | undefined {
  const parsed = parsePath(path);
  const first = parsed.ok ? parsed.segments[0] : undefined;
  return typeof first === 'string' ? first : undefined;
}

/** O que o valor de um campo precisa do campo (da biblioteca ou da especialização). */
export type FieldLike = Pick<
  FieldDef,
  'key' | 'type' | 'options' | 'default' | 'sources'
>;

/** O que o valor de um campo precisa da origem: o sistema, os booleanos e a chave das props. */
export interface FieldContext {
  readonly origin: Pick<Origin, 'system' | 'booleans'> & {
    readonly node: Pick<Origin['node'], 'props'>;
  };
  readonly messages: ModelMessage[];
}

/** O valor de um campo lido de `props` pelo `path` da `source` do sistema (com `values`); avisa o que não serve. */
export function translateFieldValue(
  field: FieldLike,
  props: Record<string, unknown>,
  nodePath: string,
  ctx: FieldContext,
): FieldValue {
  const fallback: FieldValue = field.default ?? null;
  const source = field.sources.find((s) => s.system === ctx.origin.system);
  if (!source) return fallback;
  // Entrada sem `path` (a biblioteca já a registrou como problema) não lê nada.
  if (source.path === undefined) return fallback;
  const read = readPath(props, source.path);
  if (!read.found) return fallback;
  const where = `${nodePath}.${ctx.origin.node.props}.${source.path}`;
  const raw = read.value;
  if (!isScalar(raw)) {
    ctx.messages.push(templateMessage('origins.draw.notScalar', { path: where }));
    return null;
  }
  const values = source.values;
  let value: FieldValue;
  if (typeof raw === 'boolean') {
    const key = String(raw);
    if (values && Object.hasOwn(values, key)) value = values[key];
    else if (ctx.origin.booleans) value = ctx.origin.booleans[key as 'true' | 'false'];
    else value = key;
  } else if (typeof raw === 'number') {
    const key = String(raw);
    if (field.type === 'number') value = raw;
    else if (values && Object.hasOwn(values, key)) value = values[key];
    else value = key;
  } else if (values && Object.hasOwn(values, raw)) {
    value = values[raw];
  } else {
    value = raw;
  }
  if (
    field.type === 'enum' &&
    field.options &&
    value !== null &&
    value !== undefined &&
    !field.options.includes(String(value))
  ) {
    ctx.messages.push(
      templateMessage('origins.draw.optionOutside', {
        path: where,
        key: field.key,
        value: String(value),
      }),
    );
  }
  return value;
}

function translateNode(raw: unknown, path: string, ctx: Context): LayoutNode | undefined {
  const { origin, messages } = ctx;
  if (!isRecord(raw)) {
    messages.push(templateMessage('origins.draw.nodeInvalid', { path }));
    return undefined;
  }
  const typeName = raw[origin.node.type];
  if (typeof typeName !== 'string' || typeName === '') {
    messages.push(
      templateMessage('origins.draw.typeMissing', {
        path: `${path}.${origin.node.type}`,
      }),
    );
    return undefined;
  }
  const type = ctx.byName.get(typeName);
  if (!type) {
    messages.push(
      templateMessage('origins.draw.typeUnknown', {
        path: `${path}.${origin.node.type}`,
        name: typeName,
      }),
    );
    return undefined;
  }
  let props: Record<string, unknown> = {};
  const rawProps = raw[origin.node.props];
  if (isRecord(rawProps)) props = rawProps;
  else if (rawProps !== undefined && rawProps !== null) {
    messages.push(
      templateMessage('origins.draw.expectedObject', {
        path: `${path}.${origin.node.props}`,
      }),
    );
  }
  const values: Record<string, FieldValue> = {};
  const known = new Set<string>();
  for (const field of type.fields) {
    values[field.key] = translateFieldValue(field, props, path, ctx);
    const fieldSource = fieldPath(field, origin.system);
    const key = fieldSource === undefined ? undefined : firstKey(fieldSource);
    if (key !== undefined) known.add(key);
  }
  const ignore = sourceOf(type, origin.system, typeName)?.ignore ?? [];
  for (const key of Object.keys(props)) {
    if (known.has(key) || ignore.includes(key)) continue;
    messages.push(
      templateMessage('origins.draw.unknownProp', {
        path: `${path}.${origin.node.props}.${key}`,
        name: typeName,
      }),
    );
  }
  const children: LayoutNode[] = [];
  const rawChildren = raw[origin.node.children];
  if (Array.isArray(rawChildren)) {
    rawChildren.forEach((child, index) => {
      const node = translateNode(child, `${path}.${origin.node.children}[${index}]`, ctx);
      if (node) children.push(node);
    });
  } else if (rawChildren !== undefined && rawChildren !== null) {
    messages.push(
      templateMessage('origins.draw.expectedList', {
        path: `${path}.${origin.node.children}`,
      }),
    );
  }
  return { id: path, typeId: type.id, values: values as FieldValues, children };
}

function translateRoot(
  source: RootSource,
  node: LayoutNode,
  raw: unknown,
  ctx: Context,
): LayoutRoot {
  let anchor: LayoutAnchor | undefined;
  let margin: number | undefined;
  if (source.anchor !== undefined) {
    const value = readSource(source.anchor, raw);
    if (value === undefined) {
      anchor = 'top-start';
    } else if (LAYOUT_ANCHORS.includes(value as LayoutAnchor)) {
      anchor = value as LayoutAnchor;
    } else {
      ctx.messages.push(
        templateMessage('origins.draw.anchorInvalid', {
          path: `${node.id}.${describeSourceKey(source.anchor, 'anchor')}`,
          value: String(value),
        }),
      );
      anchor = 'top-start';
    }
    if (source.margin !== undefined) {
      const value2 = readSource(source.margin, raw);
      if (value2 !== undefined) {
        const n =
          typeof value2 === 'string' && value2.trim() !== '' ? Number(value2) : value2;
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) margin = n;
        else {
          ctx.messages.push(
            templateMessage('origins.draw.marginInvalid', {
              path: `${node.id}.${describeSourceKey(source.margin, 'margin')}`,
            }),
          );
        }
      }
    }
  }
  return {
    node,
    ...(anchor !== undefined ? { anchor } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(source.scrim !== undefined ? { scrimTypeId: source.scrim } : {}),
  };
}

function describeSourceKey(source: ValueSource, fallback: string): string {
  return typeof source === 'object' ? source.path : fallback;
}

/**
 * A origem que traduz o JSON: a de `system`; sem ele, a primeira de `kind` `tree` (a `measured`
 * não gera tela). Só com origens `measured`, o erro manda passar o `system`.
 */
function pickOrigin(
  origins: readonly Origin[],
  system: string | undefined,
):
  | { readonly origin: Origin; readonly error?: never }
  | { readonly origin?: never; readonly error: ModelMessage } {
  if (system) {
    const found = origins.find((o) => o.system === system);
    return found
      ? { origin: found }
      : { error: templateMessage('origins.error.systemUndeclared', { system }) };
  }
  const tree = origins.find((o) => o.kind !== 'measured');
  if (tree) return { origin: tree };
  return {
    error: templateMessage(
      origins.length === 0 ? 'origins.error.noOrigins' : 'origins.error.onlyMeasured',
    ),
  };
}

function translate(
  library: Library,
  json: unknown,
  options: SourceOptions,
): TranslateResult {
  const messages: ModelMessage[] = [];
  const picked = pickOrigin(library.origins, options.system);
  if (!picked.origin) return result(messages, { errorMessage: picked.error });
  const origin = picked.origin;

  const width = positiveNumber(readSource(origin.screen.width, json));
  if (width === undefined) {
    return result(messages, {
      errorMessage: templateMessage('origins.error.widthInvalid', {
        source: describeSource(origin.screen.width),
      }),
    });
  }
  const height = positiveNumber(readSource(origin.screen.height, json));
  if (height === undefined) {
    return result(messages, {
      errorMessage: templateMessage('origins.error.heightInvalid', {
        source: describeSource(origin.screen.height),
      }),
    });
  }
  const byName = new Map<string, TypeDef>();
  for (const type of library.types) {
    for (const source of type.sources) {
      if (source.system !== origin.system || source.name === undefined) continue;
      if (!byName.has(source.name)) byName.set(source.name, type);
    }
  }
  const ctx: Context = { origin, byName, messages };
  const text = (source: ValueSource | undefined, fallback: string): string => {
    const value = readSource(source, json);
    return isScalar(value) ? String(value) : fallback;
  };
  const roots: LayoutRoot[] = [];
  for (const rootSource of origin.screen.roots) {
    const parsed = parsePath(rootSource.path);
    if (!parsed.ok) continue;
    for (const found of expandPath(json, parsed.segments)) {
      const node = translateNode(found.value, found.path, ctx);
      if (node) roots.push(translateRoot(rootSource, node, found.value, ctx));
    }
  }
  const layout: LayoutScreen = {
    id: text(origin.screen.id, 'tela'),
    name: text(origin.screen.name, 'Tela'),
    width,
    height,
    background: text(origin.screen.background, '#FFFFFF'),
    roots,
  };
  return result(messages, { layout });
}

/** O resultado da tradução: `warnings` são os textos das `messages`, na mesma ordem. */
function result(
  messages: ModelMessage[],
  rest: {
    readonly layout?: LayoutScreen;
    /** Erro que a exceção trouxe (texto do motor JavaScript, sem código). */
    readonly error?: string;
    readonly errorMessage?: ModelMessage;
  },
): TranslateResult {
  const { errorMessage, ...others } = rest;
  return {
    ...others,
    ...(errorMessage === undefined ? {} : { error: errorMessage.text, errorMessage }),
    warnings: textsOf(messages),
    messages,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * JSON externo → tela sem geometria, pela origem declarada (`options.system`; sem ele, a
 * primeira). Nunca lança: falha vira `error` (sem `layout`). Avisos: tipo externo sem tipo de
 * anotação (o nó e a subárvore ficam de fora), propriedade desconhecida, valor fora das
 * opções, valor que não é simples, âncora inválida.
 */
export function translateSource(
  library: Library,
  json: unknown,
  options: SourceOptions = {},
): TranslateResult {
  try {
    return translate(library, json, options);
  } catch (error) {
    return result([], { error: messageOf(error) });
  }
}

/** O erro da tradução com o código; sem erro (nem layout), o `origins.error.noResult`. */
function errorOf(
  translated: TranslateResult,
): Pick<SourceResult, 'error' | 'errorMessage'> {
  if (translated.error === undefined) {
    const errorMessage = templateMessage('origins.error.noResult');
    return { error: errorMessage.text, errorMessage };
  }
  return translated.errorMessage === undefined
    ? { error: translated.error }
    : { error: translated.error, errorMessage: translated.errorMessage };
}

/** `translateSource` + `layoutScreen`: do JSON externo à `Screen` pronta para desenhar. Nunca lança. */
export function screenFromSource(
  library: Library,
  json: unknown,
  options: SourceOptions & { readonly measure: TextMeasurer },
): SourceResult {
  const translated = translateSource(library, json, options);
  if (translated.error !== undefined || !translated.layout) {
    return {
      warnings: translated.warnings,
      messages: translated.messages,
      ...errorOf(translated),
    };
  }
  try {
    const laid = layoutScreen(translated.layout, library, options.measure);
    const messages = mergeMessages(translated.messages, laid.messages);
    return { screen: laid.screen, warnings: textsOf(messages), messages };
  } catch (error) {
    return {
      warnings: translated.warnings,
      messages: translated.messages,
      error: messageOf(error),
    };
  }
}
