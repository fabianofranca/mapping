import { findById } from './project';
import { memoByProject, projectIndex } from './projectIndex';
import { isTargetAccepted, parseRef, resolveRef, tableRows } from './refs';
import { fieldOf, isAllowedOwner, specLayerOf, typeOfAnnotation } from './specLookup';
import { checkSimpleValue, isEmptyValue } from './typed';
import type { Annotation, JsonValue, Project } from './types';

// Pendências ("incompletas", PLAN.md 13.5): calculadas a partir do projeto e das
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
  | 'ref-not-accepted';

export interface AnnotationIssue {
  readonly code: AnnotationIssueCode;
  /** Campo envolvido. */
  readonly key?: string;
  /** Linha da tabela envolvida. */
  readonly rowId?: string;
  /** Coluna da tabela envolvida. */
  readonly column?: string;
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
  const { type } = resolved;
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
    if (value === undefined || isEmptyValue(value)) {
      if (field.required) issues.push({ code: 'required-empty', key });
      continue;
    }
    if (field.type === 'ref') {
      const ref = parseRef(value);
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
