import { z } from 'zod';
import { PLATFORM_ID_RE } from './spec';
import {
  APP_ID,
  LEGACY_APP_ID,
  COORDINATE_SYSTEM,
  SCHEMA_VERSION,
  type JsonValue,
  type ProjectFile,
} from './types';

// Schema zod do mapping.json v13. Valida a forma; os invariantes entre coleções
// (referências, contenção, sobreposição) ficam em `invariants.ts`. Os valores das
// anotações tipadas são JSON livre aqui: a conferência contra o tipo vira pendência
// (`issues.ts`).

const id = z.string().min(1);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const finite = z.number().finite();

/** Data ISO 8601 como gravada pela app: UTC com `Z`; com fuso, normalizada para UTC. */
export function normalizeIsoDate(value: string): string {
  return value.endsWith('Z') ? value : new Date(value).toISOString();
}

/** Data ISO 8601, com `Z` ou com fuso (escrita por ferramenta externa); sai em UTC `Z`. */
export const isoDateTime = z.iso.datetime({ offset: true }).transform(normalizeIsoDate);

/**
 * Retângulo de inteiros. `x` e `y` aceitam negativos porque a marcação do canvas (v13,
 * `containerId` nulo) vive em unidades do canvas, onde não há borda. Quem é marcação de
 * container continua dentro da imagem: o schema não sabe de qual espaço o retângulo é, então
 * a recusa fica na invariante `rect-out-of-image` (que só vale com `containerId` não nulo, e
 * tem reparo: o recorte).
 */
export const rectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const placementSchema = z.object({
  x: finite,
  y: finite,
  scale: finite.positive(),
});

/** Identidade no sistema de origem (v8): `system` e `id` não vazios, `url` opcional (`null`). */
export const sourceSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
  url: z.string().nullable(),
});

export const layerSchema = z.object({
  id,
  name: z.string().trim().min(1),
  color: hexColor,
  spec: z.object({ specId: id, layerId: id }).nullable(),
});

export const containerSchema = z.object({
  id,
  name: z.string().nullable(),
  file: z.string().min(1).nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema,
  /**
   * Marcação do canvas que contém o container (v13). Um `mapping.json` v13 gravado antes
   * deste campo (preview da ME0) não o tem e abre sem migração, como `null`.
   */
  parentId: id.nullable().default(null),
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
  background: hexColor.nullable(),
});

export const markingSchema = z.object({
  id,
  /** `null` = marcação do canvas (v13): `rect` em unidades do canvas. */
  containerId: id.nullable(),
  parentId: id.nullable(),
  name: z.string().nullable(),
  rect: rectSchema,
  needsReview: z.boolean(),
  locked: z.boolean(),
  /** Flutuante (v13). Ausente num v13 anterior a este campo: `false`. */
  floating: z.boolean().default(false),
  source: sourceSchema.nullable(),
});

export const entrySchema = z.object({ id, key: z.string(), value: z.string() });

/** Qualquer valor JSON. A conferência contra o tipo vira pendência (`issues.ts`), não erro. */
export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    finite,
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const annotationSchema = z
  .object({
    id,
    markingId: id,
    layerId: id,
    name: z.string().nullable(),
    parentAnnotationId: id.nullable(),
    type: z.object({ specId: id, typeId: id }).nullable(),
    values: z.record(z.string(), jsonValue).nullable(),
    entries: z.array(entrySchema),
  })
  .superRefine((a, ctx) => {
    // Livre: `type` e `values` nulos. Tipada: os dois preenchidos e sem pares.
    if ((a.type === null) !== (a.values === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'type e values devem ser ambos null ou ambos preenchidos',
      });
    }
    if (a.type !== null && a.entries.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'anotação tipada não tem entries',
      });
    }
  });

const specializationSchema = z.object({
  id,
  version: z.number().int().min(1),
  file: z.string().min(1),
});

/** Sobreposição local de uma plataforma (v11); chave desconhecida é descartada na leitura. */
export const platformRepoSchema = z.object({
  localPath: z.string().nullable(),
});

export const projectSchema: z.ZodType<ProjectFile> = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(0),
  // Aceita o valor antigo e normaliza: a próxima gravação já sai como `APP_ID`.
  app: z
    .union([z.literal(APP_ID), z.literal(LEGACY_APP_ID)])
    .transform((): typeof APP_ID => APP_ID),
  coordinateSystem: z.literal(COORDINATE_SYSTEM),
  project: z.object({
    name: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
  specializations: z.array(specializationSchema),
  platformRepos: z.record(z.string().regex(PLATFORM_ID_RE), platformRepoSchema),
  layers: z.array(layerSchema),
  containers: z.array(containerSchema),
  markings: z.array(markingSchema),
  annotations: z.array(annotationSchema),
});
