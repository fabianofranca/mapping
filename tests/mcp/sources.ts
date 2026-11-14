import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Server source code (`mcp/**/*.ts`, recursive) for the static guards: a new folder
// inside `mcp/` (such as `mcp/image/`) is picked up on its own.

export interface McpSource {
  /** Path relative to `mcp/`, with `/` (`paths.ts`, `image/codecs.ts`). */
  readonly file: string;
  /** Text of the file. */
  readonly text: string;
  /** The text without comments (blocks, whole lines and the end of line after ` // `). */
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
