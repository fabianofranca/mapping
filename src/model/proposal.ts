import { z } from 'zod';
import {
  annotationSchema,
  entrySchema,
  containerSchema,
  jsonValue,
  layerSchema,
  markingSchema,
  normalizeIsoDate,
  placementSchema,
  platformRepoSchema,
  rectSchema,
  sourceSchema,
} from './schema';
import { PLATFORM_ID_RE, formatSpecPath, specSchema, type SpecIssue } from './spec';
import type { JsonValue } from './types';

// Formato da proposta de alteração (etapa 4): `proposals/<id>/proposal.json`,
// `formatVersion` 3 (a 1 e a 2 continuam lidas). Ver docs/PROPOSAL-FORMAT.md. O zod daqui é a fonte da verdade; a
// leitura devolve os erros com o caminho exato (`changes[3].to.rect.width: …`).

export const PROPOSAL_FORMAT = 'mapping-proposal';
export const PROPOSAL_FORMAT_VERSION = 3;
/**
 * Versões lidas: a 3 não tem `inherit` na anotação (o campo de uma proposta antiga é ignorado,
 * com aviso); a 2 acrescenta `add_container` às `operations`; a 1 continua válida.
 */
export const PROPOSAL_FORMAT_VERSIONS = [1, 2, 3] as const;
/** Pasta das propostas, relativa à raiz do projeto. */
export const PROPOSALS_DIR = 'proposals';
/** Nome do arquivo da proposta dentro de `proposals/<id>/`. */
export const PROPOSAL_FILE = 'proposal.json';

/**
 * `open`: em revisão. `applied`: tudo decidido e as aceitas aplicadas. `superseded`:
 * substituída por outra (as aceitas ainda podem ser aplicadas; as pendentes não).
 * `withdrawn`: retirada pelo agente.
 */
export type ProposalStatus = 'open' | 'applied' | 'superseded' | 'withdrawn';
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'open',
  'applied',
  'superseded',
  'withdrawn',
];

export type ChangeKind = 'create' | 'update' | 'remove';

/** Entidades que uma mudança pode alterar. As três primeiras formam o grupo "Projeto". */
export type ChangeEntity =
  'specialization' | 'platformRepo' | 'layer' | 'image' | 'marking' | 'annotation';

export const CHANGE_ENTITIES: readonly ChangeEntity[] = [
  'specialization',
  'platformRepo',
  'layer',
  'image',
  'marking',
  'annotation',
];

/**
 * Campos alterados de uma imagem (`file` é a troca: `{ file, width, height }`). `background` e
 * `size` (`{ width, height }`) só existem no container sem arquivo (v10).
 */
export const IMAGE_FIELDS = [
  'name',
  'file',
  'background',
  'size',
  'placement',
  'markingColor',
  'locked',
  'source',
] as const;
/** `position` de marcação: índice entre as irmãs (mesma imagem e mesmo pai), só quando a ordem relativa muda. */
export const MARKING_FIELDS = [
  'name',
  'rect',
  'parentId',
  'containerId',
  'locked',
  'source',
  'position',
] as const;
/**
 * Campos fixos de uma anotação. Além deles: `values.<key>` (um campo da tipada) e
 * `entries.<id>` (um par da livre). `type` é a troca de tipo, que leva `type`, `values`
 * e `entries` juntos (ex: a conversão para livre ao remover uma especialização).
 */
export const ANNOTATION_FIELDS = [
  'name',
  'parentAnnotationId',
  'markingId',
  'layerId',
  'type',
] as const;
/** `position` é o índice na lista de camadas (só quando a ordem relativa muda). */
export const LAYER_FIELDS = ['name', 'color', 'spec', 'position'] as const;

export const VALUES_FIELD_PREFIX = 'values.';
export const ENTRIES_FIELD_PREFIX = 'entries.';

/**
 * Uma alteração isolada. `from` é o valor no momento da proposta e `to` o proposto:
 * na criação, `from` é `null` e `to` a entidade inteira; na remoção, o contrário; na
 * alteração, os valores do campo `field` (especialização e repositório não têm campo:
 * `field` é `null` e os valores são a entidade inteira). `imageId` e `markingId` dizem
 * em que imagem e item (marcação) a mudança aparece na revisão (`null` no grupo Projeto).
 */
