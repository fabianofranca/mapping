import { z } from 'zod';

// Formato da especialização (`formatVersion` 1), seção 13.2 do docs/history/PLAN-etapas-1-2.md.
// O zod daqui é a fonte da verdade; `docs/spec.schema.json` o espelha para quem
// não usa TypeScript. Sem APIs de navegador: reutilizável pelo servidor MCP.

export const SPEC_FORMAT = 'mapping-spec';
/** Valor usado antes do renome do produto: a importação ainda o aceita. */
export const LEGACY_SPEC_FORMAT = 'mapeador-spec';
export const SPEC_FORMAT_VERSION = 1;

export type SimpleFieldType = 'string' | 'number' | 'date' | 'enum';
export type FieldType = SimpleFieldType | 'table' | 'ref';

export interface SpecRefAccepts {
  tags?: string[];
  free?: boolean;
}

interface SpecFieldBase {
  key: string;
  label?: string;
  required?: boolean;
  description?: string;
  tags?: string[];
}

export type SpecColumn =
  | (SpecFieldBase & { type: 'string'; default?: string })
  | (SpecFieldBase & { type: 'number'; default?: number })
  | (SpecFieldBase & { type: 'date'; default?: string })
  | (SpecFieldBase & { type: 'enum'; options: string[]; default?: string });

export type SpecField =
  | SpecColumn
  | (SpecFieldBase & { type: 'table'; columns: SpecColumn[]; rowLabel?: string })
  | (SpecFieldBase & { type: 'ref'; accepts: SpecRefAccepts });

export interface SpecAnnotationType {
  id: string;
  name: string;
  description?: string;
  labelField?: string | null;
  requiresOwner?: boolean;
  allowedChildren?: string[];
  fields: SpecField[];
}

export interface SpecLayer {
  id: string;
  name: string;
  color: string;
  annotationTypes: SpecAnnotationType[];
}

export interface Spec {
  format: typeof SPEC_FORMAT | typeof LEGACY_SPEC_FORMAT;
  formatVersion: typeof SPEC_FORMAT_VERSION;
  id: string;
  name: string;
  version: number;
  description?: string;
  layers: SpecLayer[];
}

const KEY_RE = /^[A-Za-z0-9_]+$/;
const TAG_RE = /^[a-z0-9-]+$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nonEmpty = z.string().min(1, 'não pode ser vazio');
const color = z.string().regex(COLOR_RE, 'cor inválida; use o formato #RRGGBB');
const tag = z.string().regex(TAG_RE, 'etiqueta inválida; use [a-z0-9-]+');
const tags = z.array(tag);

const key = z
  .string()
  .regex(KEY_RE, 'chave inválida; use apenas [A-Za-z0-9_], sem espaços')
  .refine((k) => !k.startsWith('_'), 'chave não pode começar com "_" (reservado)');

const fieldType = z.enum(['string', 'number', 'date', 'enum', 'table', 'ref'], {
  error: (issue) =>
    typeof issue.input === 'string'
      ? `"${issue.input}" inválido; use "string", "number", "date", "enum", "table" ou "ref"`
      : 'obrigatório',
});

/** `true` para uma data existente no formato ISO `AAAA-MM-DD`. */
export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const dateString = z
  .string()
  .regex(DATE_RE, 'data inválida; use AAAA-MM-DD')
  .refine(isIsoDate, 'data inexistente');

const acceptsSchema = z
  .object({ tags: tags.optional(), free: z.boolean().optional() })
  .strict()
  .refine(
    (a) => (a.tags?.length ?? 0) > 0 || a.free === true,
    'precisa de pelo menos uma etiqueta ou "free": true',
  );

/** Forma de um campo (coluna ou campo de nível superior); regras cruzadas ficam adiante. */
const fieldShape = z
  .object({
    key,
    label: z.string().min(1).optional(),
    type: fieldType,
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    options: z.array(z.string()).optional(),
    columns: z.array(z.unknown()).optional(),
    tags: tags.optional(),
    rowLabel: z.string().optional(),
    accepts: acceptsSchema.optional(),
    description: z.string().optional(),
  })
  .strict();

