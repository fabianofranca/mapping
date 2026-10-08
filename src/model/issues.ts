import {
  CODE_REF_KEYS,
  codeRefPlatforms,
  isCodeLine,
  isValidCodePath,
  normalizeCodePath,
} from './codeRefs';
import { findById } from './project';
import { memoByProject, projectIndex } from './projectIndex';
import { isRecord, isTargetAccepted, parseRefValue, resolveRef, tableRows } from './refs';
import type { Spec, SpecField } from './spec';
import { fieldOf, isAllowedOwner, specLayerOf, typeOfAnnotation } from './specLookup';
import { checkSimpleValue, isEmptyValue } from './typed';
import type { Annotation, JsonValue, Project } from './types';

// Pendências ("incompletas", docs/history/PLAN-etapas-1-2.md 13.5): calculadas a partir do projeto e das
// especializações, nunca gravadas. Salvar incompleta é sempre permitido.

export type AnnotationIssueCode =
  /** Campo obrigatório vazio (inclusive coluna obrigatória numa linha). */
  | 'required-empty'
  /** Valor incompatível com o tipo do campo. */
  | 'invalid-value'
  /** Valor de `enum` fora das `options`. */
  | 'unknown-option'
  /** Chave que não existe no tipo. */
  | 'unknown-field'
  /** Tipo (ou a especialização) não existe mais. */
  | 'unknown-type'
  /** Tipada fora da camada do seu tipo, ou livre numa camada da especialização. */
  | 'layer-mismatch'
  /** Tipo com `requiresOwner` sem dono. */
  | 'missing-owner'
  /** Dono cujo tipo não lista este em `allowedChildren`. */
  | 'owner-not-allowed'
  /** O alvo da referência não existe mais. */
  | 'broken-ref'
  /** O alvo existe, mas não é aceito pelo campo (perdeu a etiqueta, deixou de ser livre). */
  | 'ref-not-accepted'
  /** Entrada de `codeRef` com plataforma não declarada pela especialização do tipo. */
  | 'unknown-platform'
  /** Entrada de `codeRef` com plataforma declarada, mas fora do `platforms` do campo. */
  | 'platform-not-allowed'
  /** Entrada de `codeRef` sem caminho. */
  | 'missing-path';

export interface AnnotationIssue {
  readonly code: AnnotationIssueCode;
  /** Campo envolvido. */
  readonly key?: string;
  /** Linha da tabela ou entrada do `codeRef` envolvida (o `_id`). */
  readonly rowId?: string;
  /**
   * Coluna da tabela envolvida; no `codeRef`, a propriedade da entrada (`platform`,
   * `path`, `symbol`, `line` ou uma chave desconhecida).
   */
  readonly column?: string;
}

const CODE_REF_KEY_SET: ReadonlySet<string> = new Set(CODE_REF_KEYS);

/**
 * Pendências de um campo `codeRef`: valor que não é lista, obrigatório vazio, entrada
 * malformada, chave desconhecida, plataforma não declarada ou fora do campo, caminho
 * ausente ou inválido, símbolo que não é texto e linha que não é inteiro ≥ 1.
 */
function codeRefIssues(
  spec: Spec,
  field: SpecField,
  value: JsonValue | undefined,
): AnnotationIssue[] {
  const { key } = field;
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    return [{ code: 'invalid-value', key }];
  }
  const items: readonly JsonValue[] = Array.isArray(value) ? value : [];
  const issues: AnnotationIssue[] = [];
  if (items.length === 0 && field.required) issues.push({ code: 'required-empty', key });
  const malformed = items.some(
    (item) => !isRecord(item) || typeof item._id !== 'string' || item._id === '',
  );
  if (malformed) issues.push({ code: 'invalid-value', key });

  const declared = new Set((spec.platforms ?? []).map((platform) => platform.id));
  const allowed = new Set(codeRefPlatforms(spec, field));
  for (const item of items) {
    if (!isRecord(item) || typeof item._id !== 'string' || item._id === '') continue;
    const rowId = item._id;
    const push = (code: AnnotationIssueCode, column: string) =>
      issues.push({ code, key, rowId, column });
    for (const column of Object.keys(item)) {
      if (!CODE_REF_KEY_SET.has(column)) push('unknown-field', column);
    }
    const { platform, path, symbol, line } = item;
    if (typeof platform !== 'string' || platform === '')
      push('invalid-value', 'platform');
    else if (!declared.has(platform)) push('unknown-platform', 'platform');
    else if (!allowed.has(platform)) push('platform-not-allowed', 'platform');
    if (path === undefined || path === null) push('missing-path', 'path');
    else if (typeof path !== 'string') push('invalid-value', 'path');
    else if (normalizeCodePath(path) === null) push('missing-path', 'path');
    else if (!isValidCodePath(path)) push('invalid-value', 'path');
    if (symbol !== undefined && symbol !== null && typeof symbol !== 'string') {
      push('invalid-value', 'symbol');
    }
    if (line !== undefined && line !== null && !isCodeLine(line)) {
      push('invalid-value', 'line');
    }
  }
  return issues;
}

