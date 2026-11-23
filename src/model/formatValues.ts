import { z } from 'zod';
import { ANCHOR_ALIGNS, ANCHOR_SIDES } from './anchorSides';
import type { FormatOperation, FormatResultOperationName } from './formatPlugin';
import { READING_DIRECTIONS } from './types';

// The types of the values of a plugin result's operations (stage #2035, AF4, decision 8): the six
// operations of `FORMAT_OPERATION_KEYS` with the types and ranges the MCP batch's operation schema
// gives them (`mcp/operations.ts`), written once for the app, which has no schema of its own to read
// the result with. `checkFormatResult` checks names, keys, aliases and references; this checks what is
// inside each value, so a text where a number goes (or a flag that is not a boolean) is refused at its
// path before any rule reads it. A value that is allowed is never narrower than the MCP's: a result the
// MCP accepts is accepted here. Pure: no DOM.

const text = z.string();
const int = z.number().int();
const rect = z.object({ x: int, y: int, width: int, height: int });
const name = text.nullable();
const dimension = int.min(1).max(20000);

const source = z
  .object({ system: text, id: text, url: text.nullable().optional() })
  .nullable();

const anchor = z.object({
  to: text,
  side: z.enum(ANCHOR_SIDES).optional(),
  align: z.enum(ANCHOR_ALIGNS).optional(),
  offset: z.object({ main: z.number().finite(), cross: z.number().finite() }).optional(),
});

const entries = z.array(z.object({ key: text, value: text, id: text.optional() }));
const values = z.record(text, z.json());

const addContainer = z.object({
  as: text.optional(),
  name: text.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  background: text.optional(),
  source: source.optional(),
  // A map axis → entry (schema v24); a text is the entry of the `mode` axis (the way it was written before).
  drawingMode: z
    .union([text, z.record(text, text)])
    .transform((mode) => (typeof mode === 'string' ? { mode } : mode))
    .nullable()
    .optional(),
  direction: z.enum(READING_DIRECTIONS).nullable().optional(),
  density: z.number().nullable().optional(),
  center: z.object({ x: z.number(), y: z.number() }).optional(),
  beside: text.optional(),
  page: text.optional(),
});

const createMarking = z.object({
  as: text.optional(),
  annotationAs: text.optional(),
  container: text.optional(),
  near: text.optional(),
  inside: text.optional(),
  slot: text.optional(),
  page: text.optional(),
  rect: rect.optional(),
  name: name.optional(),
  source: source.optional(),
  anchor: anchor.optional(),
  annotation: z
    .object({
      type: text,
      layer: text.optional(),
      name: name.optional(),
      values: values.optional(),
    })
    .optional(),
});

const updateMarking = z.object({
  marking: text,
  name: name.optional(),
  source: source.optional(),
  anchor: anchor.nullable().optional(),
  rect: rect.optional(),
  container: text.nullable().optional(),
  floating: z.boolean().optional(),
  move: z.object({ dx: int, dy: int }).optional(),
  locked: z.boolean().optional(),
  confirmReview: z.boolean().optional(),
});

const createAnnotation = z.object({
  as: text.optional(),
  marking: text,
  type: text.optional(),
  layer: text.optional(),
  name: name.optional(),
  entries: entries.optional(),
  values: values.optional(),
  owner: text.nullable().optional(),
  role: text.nullable().optional(),
});

const updateAnnotation = z.object({
  annotation: text,
  name: name.optional(),
  entries: entries.optional(),
  values: values.optional(),
  owner: text.nullable().optional(),
  role: text.nullable().optional(),
});

const createArrow = z.object({
  as: text.optional(),
  from: text,
  to: text,
  style: z.enum(['straight', 'curve', 'elbow']).optional(),
  name: name.optional(),
});

const SCHEMAS: Readonly<Record<FormatResultOperationName, z.ZodType>> = {
  add_container: addContainer,
  create_marking: createMarking,
  update_marking: updateMarking,
  create_annotation: createAnnotation,
  update_annotation: updateAnnotation,
  create_arrow: createArrow,
};

/** Where a problem is and what it says: `path` inside the result (`operations[3].rect.x`). */
export interface FormatValueProblem {
  readonly path: string;
  readonly message: string;
}

/** `operations[3].rect.x` from the path of a schema issue. */
function pathOf(index: number, issuePath: readonly PropertyKey[]): string {
  return issuePath.reduce<string>(
    (path, key) =>
      typeof key === 'number' ? `${path}[${key}]` : `${path}.${String(key)}`,
    `operations[${index}]`,
  );
}

/**
 * The first value of operation `operation` (at `index` in the result) whose type or range is wrong, or
 * `null` when every value is of the right type. The names and the keys are `checkFormatResult`'s: an
 * operation of another name is not looked at here.
 */
export function checkFormatValueTypes(
  operation: FormatOperation,
  index: number,
): FormatValueProblem | null {
  const schema = SCHEMAS[operation.op];
  if (schema === undefined) return null;
  const parsed = schema.safeParse(operation);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0]!;
  const path = pathOf(index, issue.path);
  return { path, message: `${path}: ${issue.message}` };
}