type RawField = z.infer<typeof fieldShape>;

/** Valida um campo; `column` = dentro de `table` (só tipos simples). */
function checkField(
  field: RawField,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  column: boolean,
): void {
  const add = (sub: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, sub], message });

  const { type } = field;
  if (column && (type === 'table' || type === 'ref')) {
    add(
      'type',
      `"${type}" não é permitido dentro de table; use "string", "number", "date" ou "enum"`,
    );
    return;
  }
  if (type === 'enum') {
    const options = field.options;
    if (!options || options.length === 0) {
      add('options', 'obrigatório e não vazio em enum');
    } else {
      if (options.some((o) => o === '')) add('options', 'opções não podem ser vazias');
      if (new Set(options).size !== options.length) add('options', 'opções repetidas');
    }
  } else if (field.options !== undefined) {
    add('options', 'só é permitido em enum');
  }

  if (type !== 'table') {
    if (field.columns !== undefined) add('columns', 'só é permitido em table');
    if (field.rowLabel !== undefined) add('rowLabel', 'só é permitido em table');
  }
  if (type !== 'ref' && field.accepts !== undefined) {
    add('accepts', 'só é permitido em ref');
  }

  if (field.default !== undefined) {
    const d = field.default;
    switch (type) {
      case 'string':
        if (typeof d !== 'string') add('default', 'deve ser texto');
        break;
      case 'number':
        if (typeof d !== 'number' || !Number.isFinite(d))
          add('default', 'deve ser número');
        break;
      case 'date':
        if (!dateString.safeParse(d).success)
          add('default', 'deve ser uma data AAAA-MM-DD válida');
        break;
      case 'enum':
        if (typeof d !== 'string' || !(field.options ?? []).includes(d))
          add('default', 'deve ser uma das options');
        break;
      case 'table':
        add('default', 'não existe para table');
        break;
      case 'ref':
        add('default', 'não existe para ref');
        break;
    }
  }

  if (type === 'ref') {
    if (!field.accepts) add('accepts', 'obrigatório em ref');
    if (field.tags !== undefined) add('tags', 'ref não pode ter etiquetas');
  }
  if (type === 'table' && column) return;
  if (column && field.tags !== undefined) {
    add('tags', 'colunas não têm etiquetas; use "tags" na table');
  }
}

/** Valida e normaliza os campos de um tipo (inclusive colunas de table). */
function checkFields(
  fields: RawField[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const seen = new Set<string>();
  fields.forEach((field, i) => {
    const p = [...path, i];
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'key'],
        message: `chave "${field.key}" repetida`,
      });
    }
    seen.add(field.key);
    checkField(field, ctx, p, false);

    if (field.type !== 'table') return;
    const cols = field.columns;
    if (!cols || cols.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'columns'],
        message: 'obrigatório e não vazio em table',
      });
      return;
    }
    const colSeen = new Set<string>();
    const colTypes = new Map<string, string>();
    cols.forEach((raw, j) => {
      const cp = [...p, 'columns', j];
      const parsed = fieldShape.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: [...cp, ...issue.path],
            message: issue.message,
          });
        }
        return;
      }
      const col = parsed.data;
      if (colSeen.has(col.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [...cp, 'key'],
          message: `chave "${col.key}" repetida`,
        });
      }
      colSeen.add(col.key);
      colTypes.set(col.key, col.type);
      checkField(col, ctx, cp, true);
    });

    if ((field.tags?.length ?? 0) > 0) {
      if (field.rowLabel === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [...p, 'rowLabel'],
          message: 'obrigatório em table com tags',
        });
      }
    }
    if (field.rowLabel !== undefined && colTypes.get(field.rowLabel) !== 'string') {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'rowLabel'],
        message: `"${field.rowLabel}" deve ser uma coluna string da tabela`,
      });
    }
  });
}