export interface Change {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly entity: ChangeEntity;
  /** Id da entidade; no repositório, o id da plataforma. */
  readonly entityId: string;
  readonly imageId: string | null;
  readonly markingId: string | null;
  readonly field: string | null;
  readonly from: JsonValue;
  readonly to: JsonValue;
}

export type DecisionState = 'accepted' | 'rejected';

export interface Decision {
  readonly state: DecisionState;
  readonly at: string;
}

/** Decisão de cada mudança (por id). Mudança ausente = sem decisão. */
export type ProposalDecisions = { readonly [changeId: string]: Decision };

/** Mudanças já efetivadas no projeto (por id), com a data. */
export type ProposalApplied = { readonly [changeId: string]: { readonly at: string } };

/** Níveis da revisão. */
export type ReviewLevel = 'proposal' | 'project' | 'image' | 'item' | 'change';

/**
 * Alvo de uma decisão ou nota. `id` é `null` em `proposal` e `project`; nos demais, o
 * id da imagem, da marcação (item) ou da mudança.
 */
export interface ReviewTarget {
  readonly level: ReviewLevel;
  readonly id: string | null;
}

export interface ProposalNote {
  readonly id: string;
  readonly target: ReviewTarget;
  readonly text: string;
  readonly at: string;
}

export interface Proposal {
  readonly format: typeof PROPOSAL_FORMAT;
  readonly formatVersion: (typeof PROPOSAL_FORMAT_VERSIONS)[number];
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  /** De onde vieram os dados (texto livre, ex: "Figma: Loja v3 › Checkout"). */
  readonly origin: string | null;
  readonly author: string | null;
  readonly createdAt: string;
  /** `revision` do `mapping.json` sobre o qual as mudanças foram calculadas. */
  readonly baseRevision: number;
  /** Id da proposta que esta substitui. */
  readonly supersedes: string | null;
  readonly status: ProposalStatus;
  /** Contador de gravações do arquivo da proposta (mesma conferência do `mapping.json`). */
  readonly revision: number;
  /** As operações enviadas pelo agente, só para referência. */
  readonly operations: readonly JsonValue[];
  readonly changes: readonly Change[];
  readonly decisions: ProposalDecisions;
  readonly notes: readonly ProposalNote[];
  readonly applied: ProposalApplied;
}

/** `proposals/<id>`. */
export function proposalDir(proposalId: string): string {
  return `${PROPOSALS_DIR}/${proposalId}`;
}

/** `proposals/<id>/proposal.json`. */
export function proposalFilePath(proposalId: string): string {
  return `${proposalDir(proposalId)}/${PROPOSAL_FILE}`;
}

/**
 * Onde a imagem nova ou trocada espera a aceitação: `proposals/<id>/` mais o caminho
 * definitivo (`images/tela.webp` → `proposals/<id>/images/tela.webp`).
 */
export function proposalImagePath(proposalId: string, file: string): string {
  return `${proposalDir(proposalId)}/${file}`;
}

/**
 * Onde os arquivos do pacote de biblioteca esperam a aceitação: `proposals/<id>/` mais a
 * pasta definitiva (`specs/material3` → `proposals/<id>/specs/material3`).
 */
export function proposalPackageDir(proposalId: string, dir: string): string {
  return `${proposalDir(proposalId)}/${dir}`;
}

// ---------------------------------------------------------------------------
// Validação (zod)

/** Id da proposta: vira nome de pasta, então só `[A-Za-z0-9._-]`, sem começar com ponto. */
export const PROPOSAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const id = z.string().min(1, 'não pode ser vazio');
const proposalId = z
  .string()
  .regex(PROPOSAL_ID_RE, 'id inválido; use [A-Za-z0-9._-], sem começar com ponto');
const isoDate = z.iso
  .datetime({ offset: true, error: 'data inválida; use ISO 8601 (UTC)' })
  .transform(normalizeIsoDate);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor inválida; use #RRGGBB');
const optionalText = z.string().nullable();

