/**
 * Variáveis do componente (formatVersion 4, etapa #1504): `"let": { "nome": <expressão> }` num
 * `frame` e `{ "$var": "nome" }` onde vale uma expressão ou condição.
 *
 * A expansão acontece na leitura, antes da conferência (`parseComponent`): cada `$var` é trocado
 * pelo conteúdo da variável, como uma macro, e o componente devolvido não tem `let` nem `$var`.
 * Por isso `$index`, as colunas de linha (`$field` dentro de um `repeat`) e `$size` dentro de uma
 * variável são os do lugar do uso, e o conteúdo é conferido onde é usado, com o tipo que a posição
 * espera. Variável sem uso não é conferida. Sem DOM.
 *
 * Escopo: a variável vale nas chaves do próprio `frame` e nas dos descendentes (inclusive o
 * `template` de um `repeat`). O `let` de dentro esconde o de fora; dentro de um mesmo `let` a ordem
 * é livre (um `$var` aponta para o `let` do mesmo quadro, mesmo declarado depois, antes de subir aos
 * de fora).
 */
import { isRecord } from '../isRecord';

type Rec = Record<string, unknown>;

/** O nome de uma variável. */
export const VARIABLE_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** O teto de nós que a troca das variáveis cria (o resto do arquivo não conta). */
export const MAX_EXPANDED_NODES = 100000;

/** Quantas variáveis podem estar sendo expandidas uma dentro da outra (a pilha não estoura). */
const MAX_CHAIN = 500;

/** Um problema da expansão: caminho no componente expandido (`rewrite` o leva ao do arquivo). */
export interface VariableIssue {
  readonly path: string;
  readonly message: string;
}

export interface VariableExpansion {
  /** O `template` sem `let` nem `$var` (a mesma referência quando não havia nenhum). */
  readonly value: unknown;
  readonly issues: VariableIssue[];
  /** Leva um caminho do componente expandido ao do arquivo, com o `$var(<nome>)` do lugar do uso. */
  readonly rewrite: (path: string) => string;
}

interface Scope {
  readonly vars: Rec;
  readonly parent: Scope | null;
  /** Caminho do `let` (`template.children[0].let`). */
  readonly path: string;
}

interface Active {
  readonly scope: Scope;
  readonly name: string;
}

interface State {
  readonly issues: VariableIssue[];
  readonly seen: Set<string>;
  readonly marks: Map<string, string[]>;
  readonly active: Active[];
  nodes: number;
  /** Quantas variáveis estão sendo expandidas agora: dentro delas a cópia é sempre nova. */
  depth: number;
  over: boolean;
}

const EXPECTED_NAME = 'esperava nome de variável ([a-z][a-zA-Z0-9]*)';

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/** `out[key] = value`, sem que a chave `__proto__` de um arquivo JSON troque o protótipo da cópia. */
function put(out: Rec, key: string, value: unknown): void {
  if (key === '__proto__')
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  else out[key] = value;
}

function report(st: State, path: string, message: string): void {
  const key = `${path}\u0000${message}`;
  if (st.seen.has(key)) return;
  st.seen.add(key);
  st.issues.push({ path, message });
}

/** Insere `.$var(<nome>)` depois de cada prefixo do caminho que foi o lugar de um `$var`. */
function rewritePath(
  path: string,
  marks: ReadonlyMap<string, readonly string[]>,
): string {
  if (marks.size === 0) return path;
  let out = '';
  let from = 0;
  for (let i = 0; i <= path.length; i++) {
    const ch = path[i];
    if (i !== path.length && ch !== '.' && ch !== '[') continue;
    out += path.slice(from, i);
    from = i;
    const names = marks.get(path.slice(0, i));
    if (names !== undefined) out += names.map((n) => `.$var(${n})`).join('');
  }
  return out + path.slice(from);
}

function lookup(scope: Scope | null, name: string): Scope | null {
  for (let s = scope; s !== null; s = s.parent) {
    if (Object.prototype.hasOwnProperty.call(s.vars, name)) return s;
  }
  return null;
}

function substitute(use: Rec, path: string, scope: Scope | null, st: State): unknown {
  const extra = Object.keys(use).filter((key) => key !== '$var');
  for (const key of extra) report(st, join(path, key), `chave desconhecida: ${key}`);
  if (extra.length > 0) return use;
  const name = use.$var;
  if (typeof name !== 'string' || !VARIABLE_NAME_PATTERN.test(name)) {
    report(st, join(path, '$var'), EXPECTED_NAME);
    return use;
  }
  const owner = lookup(scope, name);
  if (owner === null) {
    report(st, path, `variável não definida: ${name}`);
    return use;
  }
  const start = st.active.findIndex((a) => a.scope === owner && a.name === name);
  if (start >= 0) {
    const chain = [...st.active.slice(start).map((a) => a.name), name];
    report(st, join(owner.path, name), `ciclo de variáveis: ${chain.join(' → ')}`);
    return use;
  }
  if (st.active.length >= MAX_CHAIN) {
    tooBig(st);
    return use;
  }
  st.marks.set(path, [...(st.marks.get(path) ?? []), name]);
  st.active.push({ scope: owner, name });
  st.depth++;
  const out = expandValue(owner.vars[name], path, owner, st);
  st.depth--;
  st.active.pop();
  return out;
}

