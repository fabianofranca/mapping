/** Argumentos da linha de comando do servidor: `mapping-mcp.js --root <pasta> [--root <pasta>…]`. */

export interface CliOptions {
  /** Raízes como informadas (relativas ao diretório de trabalho do cliente MCP). */
  readonly roots: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Uso: node mapping-mcp.js --root <pasta> [--root <pasta>...]

Servidor MCP do Mapping (stdio). Lê e grava projetos em pasta dentro das raízes.

  --root <pasta>  pasta que contém projetos (repita para mais de uma)
  --version       mostra a versão
  --help          mostra esta ajuda
`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const roots: string[] = [];
  let help = false;
  let version = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--version' || arg === '-v') version = true;
    else if (arg === '--root') {
      const value = argv[++i];
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new UsageError('--root precisa de uma pasta');
      }
      roots.push(value);
    } else if (arg.startsWith('--root=')) {
      const value = arg.slice('--root='.length);
      if (value === '') throw new UsageError('--root precisa de uma pasta');
      roots.push(value);
    } else {
      throw new UsageError(`argumento desconhecido: ${arg}`);
    }
  }
  if (!help && !version && roots.length === 0) {
    throw new UsageError('informe ao menos uma raiz com --root <pasta>');
  }
  return { roots, help, version };
}
