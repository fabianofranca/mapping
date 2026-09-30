import { z } from 'zod';
import { APP_ID, COORDINATE_SYSTEM, SCHEMA_VERSION, type Project } from './types';

// Schema zod do mapping.json v1. Valida a forma; os invariantes entre coleções
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

const layerSchema = z.object({ id, name: z.string().trim().min(1), color: hexColor });

const imageSchema = z.object({
  id,
  file: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema,
});

const markingSchema = z.object({
  id,
  imageId: id,
  parentId: id.nullable(),
  name: z.string().nullable(),
  rect: rectSchema,
  needsReview: z.boolean(),
});

const entrySchema = z.object({ key: z.string(), value: z.string() });

const annotationSchema = z.object({
  id,
  markingId: id,
  layerId: id,
  name: z.string().nullable(),
  entries: z.array(entrySchema),
});

export const projectSchema: z.ZodType<Project> = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  app: z.literal(APP_ID),
  coordinateSystem: z.literal(COORDINATE_SYSTEM),
  project: z.object({
    name: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  layers: z.array(layerSchema),
  images: z.array(imageSchema),
  markings: z.array(markingSchema),
  annotations: z.array(annotationSchema),
});
