/** Command-line arguments of the server: `mapping-mcp.js --root <folder> [--root <folder>…] [--scratch <folder>…]`. */

export interface CliOptions {
  /** Roots as given (relative to the working directory of the MCP client). */
  readonly roots: readonly string[];
  /** Read-only scratch folders as given (the batch's `operationsFile` and images); optional. */
  readonly scratch: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
  /** Local HTTP image server (default: on; `--no-http` turns it off). */
  readonly http: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Usage: node mapping-mcp.js --root <folder> [--root <folder>...] [--scratch <folder>...]

Mapping MCP server (stdio). Reads and writes projects in folders inside the roots.

  --root <folder>  folder that contains projects (repeat for more than one)
  --scratch <folder>  read-only folder for the batch's temporary files (operationsFile and images); never scanned for projects (repeatable)
  --no-http        do not start the local HTTP server (127.0.0.1) that delivers the tools' images by URL
  --version        show the version
  --help           show this help
`;

/** The folder of `--<name> <folder>` or `--<name>=<folder>`; `null` if `arg` is another option. */
function folderOption(
  name: 'root' | 'scratch',
  arg: string,
  argv: readonly string[],
  index: number,
): { value: string; next: number } | null {
  let value: string | undefined;
  let next = index;
  if (arg === `--${name}`) {
    value = argv[++next];
    if (value !== undefined && value.startsWith('--')) value = undefined;
  } else if (arg.startsWith(`--${name}=`)) {
    value = arg.slice(`--${name}=`.length);
  } else {
    return null;
  }
  if (value === undefined || value === '') {
    throw new UsageError(`--${name} needs a folder`);
  }
  return { value, next };
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const roots: string[] = [];
  const scratch: string[] = [];
  let help = false;
  let version = false;
  let http = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--version' || arg === '-v') version = true;
    else if (arg === '--no-http') http = false;
    else {
      const root = folderOption('root', arg, argv, i);
      const folder = root ?? folderOption('scratch', arg, argv, i);
      if (folder === null) throw new UsageError(`unknown argument: ${arg}`);
      (root === null ? scratch : roots).push(folder.value);
      i = folder.next;
    }
  }
  if (!help && !version && roots.length === 0) {
    throw new UsageError('provide at least one root with --root <folder>');
  }
  return { roots, scratch, help, version, http };
}
