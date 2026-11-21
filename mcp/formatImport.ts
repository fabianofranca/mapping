import type { FormatOperation } from '../src/model';
import { ToolError } from './errors';
import { operationSchema, type Operation } from './operations';

// The `import_format` operation's pieces that do not need the batch (stage #1923, FP4, decision
// 19): the text of the file (inline or read inside the roots) and the check of what a plugin
// returned against the MCP operations, so the batch only applies operations that are well formed.

/** What the operation needs to read a file inside the roots (the batch's `BatchIo`). */
export interface TextIo {
  readSource(
    path: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly name: string }>;
}

export interface ImportTextArgs {
  readonly text?: string | undefined;
  readonly file?: string | undefined;
}

/**
 * The text to parse: `text` or the file at `file` (inside the roots, with the format's extension).
 * The extension is checked before anything is read, and a path outside the roots is `invalid-path`.
 */
export async function importText(
  args: ImportTextArgs,
  extension: string,
  io: TextIo,
): Promise<string> {
  if ((args.text === undefined) === (args.file === undefined)) {
    throw new ToolError(
      'invalid-arguments',
      'provide `text` (the file content inline) or `file` (a file inside the roots), one of the two',
    );
  }
  if (args.text !== undefined) return args.text;
  const file = args.file!;
  if (!file.toLowerCase().endsWith(`.${extension}`)) {
    throw new ToolError(
      'invalid-path',
      `\`file\` must be a .${extension} file (the extension of the format): ${file}`,
      { path: file, extension },
    );
  }
  try {
    return new TextDecoder().decode((await io.readSource(file)).bytes);
  } catch (error) {
    if (error instanceof ToolError && error.code === 'outside-roots') {
      throw new ToolError('invalid-path', error.message, error.details);
    }
    throw error;
  }
}

/** `operations[3].rect.x` from the path of a zod issue. */
function pathOf(index: number, issuePath: readonly PropertyKey[]): string {
  return issuePath.reduce<string>(
    (path, key) =>
      typeof key === 'number' ? `${path}[${key}]` : `${path}.${String(key)}`,
    `operations[${index}]`,
  );
}

/**
 * The plugin's operations as the batch's own `Operation`s. `checkFormatResult` already checked the
 * names, the keys and the references; this checks each value against the operation's schema, so
 * a wrong type is `plugin-output-invalid` at its path and never reaches the model.
 */
export function pluginOperations(operations: readonly FormatOperation[]): Operation[] {
  return operations.map((raw, index) => {
    const parsed = operationSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0]!;
    const path = pathOf(index, issue.path);
    throw new ToolError('plugin-output-invalid', `${path}: ${issue.message}`, { path });
  });
}
