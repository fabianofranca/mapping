import { z } from 'zod';

// Formato da especialização (`formatVersion` 1, 2 e 3), seção 13.2 do docs/history/PLAN-etapas-1-2.md,
// etapas 3b e 4 do plano. A versão 2 acrescenta `platforms`, `code` e o campo `codeRef`;
// a versão 1 é a 2 sem plataformas e sem `code`; a versão 3 é a 2 mais `sources` (origens
// externas nos tipos e nos campos, inclusive nas colunas de `table`).
// O zod daqui é a fonte da verdade; `docs/spec.schema.json` o espelha para quem
// não usa TypeScript. Sem APIs de navegador: reutilizável pelo servidor MCP.

export const SPEC_FORMAT = 'mapping-spec';
/** Valor usado antes do renome do produto: a importação ainda o aceita. */
export const LEGACY_SPEC_FORMAT = 'mapeador-spec';
/** Versão atual do formato (a que a documentação e os exemplos novos usam). */
export const SPEC_FORMAT_VERSION = 3;
/** Versões aceitas na importação. */
export const SPEC_FORMAT_VERSIONS = [1, 2, 3] as const;
export type SpecFormatVersion = (typeof SPEC_FORMAT_VERSIONS)[number];

export type SimpleFieldType = 'string' | 'number' | 'date' | 'enum';
export type FieldType = SimpleFieldType | 'table' | 'ref' | 'codeRef';

/** Plataforma declarada pela especialização (ex: um app, um contrato de API). */
export interface SpecPlatform {
  id: string;
  name: string;
  /** Informativo: ajuda o agente a saber em que linguagem o código está. */
  language?: string;
}

/** Como um tipo de anotação vira código em uma plataforma. */
export interface SpecCode {
  /** Componente ou tipo que implementa o tipo de anotação na plataforma. */
  symbol: string;
  /** Chave do campo do tipo → nome do parâmetro no código. */
  params?: Record<string, string>;
  /** Chave de um campo `enum` → (valor no mapping → valor no código). */
  values?: Record<string, Record<string, string>>;
  notes?: string;
}

/** `code` de um tipo de anotação, por id de plataforma. */
export type SpecCodeMap = Record<string, SpecCode>;

/**
 * Elemento de um sistema externo a que um tipo de anotação corresponde (v3), ex:
 * `{ system: "figma", name: "DS/Button" }`. Tem `id`, `name` ou os dois.
 */
export interface SpecTypeSource {
  system: string;
  id?: string;
  name?: string;
}

/**
 * Propriedade de origem de um campo (v3), ex: `{ system: "figma", name: "Style" }`.
 * `values` (só em `enum`) traduz o valor de origem para uma das `options`.
 */
export interface SpecFieldSource {
  system: string;
  name: string;
  values?: Record<string, string>;
}

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
  /** Propriedades de origem (só `formatVersion` 3). */
  sources?: SpecFieldSource[];
}

export type SpecColumn =
  | (SpecFieldBase & { type: 'string'; default?: string })
  | (SpecFieldBase & { type: 'number'; default?: number })
  | (SpecFieldBase & { type: 'date'; default?: string })
  | (SpecFieldBase & { type: 'enum'; options: string[]; default?: string });

export type SpecField =
  | SpecColumn
  | (SpecFieldBase & { type: 'table'; columns: SpecColumn[]; rowLabel?: string })
  | (SpecFieldBase & { type: 'ref'; accepts: SpecRefAccepts })
  | (SpecFieldBase & { type: 'codeRef'; platforms?: string[] });

export interface SpecAnnotationType {
  id: string;
  name: string;
  description?: string;
  labelField?: string | null;
  requiresOwner?: boolean;
  allowedChildren?: string[];
  fields: SpecField[];
  code?: SpecCodeMap;
  /** Elementos de origem a que o tipo corresponde (só `formatVersion` 3). */
  sources?: SpecTypeSource[];
}

export interface SpecLayer {
  id: string;
  name: string;
  color: string;
  annotationTypes: SpecAnnotationType[];
}

