import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { ToolError } from './errors';
import { operationSchema, type Operation } from './operations';
import type { Roots } from './paths';

// `operationsFile` (etapa Componentes fiéis, CF10, decisão 28): o lote de `plan_changes` e
// `propose_changes` pode vir de um `.json` dentro das raízes, no lugar de `operations` inline
// (uma tela medida tem centenas de operações, grandes demais para a chamada da ferramenta).

/** Limite do arquivo de operações (o inline tem no máximo 1000 operações). */
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
      `operationsFile ${basename(file)}: JSON inválido (${detail})`,
      { path: file },
    );
  }
  const parsed = operationsListSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
  throw new ToolError(
    'invalid-arguments',
    `operationsFile ${basename(file)}: lote inválido; ${issues.join('; ')}`,
    { path: file },
  );
}

/** As operações do lote: as inline ou as do arquivo (os dois juntos, ou nenhum, é erro). */
export async function resolveOperations(
  roots: Roots,
  args: OperationsArgs,
): Promise<readonly Operation[]> {
  const { operations, operationsFile } = args;
  if (operations !== undefined && operationsFile !== undefined) {
    throw new ToolError(
      'invalid-arguments',
      'informe `operations` ou `operationsFile`, não os dois',
    );
  }
  if (operationsFile === undefined) {
    if (operations === undefined) {
      throw new ToolError(
        'invalid-arguments',
        'informe `operations` (o lote inline) ou `operationsFile` (um .json dentro das raízes)',
      );
    }
    return operations;
  }
  const { real } = await roots.resolveExisting(operationsFile);
  const info = await stat(real);
  if (!info.isFile()) {
    throw new ToolError('not-a-file', `não é um arquivo: ${operationsFile}`, {
      path: operationsFile,
    });
  }
  if (info.size > MAX_OPERATIONS_BYTES) {
    throw new ToolError('file-too-large', `arquivo grande demais: ${operationsFile}`, {
      path: operationsFile,
    });
  }
  return parseOperations(await readFile(real, 'utf8'), real);
}
