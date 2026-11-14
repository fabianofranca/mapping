/** Command-line arguments of the server: `mapping-mcp.js --root <folder> [--root <folder>…]`. */

export interface CliOptions {
  /** Roots as given (relative to the working directory of the MCP client). */
  readonly roots: readonly string[];
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

export const USAGE = `Usage: node mapping-mcp.js --root <folder> [--root <folder>...]

Mapping MCP server (stdio). Reads and writes projects in folders inside the roots.

  --root <folder>  folder that contains projects (repeat for more than one)
  --no-http        do not start the local HTTP server (127.0.0.1) that delivers the tools' images by URL
  --version        show the version
  --help           show this help
`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const roots: string[] = [];
  let help = false;
  let version = false;
  let http = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--version' || arg === '-v') version = true;
    else if (arg === '--no-http') http = false;
    else if (arg === '--root') {
      const value = argv[++i];
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new UsageError('--root needs a folder');
      }
      roots.push(value);
    } else if (arg.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (value === '') throw new UsageError('--root needs a folder');
      roots.push(value);
    } else {
      throw new UsageError(`unknown argument: ${arg}`);
    }
  }
  if (!help && !version && roots.length === 0) {
    throw new UsageError('provide at least one root with --root <folder>');
  }
  return { roots, help, version, http };
}