export interface Spec {
  format: typeof SPEC_FORMAT | typeof LEGACY_SPEC_FORMAT;
  formatVersion: SpecFormatVersion;
  id: string;
  name: string;
  version: number;
  description?: string;
  platforms?: SpecPlatform[];
  layers: SpecLayer[];
}

const KEY_RE = /^[A-Za-z0-9_]+$/;
const TAG_RE = /^[a-z0-9-]+$/;
/** Formato do id de uma plataforma (`platforms[].id`, chaves de `code` e de `platformRepos`). */
export const PLATFORM_ID_RE = /^[a-z0-9-]+$/;
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

const platformId = z
  .string()
  .regex(PLATFORM_ID_RE, 'id de plataforma inválido; use [a-z0-9-]+');

const fieldType = z.enum(
  ['string', 'number', 'date', 'enum', 'table', 'ref', 'codeRef'],
  {
    error: (issue) =>
      typeof issue.input === 'string'
        ? `"${issue.input}" inválido; use "string", "number", "date", "enum", "table", "ref" ou "codeRef"`
        : 'obrigatório',
  },
);

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

const typeSourceShape = z
  .object({ system: nonEmpty, id: nonEmpty.optional(), name: nonEmpty.optional() })
  .strict()
  .refine((s) => s.id !== undefined || s.name !== undefined, 'precisa de "id" ou "name"');

const fieldSourceShape = z
  .object({
    system: nonEmpty,
    name: nonEmpty,
    values: z.record(z.string(), nonEmpty).optional(),
  })
  .strict();

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
    platforms: z.array(platformId).optional(),
    description: z.string().optional(),
    sources: z.array(fieldSourceShape).optional(),
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
  const add2 = (sub: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, ...sub], message });

  const { type } = field;
  if (column && (type === 'table' || type === 'ref' || type === 'codeRef')) {
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
  if (type !== 'codeRef' && field.platforms !== undefined) {
    add('platforms', 'só é permitido em codeRef');
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
      case 'codeRef':
        add('default', 'não existe para codeRef');
        break;
    }
  }

  if (type === 'ref') {
    if (!field.accepts) add('accepts', 'obrigatório em ref');
    if (field.tags !== undefined) add('tags', 'ref não pode ter etiquetas');
  }
  if (type === 'codeRef' && field.tags !== undefined) {
    add('tags', 'codeRef não pode ter etiquetas');
  }
  if (type === 'codeRef' && field.platforms !== undefined) {
    if (field.platforms.length === 0) add('platforms', 'não pode ser vazio');
    else if (new Set(field.platforms).size !== field.platforms.length) {
      add('platforms', 'plataformas repetidas');
    }
  }
  (field.sources ?? []).forEach((source, i) => {
    if (source.values === undefined) return;
    if (type !== 'enum') {
      add2(['sources', i, 'values'], 'só é permitido em campos enum');
      return;
    }
    for (const [from, to] of Object.entries(source.values)) {
      if (!(field.options ?? []).includes(to)) {
        add2(['sources', i, 'values', from], `"${to}" não está nas options`);
      }
    }
  });

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

const codeEntryShape = z
  .object({
    symbol: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .min(1, 'não pode ser vazio'),
    params: z.record(z.string(), nonEmpty).optional(),
    values: z.record(z.string(), z.record(z.string(), nonEmpty)).optional(),
    notes: z.string().optional(),
  })
  .strict();

