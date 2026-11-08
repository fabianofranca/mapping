import { importMeasured, type MeasuredImport } from '../src/model/components/measured';
import type { Project } from '../src/model';
import { ToolError } from './errors';
import type { Operation } from './operations';

// `import_measured` (etapa Componentes fiéis, CF11, decisão 29): lê a árvore medida (inline ou de
// um `.json` dentro das raízes) e a traduz em marcações pelas `sources` dos tipos da origem
// `measured`. A criação de cada marcação é do lote (`create_marking`); aqui só se prepara a lista.

type ImportOp = Extract<Operation, { op: 'import_measured' }>;

interface TreeIo {
  readSource(
    path: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly name: string }>;
}

/** A árvore da operação: `tree` inline ou o `.json` de `file` (dentro das raízes). */
export async function measuredTree(op: ImportOp, io: TreeIo): Promise<unknown> {
  if ((op.tree === undefined) === (op.file === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'informe `tree` (a árvore inline) ou `file` (um .json dentro das raízes), um dos dois',
    );
  }
  if (op.tree !== undefined) return op.tree;
  const file = op.file!;
  if (!file.toLowerCase().endsWith('.json')) {
    throw new ToolError('invalid-arguments', `\`file\` deve ser um .json: ${file}`);
  }
  const { bytes } = await io.readSource(file);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new ToolError(
      'invalid-arguments',
      `${file}: JSON inválido (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** A árvore → as marcações a criar; falha de origem ou de árvore vira `invalid-arguments`. */
export function planMeasured(
  project: Project,
  op: ImportOp,
  tree: unknown,
): MeasuredImport {
  const specs = project.specializations.flatMap((s) => (s.spec ? [s.spec] : []));
  const result = importMeasured(specs, {
    system: op.system,
    tree,
    ...(op.offset ? { offset: op.offset } : {}),
    ...(op.scale !== undefined ? { scale: op.scale } : {}),
  });
  if (result.error !== undefined) throw new ToolError('invalid-arguments', result.error);
  return result;
}
