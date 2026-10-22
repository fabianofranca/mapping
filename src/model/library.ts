import type { ComponentFile } from './components/componentFormat';
import { findSlot } from './components/arrange';
import { resolvePath, type TextFile } from './components/library';
import { collectFieldKeys, parseComponent } from './components/parseComponent';
import {
  parseSpecText,
  type Spec,
  type SpecAnnotationType,
  type SpecField,
  type SpecMigrationStep,
} from './spec';
import { specWarnings } from './specWarnings';
import { missingMigrations } from './specVersions';
import { drawingIssues } from './libraryDrawing';

// Validador da biblioteca em três níveis (etapa Biblioteca, fase B1). Puro: recebe os arquivos
// do pacote JÁ LIDOS (texto dos `.json` e `.md`, presença dos binários) e devolve a lista de
// problemas; nunca lê disco nem rede. As três portas (app, servidor MCP e skill) chamam esta
// mesma função.
//
// Erro impede usar, aviso deixa usar. `ok` é "nenhum `error`".
//
// Níveis (cada um só roda se `level` o inclui e se o anterior deixou o que ele precisa):
//   1. cada arquivo isolado, estrito: a especialização (`parseSpec` + `specWarnings`), cada
//      componente (`parseComponent`), os documentos `.md`, e quais arquivos o pacote cita ou
//      deixa sem uso;
//   2. coerência entre os arquivos: slot, campos do template, arquivos dos exemplos externos,
//      fontes, `scrim` das origens e o contrato de versão (`previous`);
//   3. prova de desenho (`libraryDrawing.ts`): instancia cada componente e passa os exemplos
//      externos pela declaração.
// Sem especialização legível não há nível 2 nem 3; um componente inválido ou ausente não
// impede os outros de passarem pelos níveis 2 e 3.
//
// Ordem de `issues` (fixa, os testes dependem dela): todas as do nível 1, depois as do 2,
// depois as do 3. Dentro de cada nível, a ordem da especialização:
//   nível 1: erros da especialização (na ordem do `parseSpec`), avisos dela (`specWarnings`);
//            depois, tipo a tipo (camadas e tipos em ordem): o arquivo do `component` (ausente
//            ou os erros dele; um arquivo citado por dois tipos é lido uma vez) e o do `doc`;
//            por fim os arquivos sem referência, na ordem da lista `files`;
//   nível 2: tipo a tipo: componente repetido, `slot`, campos do template (erro), campos do
//            `preview` e do tipo que o template não usa (aviso), arquivos dos exemplos
//            externos do tipo; depois as fontes, as origens (`scrim`, telas de exemplo) e,
//            por último, o contrato de versão (id, `version`, quebras sem migração, passos que
//            citam o que não existia);
//   nível 3: ver `libraryDrawing.ts`.

export interface LibraryFile {
  /** Caminho relativo à raiz do pacote, com `/`. */
  readonly path: string;
  /** Conteúdo dos `.json` e dos `.md`. */
  readonly text?: string;
  /** `true` para binário presente (fonte); o conteúdo não é lido. */
  readonly binary?: boolean;
}

export interface LibraryIssue {
  /** Arquivo onde está o problema (`""` quando é do pacote). */
  readonly file: string;
  /** Caminho dentro do arquivo (`layers[0].annotationTypes[2].component`), `""` se não houver. */
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface LibraryInput {
  readonly files: readonly LibraryFile[];
  /** Caminho do arquivo da especialização; sem ele, procura o único `"format": "mapping-spec"`. */
  readonly specPath?: string;
  /** Versão anterior do pacote: liga o contrato de versão no nível 2. */
  readonly previous?: Spec;
  /** Até que nível ir (padrão 3). */
  readonly level?: 1 | 2 | 3;
}

export interface LibraryReport {
  /** Sem nenhum `error`. */
  readonly ok: boolean;
  /** Na ordem: nível 1, depois 2, depois 3 (ver o cabeçalho do arquivo). */
  readonly issues: readonly LibraryIssue[];
  readonly errors: readonly LibraryIssue[];
  readonly warnings: readonly LibraryIssue[];
  /** A especialização lida (ausente quando o nível 1 não conseguiu lê-la). */
  readonly spec?: Spec;
  readonly summary: {
    /** O maior nível que chegou a rodar (menor que o pedido quando não havia especialização legível). */
    readonly level: 1 | 2 | 3;
    /** Tipos de anotação da especialização. */
    readonly types: number;
    /** Arquivos de componente distintos citados pelos tipos. */
    readonly components: number;
    /** Arquivos de documento distintos citados pelos tipos. */
    readonly docs: number;
    /** Exemplos dos tipos mais as telas de exemplo das origens. */
    readonly examples: number;
    /** Fontes declaradas. */
    readonly fonts: number;
  };
}

const SPEC_FORMATS: readonly unknown[] = ['mapping-spec', 'mapeador-spec'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const NOT_READ = 'o conteúdo do arquivo não foi lido (esperava o texto)';

/** Percorre os tipos na ordem da especialização, com o caminho de cada um. */
function eachType(
  spec: Spec,
  visit: (type: SpecAnnotationType, path: string) => void,
): void {
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      visit(type, `layers[${li}].annotationTypes[${ti}]`);
    });
  });
}

