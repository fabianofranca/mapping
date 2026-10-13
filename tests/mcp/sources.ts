import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Código-fonte do servidor (`mcp/**/*.ts`, recursivo) para as guardas estáticas: uma pasta nova
// dentro de `mcp/` (como `mcp/image/`) entra sozinha.

export interface McpSource {
  /** Caminho relativo a `mcp/`, com `/` (`paths.ts`, `image/codecs.ts`). */
  readonly file: string;
  /** Texto do arquivo. */
  readonly text: string;
  /** O texto sem comentários (blocos, linhas inteiras e o fim de linha depois de ` // `). */
  readonly code: string;
}

export const MCP_DIR = join(process.cwd(), 'mcp');

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/\s+\/\/\s.*$/, ''))
    .join('\n');
}

export function mcpSources(): McpSource[] {
  return readdirSync(MCP_DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(MCP_DIR, file), 'utf8');
      return { file, text, code: stripComments(text) };
    });
}
