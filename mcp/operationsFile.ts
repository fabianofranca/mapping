import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { ToolError } from './errors';
import { operationSchema, type Operation } from './operations';
import type { Roots } from './paths';

// `operationsFile` (Faithful components stage, CF10, decision 28): the batch of `plan_changes`,
// `propose_changes` and `revise_proposal` can come from a `.json` inside the roots or the scratch
// folders (`--scratch`, read-only), in place of inline `operations` (a measured screen has
// hundreds of operations, too large for the tool call).

/**
 * Size limit of the operations file. The inline batch has at most 1,000 operations (the size of a
 * tool call); a file takes up to `MAX_FILE_OPERATIONS` in the read-only tools and
 * `MAX_WRITE_OPERATIONS` in the ones that write (the 32 MB limit does not change).
 */
const MAX_OPERATIONS_BYTES = 32 * 1024 * 1024;

/** Most operations in a batch read from `operationsFile` (`plan_changes`, `render_container`, `render_marking`). */
export const MAX_FILE_OPERATIONS = 5000;
/** Most operations `propose_changes` and `revise_proposal` take, from a file too. */
export const MAX_WRITE_OPERATIONS = 1000;

export const operationsListSchema = z
  .array(operationSchema)
  .min(1)
  .max(MAX_FILE_OPERATIONS);

export interface OperationsArgs {
  readonly operations?: readonly Operation[];
  readonly operationsFile?: string;
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** The message of a file over its tool's limit: the count and the limits of both kinds of tool. */
function tooMany(file: string, count: number, max: number): string {
  const limits =
    max < MAX_FILE_OPERATIONS
      ? `propose_changes and revise_proposal take at most ${fmt(MAX_WRITE_OPERATIONS)} ` +
        `(plan_changes, render_container and render_marking take up to ${fmt(MAX_FILE_OPERATIONS)} from a file)`
      : `an operationsFile takes at most ${fmt(MAX_FILE_OPERATIONS)}`;
  return `operationsFile ${basename(file)}: ${fmt(count)} operations; ${limits}: split the batch`;
}

function parseOperations(text: string, file: string, maxOperations: number): Operation[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ToolError(
      'invalid-arguments',
      `operationsFile ${basename(file)}: invalid JSON (${detail})`,
      { path: file },
    );
  }
  if (Array.isArray(data) && data.length > maxOperations) {
    throw new ToolError('invalid-arguments', tooMany(file, data.length, maxOperations), {
      path: file,
    });
  }
  const parsed = operationsListSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new ToolError(
    'invalid-arguments',
    `operationsFile ${basename(file)}: invalid batch; ${issues.join('; ')}`,
    { path: file },
  );
}

/** The operations of the batch: the inline ones or the file's (both together, or neither, is an error). */
export async function resolveOperations(
  roots: Roots,
  args: OperationsArgs,
  maxOperations: number = MAX_FILE_OPERATIONS,
): Promise<readonly Operation[]> {
  const { operations, operationsFile } = args;
  if (operations !== undefined && operationsFile !== undefined) {
    throw new ToolError(
      'invalid-arguments',
      'provide `operations` or `operationsFile`, not both',
    );
  }
  if (operationsFile === undefined) {
    if (operations === undefined) {
      throw new ToolError(
        'invalid-arguments',
        'provide `operations` (the inline batch) or `operationsFile` (a .json inside the roots or the scratch folder)',
      );
    }
    return operations;
  }
  const { real } = await roots.resolveInputFile(operationsFile);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `not a file: ${operationsFile}`, {
      path: operationsFile,
    });
  }
  if (info.size > MAX_OPERATIONS_BYTES) {
    throw new ToolError('file-too-large', `file too large: ${operationsFile}`, {
      path: operationsFile,
    });
  }
  return parseOperations(await readFile(real, 'utf8'), real, maxOperations);
}

/**
 * Like `resolveOperations`, but the batch may be absent (`revise_proposal`: `drop` alone is
 * valid): with neither argument it returns `undefined`; both together is still an error.
 */
export async function resolveOptionalOperations(
  roots: Roots,
  args: OperationsArgs,
  maxOperations: number = MAX_FILE_OPERATIONS,
): Promise<readonly Operation[] | undefined> {
  // An empty inline list counts as absent (some clients send `[]` for "unset").
  const operations = args.operations?.length === 0 ? undefined : args.operations;
  if (operations === undefined && args.operationsFile === undefined) return undefined;
  return resolveOperations(roots, { ...args, operations }, maxOperations);
}