const imageFileValue = z.object({
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const imageSizeValue = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const typeRef = z.object({ specId: id, typeId: id });

/** Valor do campo `type` de uma anotação: o tipo com os valores e pares que vão junto. */
const annotationTypeValue = z
  .object({
    type: typeRef.nullable(),
    values: z.record(z.string(), jsonValue).nullable(),
    entries: z.array(entrySchema),
  })
  .superRefine((v, ctx) => {
    if ((v.type === null) !== (v.values === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'type e values devem ser ambos null ou ambos preenchidos',
      });
    }
    if (v.type !== null && v.entries.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'anotação tipada não tem entries',
      });
    }
  });

const entryValue = z.object({ key: z.string(), value: z.string() }).nullable();

const specializationValue = z
  .object({
    id,
    version: z.number().int().min(1),
    file: z.string().min(1),
    spec: specSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.spec && v.spec.id !== v.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['spec', 'id'],
        message: `deve ser "${v.id}"`,
      });
    }
  });

const entitySchemas: Record<ChangeEntity, z.ZodType> = {
  specialization: specializationValue,
  platformRepo: platformRepoSchema,
  layer: layerSchema,
  image: containerSchema,
  marking: markingSchema,
  annotation: annotationSchema,
};

const imageFieldSchemas: Record<(typeof IMAGE_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  file: imageFileValue,
  background: hexColor,
  size: imageSizeValue,
  placement: placementSchema,
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
};

const markingFieldSchemas: Record<(typeof MARKING_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  rect: rectSchema,
  parentId: id.nullable(),
  containerId: id,
  locked: z.boolean(),
  source: sourceSchema.nullable(),
  position: z.number().int().min(0),
};

const annotationFieldSchemas: Record<(typeof ANNOTATION_FIELDS)[number], z.ZodType> = {
  name: z.string().nullable(),
  parentAnnotationId: id.nullable(),
  markingId: id,
  layerId: id,
  type: annotationTypeValue,
};

const layerFieldSchemas: Record<(typeof LAYER_FIELDS)[number], z.ZodType> = {
  name: z.string().trim().min(1),
  color: hexColor,
  spec: z.object({ specId: id, layerId: id }).nullable(),
  position: z.number().int().min(0),
};

function has<K extends string>(record: Record<K, unknown>, key: string): key is K {
  return Object.hasOwn(record, key);
}

/** Schema do valor de `field` na `entity`; `null` se o campo não existe. */
function fieldSchema(entity: ChangeEntity, field: string): z.ZodType | null {
  switch (entity) {
    case 'image':
      return has(imageFieldSchemas, field) ? imageFieldSchemas[field] : null;
    case 'marking':
      return has(markingFieldSchemas, field) ? markingFieldSchemas[field] : null;
    case 'layer':
      return has(layerFieldSchemas, field) ? layerFieldSchemas[field] : null;
    case 'annotation':
      if (field.startsWith(VALUES_FIELD_PREFIX)) {
        return field.length > VALUES_FIELD_PREFIX.length ? jsonValue : null;
      }
      if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
        return field.length > ENTRIES_FIELD_PREFIX.length ? entryValue : null;
      }
      return has(annotationFieldSchemas, field) ? annotationFieldSchemas[field] : null;
    default:
      return null;
  }
}

/** Valida `value` com `schema` e copia os erros para `path`. */
function checkValue(
  schema: z.ZodType,
  value: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const result = schema.safeParse(value);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
      message: issue.message,
    });
  }
}

function idOf(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).id
    : undefined;
}