/** `params` e `values` de cada plataforma do `code` só citam campos (e opções) do tipo. */
function checkCode(
  type: { fields: RawField[]; code?: Record<string, z.infer<typeof codeEntryShape>> },
  ctx: z.RefinementCtx,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  for (const [platform, entry] of Object.entries(type.code ?? {})) {
    for (const k of Object.keys(entry.params ?? {})) {
      if (!fields.has(k)) {
        add(['code', platform, 'params', k], `"${k}" não é um campo do tipo`);
      }
    }
    for (const [k, translation] of Object.entries(entry.values ?? {})) {
      const field = fields.get(k);
      if (!field) {
        add(['code', platform, 'values', k], `"${k}" não é um campo do tipo`);
        continue;
      }
      if (field.type !== 'enum') {
        add(['code', platform, 'values', k], `"${k}" deve ser um campo enum do tipo`);
        continue;
      }
      for (const option of Object.keys(translation)) {
        if (!(field.options ?? []).includes(option)) {
          add(
            ['code', platform, 'values', k, option],
            `"${option}" não está nas options de "${k}"`,
          );
        }
      }
    }
  }
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
    code: z.record(z.string(), codeEntryShape).optional(),
    sources: z.array(typeSourceShape).optional(),
  })
  .strict()
  .superRefine((type, ctx) => {
    checkFields(type.fields, ctx, ['fields']);
    checkCode(type, ctx);
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

const platformShape = z
  .object({
    id: platformId,
    name: nonEmpty,
    language: nonEmpty.optional(),
  })
  .strict();

/** `sources` só existe na `formatVersion` 3: aponta cada uso numa versão anterior. */
function checkNoSources(
  layers: readonly {
    annotationTypes: readonly { sources?: unknown; fields: readonly RawField[] }[];
  }[],
  ctx: z.RefinementCtx,
): void {
  const add = (path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', path, message: 'só é permitido com formatVersion 3' });
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp = ['layers', li, 'annotationTypes', ti];
      if (type.sources !== undefined) add([...tp, 'sources']);
      type.fields.forEach((field, fi) => {
        const fp = [...tp, 'fields', fi];
        if (field.sources !== undefined) add([...fp, 'sources']);
        (field.columns ?? []).forEach((column, ci) => {
          if (typeof column === 'object' && column !== null && 'sources' in column) {
            add([...fp, 'columns', ci, 'sources']);
          }
        });
      });
    });
  });
}

export const specSchema = z
  .object({
    format: z.union([z.literal(SPEC_FORMAT), z.literal(LEGACY_SPEC_FORMAT)], {
      error: `deve ser "${SPEC_FORMAT}"`,
    }),
    formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)], {
      error: `deve ser ${SPEC_FORMAT_VERSIONS.slice(0, -1).join(', ')} ou ${String(SPEC_FORMAT_VERSIONS.at(-1))}`,
    }),
    id: nonEmpty,
    name: nonEmpty,
    version: z.number().int('deve ser inteiro').min(1, 'deve ser >= 1'),
    description: z.string().optional(),
    platforms: z.array(platformShape).optional(),
    layers: z.array(layerShape),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.platforms !== undefined && spec.formatVersion < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['platforms'],
        message: 'só é permitido com formatVersion 2',
      });
    }
    const platformIds = new Set<string>();
    (spec.platforms ?? []).forEach((platform, pi) => {
      if (platformIds.has(platform.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['platforms', pi, 'id'],
          message: `id "${platform.id}" repetido`,
        });
      }
      platformIds.add(platform.id);
    });
    const hasPlatforms = platformIds.size > 0;
    if (spec.formatVersion < 3) checkNoSources(spec.layers, ctx);
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
        const tp = ['layers', li, 'annotationTypes', ti];
        if (type.code !== undefined) {
          if (!hasPlatforms) {
            ctx.addIssue({
              code: 'custom',
              path: [...tp, 'code'],
              message: 'só é permitido em especializações que declaram platforms',
            });
          } else {
            for (const id of Object.keys(type.code)) {
              if (platformIds.has(id)) continue;
              ctx.addIssue({
                code: 'custom',
                path: [...tp, 'code', id],
                message: `plataforma "${id}" não declarada em platforms`,
              });
            }
          }
        }
        type.fields.forEach((field, fi) => {
          if (field.type !== 'codeRef') return;
          const fp = [...tp, 'fields', fi];
          if (!hasPlatforms) {
            ctx.addIssue({
              code: 'custom',
              path: [...fp, 'type'],
              message:
                '"codeRef" só é permitido em especializações que declaram platforms',
            });
            return;
          }
          (field.platforms ?? []).forEach((id, i) => {
            if (platformIds.has(id)) return;
            ctx.addIssue({
              code: 'custom',
              path: [...fp, 'platforms', i],
              message: `plataforma "${id}" não declarada em platforms`,
            });
          });
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
