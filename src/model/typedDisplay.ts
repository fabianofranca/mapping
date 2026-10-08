import {
  codeRefEntries,
  codeRefPlatforms,
  findPlatform,
  isValidCodePath,
} from './codeRefs';
import {
  DEFAULT_LABEL_TEXTS,
  instanceLabel,
  isRecord,
  parseRefValue,
  refLabel,
  resolveRef,
  tableRows,
  type LabelTexts,
} from './refs';
import type { SpecAnnotationType, SpecColumn, SpecField } from './spec';
import { getSpec, typeOfAnnotation } from './specLookup';
import { checkSimpleValue, isEmptyValue } from './typed';
import type { Annotation, AnnotationTypeRef, JsonValue, Project } from './types';

// Como uma anotação tipada aparece no painel, na lista e no zoom semântico
// (docs/history/PLAN-etapas-1-2.md 13.5, "Exibição"). Funções puras: a interface passa os textos traduzidos.

export interface DisplayTexts extends LabelTexts {
  /** Obrigatório vazio, ex.: `id: —`. */
  readonly empty: string;
  /** Resumo de uma tabela no zoom semântico, ex.: "3 linhas". */
  readonly rows: (count: number) => string;
}

export const DEFAULT_DISPLAY_TEXTS: DisplayTexts = {
  ...DEFAULT_LABEL_TEXTS,
  empty: '—',
  rows: (count) => (count === 1 ? '1 linha' : `${count} linhas`),
};

/** Rótulo de um campo ou coluna: `label`, senão `key`. */
export function fieldLabel(field: Pick<SpecField, 'key' | 'label'>): string {
  return field.label ?? field.key;
}

/** Nome do tipo da anotação tipada (o `typeId` se o tipo não existe mais); `null` na livre. */
export function typeName(p: Project, a: Annotation): string | null {
  if (!a.type) return null;
  return typeOfAnnotation(p, a)?.type.name ?? a.type.typeId;
}

/**
 * Título da anotação tipada: nome do tipo + rótulo da instância, ex.:
 * "Button · Comprar", "Classe · Contato"; sem rótulo, só "Button". Na livre, o `name`.
 */
export function annotationTitle(p: Project, a: Annotation): string | null {
  const type = typeName(p, a);
  if (type === null) return a.name;
  const label = instanceLabel(p, a);
  return label ? `${type} · ${label}` : type;
}

/**
 * Rótulo curto de quem faz uma referência (backlinks e listas de origem), ex.:
 * "Input input_nome": nome do tipo + rótulo da instância; sem rótulo, o primeiro
 * campo de texto preenchido (em geral o `id`). Na livre, o `name` ou `texts.untitled`.
 */
export function annotationShortLabel(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  const type = typeName(p, a);
  if (type === null) return a.name ?? texts.untitled;
  const label = instanceLabel(p, a);
  if (label) return `${type} ${label}`;
  const fields = typeOfAnnotation(p, a)?.type.fields ?? [];
  for (const f of fields) {
    const value = a.values?.[f.key];
    if (f.type === 'string' && typeof value === 'string' && value !== '') {
      return `${type} ${value}`;
    }
  }
  return type;
}

function cellText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export interface DisplayValueLine {
  readonly kind: 'value';
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** Na cor de alerta: obrigatório vazio, valor inválido ou referência quebrada. */
  readonly alert: boolean;
}

export interface DisplayTableLine {
  readonly kind: 'table';
  readonly key: string;
  readonly label: string;
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly rows: readonly { readonly id: string; readonly cells: readonly string[] }[];
  readonly alert: boolean;
}

/** Uma entrada de `codeRef` para exibir (Detalhes e Lista). */
export interface DisplayCodeEntry {
  readonly id: string;
  /** Id da plataforma. */
  readonly platform: string;
  /** Nome da plataforma declarado pela especialização (o id se ninguém a declara). */
  readonly platformName: string;
  readonly path: string | null;
  /** Último segmento do caminho (o nome do arquivo); `null` sem caminho. */
  readonly fileName: string | null;
  readonly symbol: string | null;
  readonly line: number | null;
  /** Incompleta: plataforma não permitida ou caminho ausente ou inválido. */
  readonly alert: boolean;
}

/** Campo `codeRef` por inteiro (`tables: 'full'`): uma linha por entrada. */
export interface DisplayCodeLine {
  readonly kind: 'code';
  readonly key: string;
  readonly label: string;
  readonly entries: readonly DisplayCodeEntry[];
  readonly alert: boolean;
}

export type DisplayLine = DisplayValueLine | DisplayTableLine | DisplayCodeLine;

export interface DisplayOptions {
  /**
   * `summary` (zoom semântico): `atributos: 3 linhas` e `implementação: Alfa, Beta` (plataformas pelo nome);
   * `full` (painel e lista): a tabela e as entradas do `codeRef`.
   */
  readonly tables: 'summary' | 'full';
  readonly texts?: DisplayTexts;
}

function simpleAlert(field: SpecColumn, value: JsonValue): boolean {
  return checkSimpleValue(field, value) !== null;
}

/** `true` se alguma linha tem coluna obrigatória vazia ou valor inválido. */
function tableAlert(
  columns: readonly SpecColumn[],
  value: JsonValue | undefined,
): boolean {
  const rows = Array.isArray(value) ? value : [];
  if (tableRows(value).length !== rows.length) return true;
  return tableRows(value).some((row) =>
    columns.some((c) => {
      const cell = row[c.key];
      if (cell === undefined || isEmptyValue(cell)) return c.required === true;
      return simpleAlert(c, cell);
    }),
  );
}