const changeSchema = z
  .object({
    id,
    kind: z.enum(['create', 'update', 'remove'], {
      error: 'deve ser "create", "update" ou "remove"',
    }),
    entity: z.enum(CHANGE_ENTITIES as [ChangeEntity, ...ChangeEntity[]], {
      error: `deve ser ${CHANGE_ENTITIES.map((e) => `"${e}"`).join(', ')}`,
    }),
    entityId: id,
    imageId: id.nullable(),
    markingId: id.nullable(),
    field: z.string().nullable(),
    from: jsonValue,
    to: jsonValue,
  })
  .superRefine((c, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (c.entity === 'platformRepo' && !PLATFORM_ID_RE.test(c.entityId)) {
      add(['entityId'], 'id de plataforma inválido; use [a-z0-9-]+');
    }
    const projectLevel =
      c.entity === 'specialization' ||
      c.entity === 'platformRepo' ||
      c.entity === 'layer';
    if (projectLevel && (c.imageId !== null || c.markingId !== null)) {
      add(['imageId'], 'mudanças do projeto não têm imageId nem markingId');
    }
    if (!projectLevel && c.imageId === null) add(['imageId'], 'obrigatório');
    if ((c.entity === 'marking' || c.entity === 'annotation') && c.markingId === null) {
      add(['markingId'], 'obrigatório');
    }
    if (c.entity === 'marking' && c.markingId !== null && c.markingId !== c.entityId) {
      add(['markingId'], `deve ser "${c.entityId}"`);
    }
    if (c.entity === 'image' && c.imageId !== null && c.imageId !== c.entityId) {
      add(['imageId'], `deve ser "${c.entityId}"`);
    }

    const wholeEntity = c.entity === 'specialization' || c.entity === 'platformRepo';
    if (c.kind === 'update' && !wholeEntity) {
      if (c.field === null) {
        add(['field'], 'obrigatório na alteração');
        return;
      }
      const schema = fieldSchema(c.entity, c.field);
      if (!schema) {
        add(['field'], `"${c.field}" não é um campo de ${c.entity}`);
        return;
      }
      // Camada ou marcação criada nesta proposta e reposicionada: `from` é `null`.
      const fromSchema = c.field === 'position' ? schema.nullable() : schema;
      checkValue(fromSchema, c.from, ctx, ['from']);
      checkValue(schema, c.to, ctx, ['to']);
      return;
    }
    if (c.field !== null) {
      add(['field'], 'deve ser null em criação, remoção, especialização e repositório');
    }
    const schema = entitySchemas[c.entity];
    if (c.kind !== 'create') checkValue(schema, c.from, ctx, ['from']);
    else if (c.from !== null) add(['from'], 'deve ser null na criação');
    if (c.kind !== 'remove') checkValue(schema, c.to, ctx, ['to']);
    else if (c.to !== null) add(['to'], 'deve ser null na remoção');

    if (c.entity === 'platformRepo') return;
    // Criação e remoção levam a entidade inteira: o id dela é o `entityId`.
    for (const side of ['from', 'to'] as const) {
      const value = c[side];
      if (value === null || (c.kind === 'update' && c.entity !== 'specialization'))
        continue;
      const valueId = idOf(value);
      if (valueId !== undefined && valueId !== c.entityId) {
        add([side, 'id'], `deve ser "${c.entityId}"`);
      }
    }
  });

const targetSchema = z
  .object({
    level: z.enum(['proposal', 'project', 'image', 'item', 'change'], {
      error: 'deve ser "proposal", "project", "image", "item" ou "change"',
    }),
    id: id.nullable(),
  })
  .superRefine((t, ctx) => {
    const global = t.level === 'proposal' || t.level === 'project';
    if (global && t.id !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `deve ser null em ${t.level}`,
      });
    }
    if (!global && t.id === null) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'obrigatório' });
    }
  });

