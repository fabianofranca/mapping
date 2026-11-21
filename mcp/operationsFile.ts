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

/** Size limit of the operations file (the inline batch has at most 1000 operations). */
const MAX_OPERATIONS_BYTES = 32 * 1024 * 1024;

export const operationsListSchema = z.array(operationSchema).min(1).max(1000);

export interface OperationsArgs {
  readonly operations?: readonly Operation[];
  readonly operationsFile?: string;
}

function parseOperations(text: string, file: string): Operation[] {
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
  return parseOperations(await readFile(real, 'utf8'), real);
}

/**
 * Like `resolveOperations`, but the batch may be absent (`revise_proposal`: `drop` alone is
 * valid): with neither argument it returns `undefined`; both together is still an error.
 */
export async function resolveOptionalOperations(
  roots: Roots,
  args: OperationsArgs,
): Promise<readonly Operation[] | undefined> {
  // An empty inline list counts as absent (some clients send `[]` for "unset").
  const operations = args.operations?.length === 0 ? undefined : args.operations;
  if (operations === undefined && args.operationsFile === undefined) return undefined;
  return resolveOperations(roots, { ...args, operations });
}