/**
 * Valores da anotação tipada na ordem dos campos, com o `label`: opcionais
 * vazios omitidos; obrigatórios vazios como `id: —` (alerta); `ref` como
 * `dado: → User.name` (quebrada: `→ (referência quebrada)`, alerta). Vazio na
 * anotação livre ou de tipo inexistente.
 */
export function typedDisplayLines(
  p: Project,
  a: Annotation,
  options: DisplayOptions,
): DisplayLine[] {
  const texts = options.texts ?? DEFAULT_DISPLAY_TEXTS;
  const resolved = typeOfAnnotation(p, a);
  const type = resolved?.type;
  if (!resolved || !type || !a.values) return [];
  const values = a.values;
  const lines: DisplayLine[] = [];
  for (const field of type.fields) {
    const { key } = field;
    const label = fieldLabel(field);
    const value = values[key];
    if (field.type === 'table') {
      const rows = tableRows(value);
      const alert = tableAlert(field.columns, value);
      if (rows.length === 0) {
        if (field.required) {
          lines.push({ kind: 'value', key, label, text: texts.empty, alert: true });
        } else if (alert) {
          lines.push({ kind: 'value', key, label, text: texts.rows(0), alert });
        }
        continue;
      }
      if (options.tables === 'summary') {
        lines.push({ kind: 'value', key, label, text: texts.rows(rows.length), alert });
        continue;
      }
      lines.push({
        kind: 'table',
        key,
        label,
        columns: field.columns.map((c) => ({ key: c.key, label: fieldLabel(c) })),
        rows: rows.map((row) => ({
          id: row._id,
          cells: field.columns.map((c) => cellText(row[c.key])),
        })),
        alert,
      });
      continue;
    }
    if (value === undefined || isEmptyValue(value)) {
      if (field.required) {
        lines.push({ kind: 'value', key, label, text: texts.empty, alert: true });
      }
      continue;
    }
    if (field.type === 'codeRef') {
      const code = codeRefDisplay(p, codeRefPlatforms(resolved.spec, field), value);
      if (code.entries.length === 0 && !code.alert) {
        if (field.required) {
          lines.push({ kind: 'value', key, label, text: texts.empty, alert: true });
        }
        continue;
      }
      if (options.tables === 'summary') {
        lines.push({
          kind: 'value',
          key,
          label,
          text: codePlatformSummary(code.entries) || texts.empty,
          alert: code.alert,
        });
      } else {
        lines.push({ kind: 'code', key, label, ...code });
      }
      continue;
    }
    if (field.type === 'ref') {
      const ref = parseRefValue(value);
      const target = ref ? resolveRef(p, ref) : null;
      lines.push({
        kind: 'value',
        key,
        label,
        text: `→ ${ref && target ? refLabel(p, ref, texts) : texts.broken}`,
        alert: !target,
      });
      continue;
    }
    lines.push({
      kind: 'value',
      key,
      label,
      text: cellText(value),
      alert: simpleAlert(field, value),
    });
  }
  return lines;
}

/** Nome do arquivo: o último segmento do caminho. */
function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Entradas do `codeRef` para exibir, com a plataforma pelo nome e o alerta de cada uma;
 * `alert` do campo também vale para entrada malformada (que fica de fora da lista).
 */
function codeRefDisplay(
  p: Project,
  allowed: readonly string[],
  value: JsonValue | undefined,
): { entries: DisplayCodeEntry[]; alert: boolean } {
  const entries = codeRefEntries(value).map((entry): DisplayCodeEntry => {
    const pathOk = entry.path !== null && isValidCodePath(entry.path);
    return {
      id: entry._id,
      platform: entry.platform,
      platformName: findPlatform(p, entry.platform)?.name ?? entry.platform,
      path: entry.path,
      fileName: entry.path === null ? null : fileNameOf(entry.path),
      symbol: entry.symbol,
      line: entry.line,
      alert: !allowed.includes(entry.platform) || !pathOk,
    };
  });
  const malformed = Array.isArray(value) && value.length !== entries.length;
  return { entries, alert: malformed || entries.some((e) => e.alert) };
}

/** Plataformas distintas das entradas, pelo nome e na ordem de aparição (ex.: "Alfa, Beta"). */
export function codePlatformSummary(entries: readonly DisplayCodeEntry[]): string {
  return [...new Set(entries.map((e) => e.platformName))].join(', ');
}

/** Valores crus de uma anotação de tipo inexistente (somente leitura). */
export function rawValueLines(a: Annotation): { key: string; text: string }[] {
  if (!a.values) return [];
  return Object.entries(a.values)
    .filter(([, value]) => !isEmptyValue(value))
    .map(([key, value]) => ({
      key,
      text:
        isRecord(value) || Array.isArray(value) ? JSON.stringify(value) : cellText(value),
    }));
}

/**
 * Tipos da mesma especialização que aceitam `child` em `allowedChildren` (para
 * explicar o que criar antes de um tipo com `requiresOwner`, ex.: Button ou Image).
 */
export function ownerTypesOf(p: Project, child: AnnotationTypeRef): SpecAnnotationType[] {
  const spec = getSpec(p, child.specId);
  if (!spec) return [];
  return spec.layers.flatMap((layer) =>
    layer.annotationTypes.filter((t) => (t.allowedChildren ?? []).includes(child.typeId)),
  );
}