export const proposalSchema = z
  .object({
    format: z.literal(PROPOSAL_FORMAT, { error: `deve ser "${PROPOSAL_FORMAT}"` }),
    formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)], {
      error: 'deve ser 1, 2 ou 3',
    }),
    id: proposalId,
    title: z.string().trim().min(1, 'não pode ser vazio'),
    description: optionalText,
    origin: optionalText,
    author: optionalText,
    createdAt: isoDate,
    baseRevision: z.number().int().min(0),
    supersedes: proposalId.nullable(),
    status: z.enum(['open', 'applied', 'superseded', 'withdrawn'], {
      error: 'deve ser "open", "applied", "superseded" ou "withdrawn"',
    }),
    revision: z.number().int().min(0),
    operations: z.array(jsonValue),
    changes: z.array(changeSchema),
    decisions: z.record(
      z.string(),
      z.object({
        state: z.enum(['accepted', 'rejected'], {
          error: 'deve ser "accepted" ou "rejected"',
        }),
        at: isoDate,
      }),
    ),
    notes: z.array(z.object({ id, target: targetSchema, text: z.string(), at: isoDate })),
    applied: z.record(z.string(), z.object({ at: isoDate })),
  })
  .superRefine((p, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const changeIds = new Set<string>();
    p.changes.forEach((c, i) => {
      if (changeIds.has(c.id)) add(['changes', i, 'id'], `id "${c.id}" repetido`);
      changeIds.add(c.id);
    });
    if (p.supersedes !== null && p.supersedes === p.id) {
      add(['supersedes'], 'uma proposta não substitui a si mesma');
    }
    for (const changeId of Object.keys(p.decisions)) {
      if (!changeIds.has(changeId)) add(['decisions', changeId], 'mudança inexistente');
    }
    for (const changeId of Object.keys(p.applied)) {
      if (!changeIds.has(changeId)) add(['applied', changeId], 'mudança inexistente');
      else if (p.decisions[changeId]?.state !== 'accepted') {
        add(['applied', changeId], 'só uma mudança aceita pode estar aplicada');
      }
    }
    const noteIds = new Set<string>();
    p.notes.forEach((n, i) => {
      if (noteIds.has(n.id)) add(['notes', i, 'id'], `id "${n.id}" repetido`);
      noteIds.add(n.id);
      if (n.target.level === 'change' && n.target.id !== null) {
        if (!changeIds.has(n.target.id)) {
          add(['notes', i, 'target', 'id'], 'mudança inexistente');
        }
      }
    });
  });

