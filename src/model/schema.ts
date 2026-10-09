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

// Schema zod do mapping.json v8. Valida a forma; os invariantes entre coleções
// (referências, contenção, sobreposição) ficam em `invariants.ts`. Os valores das
// anotações tipadas (inclusive as entradas de `codeRef`) são JSON livre aqui: a
// conferência contra o tipo vira pendência (`issues.ts`).

const id = z.string().min(1);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const finite = z.number().finite();

export const rectSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
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

export const imageSchema = z.object({
  id,
  name: z.string().nullable(),
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema,
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
  source: sourceSchema.nullable(),
});

export const markingSchema = z.object({
  id,
  imageId: id,
  parentId: id.nullable(),
  name: z.string().nullable(),
  rect: rectSchema,
  needsReview: z.boolean(),
  locked: z.boolean(),
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
    inherit: z.boolean(),
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

/** Repositório de uma plataforma (v7). Texto vazio vale como `null` na leitura. */
export const platformRepoSchema = z.object({
  urlTemplate: z.string().nullable(),
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
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  specializations: z.array(specializationSchema),
  platformRepos: z.record(z.string().regex(PLATFORM_ID_RE), platformRepoSchema),
  layers: z.array(layerSchema),
  images: z.array(imageSchema),
  markings: z.array(markingSchema),
  annotations: z.array(annotationSchema),
});