/** Campos do tipo pela chave; as colunas de `table` entram como `tabela.coluna`. */
function fieldKeys(type: SpecAnnotationType): Map<string, SpecField> {
  const keys = new Map<string, SpecField>();
  for (const field of type.fields) {
    keys.set(field.key, field);
    if (field.type === 'table') {
      for (const column of field.columns) keys.set(`${field.key}.${column.key}`, column);
    }
  }
  return keys;
}

/**
 * Onde cada chave de campo é citada no JSON do template (primeiro lugar de cada uma), com o
 * caminho dentro do arquivo. Espelha `referencedFields` (`$field`, `$has`, `$switch` e o
 * primeiro item de `$eq`), que só devolve as chaves.
 */
function fieldReferences(
  node: unknown,
  path: string,
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (Array.isArray(node)) {
    node.forEach((item, i) => fieldReferences(item, `${path}[${i}]`, out));
    return out;
  }
  if (!isRecord(node)) return out;
  const isRepeat = node.type === 'repeat';
  for (const [key, value] of Object.entries(node)) {
    const at = `${path}.${key}`;
    // `repeat`: o `template` lê colunas da linha (ver `repeatChecks`), não campos do tipo.
    if (isRepeat && key === 'template') continue;
    if (isRepeat && key === 'field' && typeof value === 'string') {
      if (!out.has(value)) out.set(value, at);
    } else if (
      (key === '$field' || key === '$has' || key === '$switch') &&
      typeof value === 'string'
    ) {
      if (!out.has(value)) out.set(value, at);
    } else if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string') {
      if (!out.has(value[0])) out.set(value[0], `${at}[0]`);
    } else {
      fieldReferences(value, at, out);
    }
  }
  return out;
}

/** Os nós `repeat` do JSON do template, com o caminho de cada um (os aninhados não existem). */
function repeatNodes(
  node: unknown,
  path: string,
  out: { path: string; node: Record<string, unknown> }[] = [],
): { path: string; node: Record<string, unknown> }[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => repeatNodes(item, `${path}[${i}]`, out));
    return out;
  }
  if (!isRecord(node)) return out;
  if (node.type === 'repeat') {
    out.push({ path, node });
    return out;
  }
  for (const [key, value] of Object.entries(node))
    repeatNodes(value, `${path}.${key}`, out);
  return out;
}

class Collector {
  readonly issues: LibraryIssue[] = [];
  error(file: string, path: string, message: string): void {
    this.issues.push({ file, path, message, severity: 'error' });
  }
  warning(file: string, path: string, message: string): void {
    this.issues.push({ file, path, message, severity: 'warning' });
  }
}

function locateSpec(
  files: readonly LibraryFile[],
  byPath: ReadonlyMap<string, LibraryFile>,
  specPath: string | undefined,
): { path: string } | { issue: LibraryIssue } {
  if (specPath !== undefined) {
    return byPath.has(specPath)
      ? { path: specPath }
      : {
          issue: {
            file: specPath,
            path: '',
            message: `arquivo da especialização não encontrado: ${specPath}`,
            severity: 'error',
          },
        };
  }
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.json') || file.text === undefined) continue;
    try {
      const json: unknown = JSON.parse(file.text);
      if (isRecord(json) && SPEC_FORMATS.includes(json.format)) found.push(file.path);
    } catch {
      // JSON inválido não é candidato: sem `format` legível não dá para saber o que é.
    }
  }
  if (found.length === 1 && found[0] !== undefined) return { path: found[0] };
  const message =
    found.length === 0
      ? 'nenhuma especialização encontrada: o pacote precisa de um arquivo .json com "format": "mapping-spec"'
      : `há ${found.length} especializações no pacote (${found.join(', ')}): indique qual validar`;
  return { issue: { file: '', path: '', message, severity: 'error' } };
}