export type ProposalParseResult =
  | {
      readonly ok: true;
      readonly proposal: Proposal;
      /** Avisos da leitura (ex.: campo que saiu do formato e foi ignorado). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly issues: SpecIssue[]; readonly errors: string[] };

/**
 * Proposta escrita antes do schema 11: o valor de `platformRepo` tinha `urlTemplate` além de
 * `localPath`. O `urlTemplate` é ignorado (o endereço dos arquivos é da especialização): cada
 * lado fica só com `localPath`. Uma mudança que só alterava o `urlTemplate` vira uma
 * atualização com `from` igual a `to`, sem efeito no projeto.
 */
function withoutLegacyUrlTemplate(proposal: Proposal): Proposal {
  const strip = (value: JsonValue): JsonValue =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { localPath: (value as { readonly localPath?: JsonValue }).localPath ?? null }
      : value;
  if (!proposal.changes.some((c) => c.entity === 'platformRepo')) return proposal;
  return {
    ...proposal,
    changes: proposal.changes.map((c) =>
      c.entity === 'platformRepo' ? { ...c, from: strip(c.from), to: strip(c.to) } : c,
    ),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Proposta escrita antes do schema 12: a marcação apontava para a imagem por `imageId`, e agora
 * aponta para o container por `containerId`. Na leitura, a criação e a remoção de marcação
 * (valor inteiro) e a mudança do campo `imageId` passam para o nome novo. O cabeçalho da
 * mudança (`imageId`, que diz em que container ela aparece na revisão) não muda.
 */
function withContainerIdOnMarkings(data: unknown): unknown {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return data;
  const rename = (value: unknown): unknown => {
    if (!isPlainRecord(value) || !Object.hasOwn(value, 'imageId')) return value;
    if (Object.hasOwn(value, 'containerId')) return value;
    const { imageId, ...rest } = value;
    return { ...rest, containerId: imageId };
  };
  return {
    ...data,
    changes: data.changes.map((c: unknown) => {
      if (!isPlainRecord(c) || c.entity !== 'marking') return c;
      return {
        ...c,
        field: c.field === 'imageId' ? 'containerId' : c.field,
        from: c.field === null ? rename(c.from) : c.from,
        to: c.field === null ? rename(c.to) : c.to,
      };
    }),
  };
}

/**
 * Proposta escrita antes do schema 13: a anotação tinha `inherit` (a herança para as marcações
 * descendentes saiu do formato). Na leitura, a mudança do campo `inherit` é descartada (com a
 * decisão e a aplicação dela; uma nota presa a ela passa para a proposta) e o campo some das
 * anotações inteiras de criação e remoção. `ignored` conta o que foi ignorado, para o aviso.
 */
function withoutInherit(data: unknown): { data: unknown; ignored: number } {
  if (!isPlainRecord(data) || !Array.isArray(data.changes)) return { data, ignored: 0 };
  let ignored = 0;
  const dropped = new Set<string>();
  const strip = (value: unknown): unknown => {
    if (!isPlainRecord(value) || !Object.hasOwn(value, 'inherit')) return value;
    const { inherit, ...rest } = value;
    void inherit;
    ignored += 1;
    return rest;
  };
  const changes: unknown[] = [];
  for (const c of data.changes as unknown[]) {
    if (!isPlainRecord(c) || c.entity !== 'annotation') {
      changes.push(c);
    } else if (c.field === 'inherit') {
      ignored += 1;
      if (typeof c.id === 'string') dropped.add(c.id);
    } else if (c.field === null) {
      changes.push({ ...c, from: strip(c.from), to: strip(c.to) });
    } else {
      changes.push(c);
    }
  }
  if (ignored === 0) return { data, ignored };
  const without = (record: unknown): unknown =>
    isPlainRecord(record)
      ? Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.has(key)))
      : record;
  const notes = Array.isArray(data.notes)
    ? (data.notes as unknown[]).map((n) => {
        if (!isPlainRecord(n) || !isPlainRecord(n.target)) return n;
        const { level, id: targetId } = n.target;
        return level === 'change' && typeof targetId === 'string' && dropped.has(targetId)
          ? { ...n, target: { level: 'proposal', id: null } }
          : n;
      })
    : data.notes;
  return {
    data: {
      ...data,
      changes,
      decisions: without(data.decisions),
      applied: without(data.applied),
      notes,
    },
    ignored,
  };
}

/** Valida um JSON já lido; erros no formato `caminho: mensagem`. */
export function parseProposal(data: unknown): ProposalParseResult {
  const { data: current, ignored } = withoutInherit(withContainerIdOnMarkings(data));
  const result = proposalSchema.safeParse(current);
  if (result.success) {
    return {
      ok: true,
      proposal: withoutLegacyUrlTemplate(result.data as Proposal),
      warnings:
        ignored === 0
          ? []
          : [
              `"inherit" saiu do formato (schema 13): ${ignored} ocorrência(s) na proposta ignorada(s); a anotação vale só para a própria marcação`,
            ],
    };
  }
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

/** Lê o texto de um `proposal.json`. */
export function parseProposalText(text: string): ProposalParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = `JSON inválido: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, issues: [{ path: '', message }], errors: [message] };
  }
  return parseProposal(data);
}

/**
 * Texto do `proposal.json`: chaves de nível superior e das mudanças sempre na mesma
 * ordem, indentação de 2 espaços e quebra de linha no final.
 */
export function serializeProposal(p: Proposal): string {
  const canonical = {
    format: p.format,
    formatVersion: p.formatVersion,
    id: p.id,
    title: p.title,
    description: p.description,
    origin: p.origin,
    author: p.author,
    createdAt: p.createdAt,
    baseRevision: p.baseRevision,
    supersedes: p.supersedes,
    status: p.status,
    revision: p.revision,
    operations: p.operations,
    changes: p.changes.map((c) => ({
      id: c.id,
      kind: c.kind,
      entity: c.entity,
      entityId: c.entityId,
      imageId: c.imageId,
      markingId: c.markingId,
      field: c.field,
      from: c.from,
      to: c.to,
    })),
    decisions: Object.fromEntries(
      Object.entries(p.decisions).map(([k, d]) => [k, { state: d.state, at: d.at }]),
    ),
    notes: p.notes.map((n) => ({
      id: n.id,
      target: { level: n.target.level, id: n.target.id },
      text: n.text,
      at: n.at,
    })),
    applied: Object.fromEntries(
      Object.entries(p.applied).map(([k, a]) => [k, { at: a.at }]),
    ),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