function expandList(
  list: readonly unknown[],
  path: string,
  scope: Scope | null,
  st: State,
) {
  let changed = st.depth > 0;
  const out = list.map((item, i) => {
    const next = expandValue(item, `${path}[${i}]`, scope, st);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : list;
}

function expandEntries(
  value: Rec,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  let changed = st.depth > 0;
  const out: Rec = {};
  for (const [key, item] of Object.entries(value)) {
    const next = expandValue(item, join(path, key), scope, st);
    if (next !== item) changed = true;
    put(out, key, next);
  }
  return changed ? out : value;
}

/** Conta o nó criado pela troca (só dentro de uma variável) e para no teto de nós. */
function count(st: State): void {
  if (st.depth === 0) return;
  st.nodes++;
  if (st.nodes > MAX_EXPANDED_NODES) tooBig(st);
}

function tooBig(st: State): void {
  if (st.over) return;
  st.over = true;
  report(
    st,
    '',
    `expansão das variáveis grande demais (mais de ${MAX_EXPANDED_NODES} nós)`,
  );
}

/** Um valor (expressão, condição, literal ou objeto de estilo) com os `$var` trocados. */
function expandValue(
  value: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  count(st);
  if (st.over) return value;
  if (Array.isArray(value)) return expandList(value, path, scope, st);
  if (!isRecord(value)) return value;
  if ('$var' in value) return substitute(value, path, scope, st);
  return expandEntries(value, path, scope, st);
}

/** O escopo que o `let` do quadro abre (conferindo-o); `null` quando o nó não tem `let` de quadro. */
function openScope(
  node: Rec,
  path: string,
  parent: Scope | null,
  st: State,
): Scope | null {
  if (node.type !== 'frame' || !('let' in node)) return null;
  const at = join(path, 'let');
  if (!isRecord(node.let)) {
    report(st, at, 'esperava objeto');
    return null;
  }
  for (const name of Object.keys(node.let))
    if (!VARIABLE_NAME_PATTERN.test(name)) report(st, join(at, name), EXPECTED_NAME);
  return { vars: node.let, parent, path: at };
}

/** Os filhos de `children` e o `template` são nós; o resto das chaves é valor. */
function expandKey(
  key: string,
  value: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  const at = join(path, key);
  if (key === 'template' && isRecord(value)) return expandNode(value, at, scope, st);
  if (key !== 'children' || !Array.isArray(value))
    return expandValue(value, at, scope, st);
  let changed = false;
  const out = value.map((child: unknown, i) => {
    const next = expandNode(child, `${at}[${i}]`, scope, st);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? out : value;
}

/** Um nó com o `let` aplicado e os `$var` das chaves (e dos descendentes) trocados. */
function expandNode(
  node: unknown,
  path: string,
  scope: Scope | null,
  st: State,
): unknown {
  if (!isRecord(node)) return expandValue(node, path, scope, st);
  const own = openScope(node, path, scope, st);
  const inner = own ?? scope;
  const stripped = node.type === 'frame' && 'let' in node;
  let changed = stripped;
  const out: Rec = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'let' && stripped) continue;
    const next = expandKey(key, value, path, inner, st);
    if (next !== value) changed = true;
    put(out, key, next);
  }
  return changed ? out : node;
}

/**
 * Troca os `$var` do `template` pelo conteúdo das variáveis e tira os `let` dos quadros. Os
 * problemas (nome inválido, variável não definida, ciclo, teto) vêm em `issues`, e então `value`
 * não deve ser conferido (a árvore está incompleta).
 */
export function expandVariables(template: unknown, path = 'template'): VariableExpansion {
  const st: State = {
    issues: [],
    seen: new Set(),
    marks: new Map(),
    active: [],
    nodes: 0,
    depth: 0,
    over: false,
  };
  const value = expandNode(template, path, null, st);
  return { value, issues: st.issues, rewrite: (p) => rewritePath(p, st.marks) };
}

/**
 * Os caminhos de todo `let` de quadro e de todo `{ "$var" }` do `template` como estão escritos
 * (inclusive no conteúdo de variáveis sem uso): a conferência de versão usa-os numa
 * `formatVersion` anterior à 4.
 */
export function variableSyntaxPaths(node: unknown, path = 'template'): string[] {
  if (Array.isArray(node))
    return node.flatMap((v, i) => variableSyntaxPaths(v, `${path}[${i}]`));
  if (!isRecord(node)) return [];
  if ('$var' in node) return [path];
  const found: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const at = join(path, key);
    if (key === 'let' && node.type === 'frame') found.push(at);
    found.push(...variableSyntaxPaths(value, at));
  }
  return found;
}