/** Nível 1 e 2 compartilham o que o 1 leu dos arquivos. */
interface Package {
  readonly spec: Spec;
  readonly specPath: string;
  readonly resolve: (ref: string) => string;
  readonly byPath: ReadonlyMap<string, LibraryFile>;
  /** Componentes válidos pelo caminho resolvido. */
  readonly components: Map<string, ComponentFile>;
  /** JSON do componente pelo caminho resolvido (para localizar as citações de campos). */
  readonly componentJson: Map<string, unknown>;
}

// ---------------------------------------------------------------------------------------
// Nível 1
// ---------------------------------------------------------------------------------------

function level1(
  files: readonly LibraryFile[],
  byPath: ReadonlyMap<string, LibraryFile>,
  specPath: string,
  out: Collector,
): Package | undefined {
  const specFile = byPath.get(specPath);
  if (specFile?.text === undefined) {
    out.error(specPath, '', NOT_READ);
    return undefined;
  }
  const parsed = parseSpecText(specFile.text);
  if (!parsed.ok) {
    for (const issue of parsed.issues) out.error(specPath, issue.path, issue.message);
    return undefined;
  }
  const { spec, ignored } = parsed;
  for (const warning of specWarnings(spec, ignored)) {
    out.warning(specPath, warning.path, warning.message);
  }

  const resolve = (ref: string): string => resolvePath(specPath, ref);
  const pkg: Package = {
    spec,
    specPath,
    resolve,
    byPath,
    components: new Map(),
    componentJson: new Map(),
  };
  const referenced = new Set<string>([specPath]);
  const readComponents = new Set<string>();

  eachType(spec, (type, base) => {
    if (type.component !== undefined) {
      const path = resolve(type.component);
      referenced.add(path);
      const file = byPath.get(path);
      if (file === undefined) {
        out.error(specPath, `${base}.component`, `arquivo não encontrado: ${path}`);
      } else if (!readComponents.has(path)) {
        readComponents.add(path);
        readComponent(file, pkg, out);
      }
    }
    if (type.doc !== undefined) {
      const path = resolve(type.doc);
      referenced.add(path);
      const file = byPath.get(path);
      if (file === undefined) {
        out.error(specPath, `${base}.doc`, `arquivo não encontrado: ${path}`);
      } else if ((file.text ?? '').trim() === '') {
        out.warning(path, '', 'documento vazio');
      }
    }
    (type.examples ?? []).forEach((example) => {
      if (example.file !== undefined) referenced.add(resolve(example.file));
    });
  });
  for (const origin of spec.origins ?? []) {
    for (const example of origin.examples ?? []) referenced.add(resolve(example.file));
  }

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (referenced.has(file.path)) continue;
    if (lower.endsWith('.json') || lower.endsWith('.md')) {
      out.warning(file.path, '', 'arquivo não referenciado pela especialização');
    }
  }
  return pkg;
}