function annotationIssues(p: Project, a: Annotation): AnnotationIssue[] {
  const issues: AnnotationIssue[] = [];
  const index = projectIndex(p);
  const layer = index.layers.get(a.layerId);

  if (!a.type || !a.values) {
    if (layer?.spec) issues.push({ code: 'layer-mismatch' });
    return issues;
  }

  const resolved = typeOfAnnotation(p, a);
  if (!resolved) return [{ code: 'unknown-type' }];
  const { type, spec } = resolved;
  const values = a.values;

  if (!layer || !layer.spec || layer.spec.specId !== a.type.specId) {
    issues.push({ code: 'layer-mismatch' });
  } else if (specLayerOf(p, layer)?.id !== resolved.layer.id) {
    issues.push({ code: 'layer-mismatch' });
  }

  for (const key of Object.keys(values)) {
    if (!fieldOf(type, key)) issues.push({ code: 'unknown-field', key });
  }

  for (const field of type.fields) {
    const { key } = field;
    const value: JsonValue | undefined = values[key];
    if (field.type === 'table') {
      if (value !== undefined && value !== null && !Array.isArray(value)) {
        issues.push({ code: 'invalid-value', key });
        continue;
      }
      const rows = Array.isArray(value) ? value : [];
      if (rows.length === 0 && field.required)
        issues.push({ code: 'required-empty', key });
      if (tableRows(value).length !== rows.length)
        issues.push({ code: 'invalid-value', key });
      for (const row of tableRows(value)) {
        const rowId = row._id;
        for (const col of Object.keys(row)) {
          if (col !== '_id' && !field.columns.some((c) => c.key === col)) {
            issues.push({ code: 'unknown-field', key, rowId, column: col });
          }
        }
        for (const col of field.columns) {
          const cell = row[col.key];
          if (cell === undefined || isEmptyValue(cell)) {
            if (col.required) {
              issues.push({ code: 'required-empty', key, rowId, column: col.key });
            }
            continue;
          }
          const problem = checkSimpleValue(col, cell);
          if (problem) issues.push({ code: problem, key, rowId, column: col.key });
        }
      }
      continue;
    }
    if (field.type === 'codeRef') {
      issues.push(...codeRefIssues(spec, field, value));
      continue;
    }
    if (value === undefined || isEmptyValue(value)) {
      if (field.required) issues.push({ code: 'required-empty', key });
      continue;
    }
    if (field.type === 'ref') {
      const ref = parseRefValue(value);
      const target = ref && resolveRef(p, ref);
      if (!ref) issues.push({ code: 'invalid-value', key });
      else if (!target) issues.push({ code: 'broken-ref', key });
      else if (ref.annotationId === a.id || !isTargetAccepted(target, field.accepts)) {
        issues.push({ code: 'ref-not-accepted', key });
      }
      continue;
    }
    const problem = checkSimpleValue(field, value);
    if (problem) issues.push({ code: problem, key });
  }

  if (a.parentAnnotationId === null) {
    if (type.requiresOwner) issues.push({ code: 'missing-owner' });
  } else {
    const owner = index.annotations.get(a.parentAnnotationId);
    // Dono de tipo inexistente já aparece como pendência nele mesmo.
    const ownerUnknown = owner?.type != null && typeOfAnnotation(p, owner) === null;
    if (owner && !ownerUnknown && !isAllowedOwner(p, a.type, owner)) {
      issues.push({ code: 'owner-not-allowed' });
    }
  }
  return issues;
}

/** Pendências da anotação; vazio = completa. */
export function getAnnotationIssues(p: Project, annotationId: string): AnnotationIssue[] {
  const issues = projectIssues(p).get(findById(p.annotations, annotationId).id);
  return issues ? [...issues] : [];
}

/** Pendências de todas as anotações incompletas (filtro "Incompletas" e alertas). */
export function getProjectIssues(p: Project): Map<string, AnnotationIssue[]> {
  return new Map([...projectIssues(p)].map(([id, issues]) => [id, [...issues]]));
}

/**
 * Pendências do projeto, calculadas uma vez por versão do projeto (o mesmo mapa
 * para a mesma versão). Só leitura: use `getProjectIssues` para uma cópia.
 */
export const projectIssues: (
  p: Project,
) => ReadonlyMap<string, readonly AnnotationIssue[]> = memoByProject((p) => {
  const result = new Map<string, readonly AnnotationIssue[]>();
  for (const a of p.annotations) {
    const issues = annotationIssues(p, a);
    if (issues.length > 0) result.set(a.id, issues);
  }
  return result;
});
