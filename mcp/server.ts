import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SCHEMA_VERSION } from '../src/model';
import { SERVER_NAME, SERVER_VERSION } from './version';

export interface ServerConfig {
  /** Raízes já resolvidas (caminhos absolutos). */
  readonly roots: readonly string[];
}

/** Resposta de `list_projects`. Por enquanto o servidor só informa as raízes: a descoberta de projetos é a fase 3a.3. */
export interface ListProjectsResult {
  readonly roots: readonly string[];
  readonly projects: readonly never[];
  readonly schemaVersion: number;
}

export function listProjects(config: ServerConfig): ListProjectsResult {
  return { roots: config.roots, projects: [], schemaVersion: SCHEMA_VERSION };
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  server.registerTool(
    'list_projects',
    {
      description:
        'Lista os projetos Mapping (pastas com mapping.json) encontrados nas raízes configuradas.',
    },
    () => {
      const result = listProjects(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );
  return server;
}