function readComponent(file: LibraryFile, pkg: Package, out: Collector): void {
  if (file.text === undefined) {
    out.error(file.path, '', NOT_READ);
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch (error) {
    out.error(file.path, '', `JSON inválido: ${messageOf(error)}`);
    return;
  }
  const parsed = parseComponent(json);
  if (!parsed.ok) {
    for (const issue of parsed.issues) out.error(file.path, issue.path, issue.message);
    return;
  }
  pkg.components.set(file.path, parsed.component);
  pkg.componentJson.set(file.path, json);
}

// ---------------------------------------------------------------------------------------
// Nível 2
// ---------------------------------------------------------------------------------------

/** Confere um arquivo JSON citado (existe e é JSON) e guarda o conteúdo lido em `cache`; o erro de um arquivo sai uma vez. */
function readJsonFile(
  pkg: Package,
  ref: string,
  path: string,
  cache: Map<string, unknown>,
  out: Collector,
  seen: Set<string>,
): void {
  const full = pkg.resolve(ref);
  const file = pkg.byPath.get(full);
  if (file === undefined) {
    out.error(pkg.specPath, path, `arquivo não encontrado: ${full}`);
    return;
  }
  if (seen.has(full)) return;
  seen.add(full);
  if (file.text === undefined) {
    out.error(full, '', NOT_READ);
    return;
  }
  try {
    cache.set(full, JSON.parse(file.text));
  } catch (error) {
    out.error(full, '', `JSON inválido: ${messageOf(error)}`);
  }
}

function typeCoherence(
  pkg: Package,
  type: SpecAnnotationType,
  base: string,
  out: Collector,
  used: Map<string, string>,
): void {
  if (type.component === undefined) return;
  const path = pkg.resolve(type.component);
  const other = used.get(path);
  if (other !== undefined) {
    out.warning(
      pkg.specPath,
      `${base}.component`,
      `o arquivo ${path} já é o componente do tipo "${other}"`,
    );
  } else {
    used.set(path, type.id);
  }
  const component = pkg.components.get(path);
  if (component === undefined) return;

  const slot = findSlot(component);
  (type.sources ?? []).forEach((source, index) => {
    if (source.slot === undefined) return;
    const at = `${base}.sources[${index}].slot`;
    if (slot === undefined) {
      out.error(pkg.specPath, at, `o componente ${path} não tem slot`);
    } else if (slot.name !== source.slot) {
      out.error(
        pkg.specPath,
        at,
        `o slot do componente ${path} é "${slot.name ?? ''}", não "${source.slot}"`,
      );
    }
  });

  const keys = new Set(type.fields.map((f) => f.key));
  const raw = pkg.componentJson.get(path);
  const rawTemplate = isRecord(raw) ? raw.template : undefined;
  const where = fieldReferences(rawTemplate, 'template');
  const used2 = collectFieldKeys(component);
  for (const key of used2) {
    if (keys.has(key)) continue;
    out.error(
      path,
      where.get(key) ?? 'template',
      `o desenho usa o campo "${key}", que o tipo "${type.id}" não declara`,
    );
  }
  const innerUsed = repeatChecks(type, path, rawTemplate, out);
  for (const [key, value] of Object.entries(component.preview ?? {})) {
    const field = type.fields.find((f) => f.key === key);
    if (field === undefined) {
      out.warning(path, `preview.${key}`, `o tipo "${type.id}" não tem o campo "${key}"`);
    } else if (field.type === 'table') {
      previewRows(type, field, key, value, path, out);
    } else if (Array.isArray(value)) {
      out.warning(
        path,
        `preview.${key}`,
        `"${key}" não é uma table do tipo "${type.id}"; o preview dele deve ser um valor simples`,
      );
    }
  }
  const drawn = new Set([...used2, ...innerUsed]);
  type.fields.forEach((field, index) => {
    if (drawn.has(field.key)) return;
    out.warning(
      pkg.specPath,
      `${base}.fields[${index}]`,
      `o campo "${field.key}" do tipo "${type.id}" não é usado pelo desenho do componente ${path}`,
    );
  });
}

/** O `preview` de um campo `table` é uma lista de linhas, e as colunas das linhas existem. */
function previewRows(
  type: SpecAnnotationType,
  field: Extract<SpecField, { type: 'table' }>,
  key: string,
  value: unknown,
  path: string,
  out: Collector,
): void {
  if (value === null) return;
  if (!Array.isArray(value)) {
    out.warning(
      path,
      `preview.${key}`,
      `"${key}" é uma table do tipo "${type.id}"; o preview dele deve ser uma lista de linhas`,
    );
    return;
  }
  const columns = new Set(field.columns.map((c) => c.key));
  value.forEach((row: unknown, i) => {
    if (!isRecord(row)) return;
    for (const column of Object.keys(row)) {
      if (column === '_id' || columns.has(column)) continue;
      out.warning(
        path,
        `preview.${key}[${i}].${column}`,
        `"${column}" não é coluna da table "${key}" do tipo "${type.id}"`,
      );
    }
  });
}

/**
 * Os `repeat` do desenho: o campo citado é uma `table` do tipo (erro se existe e não é) e o
 * `template` da linha só lê colunas dessa tabela ou campos do tipo (erro nos demais). Devolve
 * as chaves de campo do tipo (que não são colunas) lidas dentro dos `template`, para o aviso de
 * campo sem uso.
 */
function repeatChecks(
  type: SpecAnnotationType,
  path: string,
  rawTemplate: unknown,
  out: Collector,
): Set<string> {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  const innerUsed = new Set<string>();
  for (const { path: at, node } of repeatNodes(rawTemplate, 'template')) {
    const key = typeof node.field === 'string' ? node.field : undefined;
    const table = key === undefined ? undefined : fields.get(key);
    // Campo inexistente já foi apontado ("o desenho usa o campo ..., que o tipo não declara").
    if (table !== undefined && table.type !== 'table') {
      out.error(
        path,
        `${at}.field`,
        `o repeat repete as linhas de "${key}", que é um campo ${table.type} do tipo "${type.id}", não uma table`,
      );
    }
    const columns = new Set(
      table?.type === 'table' ? table.columns.map((c) => c.key) : [],
    );
    const inner = fieldReferences(node.template, `${at}.template`);
    for (const [name, where] of inner) {
      if (columns.has(name)) continue;
      const own = fields.get(name);
      if (own === undefined) {
        out.error(
          path,
          where,
          table?.type === 'table'
            ? `o desenho da linha usa "${name}", que não é coluna da table "${key}" nem campo do tipo "${type.id}"`
            : `o desenho da linha usa "${name}", que o tipo "${type.id}" não declara`,
        );
      } else {
        innerUsed.add(name);
      }
    }
  }
  return innerUsed;
}

/** Passos da migração que sai da versão anterior e citam o que não existia nela (aviso). */
function migrationReferences(
  previous: Spec,
  spec: Spec,
  out: Collector,
  specPath: string,
): void {
  const index = (spec.migrations ?? []).findIndex((m) => m.from === previous.version);
  const migration = spec.migrations?.[index];
  if (migration === undefined) return;
  const before = new Map<string, Map<string, SpecField>>();
  eachType(previous, (type) => before.set(type.id, fieldKeys(type)));
  const renamedFrom = new Map<string, string>();
  for (const step of migration.steps) {
    if (step.op === 'rename-type') renamedFrom.set(step.to, step.from);
  }
  const missingType = (id: string, at: string): void =>
    out.warning(specPath, at, `o tipo "${id}" não existia na versão ${previous.version}`);
  const oldType = (step: Extract<SpecMigrationStep, { type: string }>, at: string) => {
    const fields = before.get(renamedFrom.get(step.type) ?? step.type);
    if (fields === undefined) missingType(step.type, `${at}.type`);
    return fields;
  };

  migration.steps.forEach((step, si) => {
    const at = `migrations[${index}].steps[${si}]`;
    if (step.op === 'rename-type') {
      if (!before.has(step.from)) missingType(step.from, `${at}.from`);
    } else if (step.op === 'remove-type') {
      if (!before.has(step.type)) missingType(step.type, `${at}.type`);
    } else if (step.op === 'rename-field' || step.op === 'remove-field') {
      const fields = oldType(step, at);
      const key = step.op === 'rename-field' ? step.from : step.field;
      const keyPath = step.op === 'rename-field' ? `${at}.from` : `${at}.field`;
      if (fields !== undefined && !fields.has(key)) {
        out.warning(
          specPath,
          keyPath,
          `o campo "${key}" do tipo "${step.type}" não existia na versão ${previous.version}`,
        );
      }
    } else if (step.op === 'map-values') {
      const fields = oldType(step, at);
      if (fields === undefined) return;
      const field = fields.get(step.field);
      if (field === undefined) {
        out.warning(
          specPath,
          `${at}.field`,
          `o campo "${step.field}" do tipo "${step.type}" não existia na versão ${previous.version}`,
        );
        return;
      }
      const options = field.type === 'enum' ? field.options : [];
      for (const value of Object.keys(step.values)) {
        if (!options.includes(value)) {
          out.warning(
            specPath,
            `${at}.values.${value}`,
            `"${value}" não era opção do campo "${step.field}" na versão ${previous.version}`,
          );
        }
      }
    }
  });
}

function versionContract(
  previous: Spec,
  spec: Spec,
  specPath: string,
  out: Collector,
): void {
  if (previous.id !== spec.id) {
    out.error(
      specPath,
      'id',
      `a versão anterior é da especialização "${previous.id}", não "${spec.id}"`,
    );
    return;
  }
  if (spec.version <= previous.version) {
    out.error(
      specPath,
      'version',
      `a versão não cresceu: a anterior é ${previous.version} e esta é ${spec.version}`,
    );
  }
  for (const change of missingMigrations(previous, spec)) {
    out.error(specPath, change.path, change.message);
  }
  migrationReferences(previous, spec, out, specPath);
}

function level2(
  pkg: Package,
  previous: Spec | undefined,
  out: Collector,
): Map<string, unknown> {
  const { spec, specPath } = pkg;
  const used = new Map<string, string>();
  const jsons = new Map<string, unknown>();
  const seen = new Set<string>();
  eachType(spec, (type, base) => {
    typeCoherence(pkg, type, base, out, used);
    (type.examples ?? []).forEach((example, index) => {
      if (example.file === undefined) return;
      readJsonFile(
        pkg,
        example.file,
        `${base}.examples[${index}].file`,
        jsons,
        out,
        seen,
      );
    });
  });

  (spec.fonts ?? []).forEach((font, index) => {
    const path = pkg.resolve(font.file);
    if (pkg.byPath.has(path)) return;
    out.warning(
      specPath,
      `fonts[${index}].file`,
      `arquivo da fonte "${font.family}" não encontrado: ${path}; o desenho usa a fonte do sistema`,
    );
  });

  const typeIds = new Set<string>();
  eachType(spec, (type) => typeIds.add(type.id));
  (spec.origins ?? []).forEach((origin, oi) => {
    origin.screen.roots.forEach((root, ri) => {
      if (root.scrim !== undefined && !typeIds.has(root.scrim)) {
        out.error(
          specPath,
          `origins[${oi}].screen.roots[${ri}].scrim`,
          `o tipo "${root.scrim}" não existe na especialização`,
        );
      }
    });
    (origin.examples ?? []).forEach((example, ei) => {
      readJsonFile(
        pkg,
        example.file,
        `origins[${oi}].examples[${ei}].file`,
        jsons,
        out,
        seen,
      );
    });
  });

  if (previous !== undefined) versionContract(previous, spec, specPath, out);
  return jsons;
}

// ---------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------

function summarize(
  spec: Spec | undefined,
  pkg: Package | undefined,
  level: 1 | 2 | 3,
): LibraryReport['summary'] {
  if (spec === undefined || pkg === undefined) {
    return { level, types: 0, components: 0, docs: 0, examples: 0, fonts: 0 };
  }
  const components = new Set<string>();
  const docs = new Set<string>();
  let types = 0;
  let examples = 0;
  eachType(spec, (type) => {
    types += 1;
    if (type.component !== undefined) components.add(pkg.resolve(type.component));
    if (type.doc !== undefined) docs.add(pkg.resolve(type.doc));
    examples += type.examples?.length ?? 0;
  });
  for (const origin of spec.origins ?? []) examples += origin.examples?.length ?? 0;
  return {
    level,
    types,
    components: components.size,
    docs: docs.size,
    examples,
    fonts: spec.fonts?.length ?? 0,
  };
}

function report(
  issues: readonly LibraryIssue[],
  spec: Spec | undefined,
  summary: LibraryReport['summary'],
): LibraryReport {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    ok: errors.length === 0,
    issues,
    errors,
    warnings,
    ...(spec === undefined ? {} : { spec }),
    summary,
  };
}

