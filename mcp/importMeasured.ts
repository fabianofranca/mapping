import { importMeasured, type MeasuredImport } from '../src/model/components/measured';
import type { Project } from '../src/model';
import { ToolError } from './errors';
import type { Operation } from './operations';

// `import_measured` (Faithful components stage, CF11, decision 29): reads the measured tree (inline or from
// a `.json` inside the roots) and translates it into markings through the `sources` of the types of the `measured`
// origin. Creating each marking is the batch's job (`create_marking`); here only the list is prepared.

type ImportOp = Extract<Operation, { op: 'import_measured' }>;

interface TreeIo {
  readSource(
    path: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly name: string }>;
}

/** The operation's tree: inline `tree` or the `.json` of `file` (inside the roots). */
export async function measuredTree(op: ImportOp, io: TreeIo): Promise<unknown> {
  if ((op.tree === undefined) === (op.file === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'provide `tree` (the inline tree) or `file` (a .json inside the roots), one of the two',
    );
  }
  if (op.tree !== undefined) return op.tree;
  const file = op.file!;
  if (!file.toLowerCase().endsWith('.json')) {
    throw new ToolError('invalid-arguments', `\`file\` must be a .json: ${file}`);
  }
  const { bytes } = await io.readSource(file);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new ToolError(
      'invalid-arguments',
      `${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** The tree → the markings to create; a failure of the origin or of the tree becomes `invalid-arguments`. */
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