const annotationTypeShape = z
  .object({
    id: nonEmpty,
    name: nonEmpty,
    description: z.string().optional(),
    labelField: z.string().nullable().optional(),
    requiresOwner: z.boolean().optional(),
    allowedChildren: z.array(nonEmpty).optional(),
    fields: z.array(fieldShape),
  })
  .strict()
  .superRefine((type, ctx) => {
    checkFields(type.fields, ctx, ['fields']);
    if (type.labelField != null) {
      const f = type.fields.find((x) => x.key === type.labelField);
      if (!f || f.type !== 'string') {
        ctx.addIssue({
          code: 'custom',
          path: ['labelField'],
          message: `"${type.labelField}" deve ser um campo string do tipo`,
        });
      }
    }
  });

const layerShape = z
  .object({
    id: nonEmpty,
    name: nonEmpty,
    color,
    annotationTypes: z.array(annotationTypeShape),
  })
  .strict();

export const specSchema = z
  .object({
    format: z.union([z.literal(SPEC_FORMAT), z.literal(LEGACY_SPEC_FORMAT)], {
      error: `deve ser "${SPEC_FORMAT}"`,
    }),
    formatVersion: z.literal(SPEC_FORMAT_VERSION, {
      error: `deve ser ${SPEC_FORMAT_VERSION}`,
    }),
    id: nonEmpty,
    name: nonEmpty,
    version: z.number().int('deve ser inteiro').min(1, 'deve ser >= 1'),
    description: z.string().optional(),
    layers: z.array(layerShape),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const layerIds = new Set<string>();
    /** id do tipo → índice da camada onde está definido. */
    const typeLayer = new Map<string, number>();
    const owned = new Set<string>();

    spec.layers.forEach((layer, li) => {
      if (layerIds.has(layer.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers', li, 'id'],
          message: `id "${layer.id}" repetido`,
        });
      }
      layerIds.add(layer.id);
      layer.annotationTypes.forEach((type, ti) => {
        if (typeLayer.has(type.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['layers', li, 'annotationTypes', ti, 'id'],
            message: `id "${type.id}" repetido na especialização`,
          });
        } else {
          typeLayer.set(type.id, li);
        }
      });
    });

    spec.layers.forEach((layer, li) => {
      layer.annotationTypes.forEach((type, ti) => {
        (type.allowedChildren ?? []).forEach((childId, ci) => {
          const childLayer = typeLayer.get(childId);
          const p = ['layers', li, 'annotationTypes', ti, 'allowedChildren', ci];
          if (childLayer === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: p,
              message: `tipo "${childId}" não existe na especialização`,
            });
          } else if (childLayer === li) {
            ctx.addIssue({
              code: 'custom',
              path: p,
              message: `tipo "${childId}" está na mesma camada; filhos devem estar em outra camada`,
            });
          } else {
            owned.add(childId);
          }
        });
      });
    });

    spec.layers.forEach((layer, li) => {
      layer.annotationTypes.forEach((type, ti) => {
        if (type.requiresOwner && !owned.has(type.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['layers', li, 'annotationTypes', ti, 'requiresOwner'],
            message: `"${type.id}" exige dono, mas nenhum tipo o lista em allowedChildren`,
          });
        }
      });
    });
  });

export type SpecIssue = { path: string; message: string };

/** `layers[1].annotationTypes[0].fields[2].type` a partir de um caminho do zod. */
export function formatSpecPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

export type SpecParseResult =
  { ok: true; spec: Spec } | { ok: false; issues: SpecIssue[]; errors: string[] };

/** Valida um JSON já lido; erros no formato `caminho: mensagem`. */
export function parseSpec(data: unknown): SpecParseResult {
  const result = specSchema.safeParse(data);
  if (result.success) return { ok: true, spec: result.data as Spec };
  const issues = result.error.issues.map((i) => ({
    path: formatSpecPath(i.path),
    message: i.message,
  }));
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Lê o texto JSON de um arquivo de especialização. */
export function parseSpecText(text: string): SpecParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      issues: [{ path: '', message: `JSON inválido: ${message}` }],
      errors: [`JSON inválido: ${message}`],
    };
  }
  return parseSpec(data);
}