/** Valida o pacote (a pasta da especialização) já lido; ver o cabeçalho do arquivo. */
export function validateLibrary(input: LibraryInput): LibraryReport {
  const wanted = input.level ?? 3;
  const byPath = new Map<string, LibraryFile>();
  for (const file of input.files) if (!byPath.has(file.path)) byPath.set(file.path, file);

  const located = locateSpec(input.files, byPath, input.specPath);
  if ('issue' in located) {
    return report([located.issue], undefined, summarize(undefined, undefined, 1));
  }

  const level1Out = new Collector();
  const pkg = level1(input.files, byPath, located.path, level1Out);
  if (pkg === undefined) {
    return report(level1Out.issues, undefined, summarize(undefined, undefined, 1));
  }
  let reached: 1 | 2 | 3 = 1;
  const level2Out = new Collector();
  const level3Out: LibraryIssue[] = [];
  if (wanted >= 2) {
    reached = 2;
    const jsons = level2(pkg, input.previous, level2Out);
    if (wanted >= 3) {
      reached = 3;
      const specFile = byPath.get(pkg.specPath);
      const textFiles: TextFile[] = [];
      if (specFile?.text !== undefined) {
        textFiles.push({ path: specFile.path, text: specFile.text });
      }
      for (const file of input.files) {
        if (file.path === pkg.specPath || file.text === undefined) continue;
        if (file.path.toLowerCase().endsWith('.json')) {
          textFiles.push({ path: file.path, text: file.text });
        }
      }
      level3Out.push(
        ...drawingIssues({
          spec: pkg.spec,
          specPath: pkg.specPath,
          resolve: pkg.resolve,
          components: pkg.components,
          jsonOf: (path) => jsons.get(path),
          textFiles,
        }),
      );
    }
  }
  return report(
    [...level1Out.issues, ...level2Out.issues, ...level3Out],
    pkg.spec,
    summarize(pkg.spec, pkg, reached),
  );
}
