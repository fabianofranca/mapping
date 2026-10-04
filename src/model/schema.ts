import { z } from 'zod';
import {
  APP_ID,
  COORDINATE_SYSTEM,
  SCHEMA_VERSION,
  type JsonValue,
  type ProjectFile,
} from './types';

// Schema zod do mapping.json v5. Valida a forma; os invariantes entre coleções
// (referências, contenção, sobreposição) ficam em `invariants.ts`.

const id = z.string().min(1);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const finite = z.number().finite();

const rectSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const placementSchema = z.object({
  x: finite,
  y: finite,
  scale: finite.positive(),
});

const layerSchema = z.object({
  id,
  name: z.string().trim().min(1),
  color: hexColor,
  spec: z.object({ specId: id, layerId: id }).nullable(),
});

const imageSchema = z.object({
  id,
  name: z.string().nullable(),
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema,
  markingColor: hexColor.nullable(),
  locked: z.boolean(),
});

const markingSchema = z.object({
  id,
  imageId: id,
  parentId: id.nullable(),
  name: z.string().nullable(),
  rect: rectSchema,
  needsReview: z.boolean(),
  locked: z.boolean(),
});

const entrySchema = z.object({ id, key: z.string(), value: z.string() });

/** Qualquer valor JSON. A conferência contra o tipo vira pendência (`issues.ts`), não erro. */
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    finite,
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const annotationSchema = z
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

export const projectSchema: z.ZodType<ProjectFile> = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  app: z.literal(APP_ID),
  coordinateSystem: z.literal(COORDINATE_SYSTEM),
  project: z.object({
    name: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  specializations: z.array(specializationSchema),
  layers: z.array(layerSchema),
  images: z.array(imageSchema),
  markings: z.array(markingSchema),
  annotations: z.array(annotationSchema),
});
