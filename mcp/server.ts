import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOC_RESOURCES } from './docs';
import { Roots } from './paths';
import { registerTools } from './tools';
import { SERVER_NAME, SERVER_VERSION } from './version';

export interface ServerConfig {
  /** Raízes já resolvidas (caminhos absolutos). */
  readonly roots: readonly string[];
}

const INSTRUCTIONS = `Servidor do Mapping: lê projetos de mapeamento de imagens (marcações retangulares, camadas e anotações) guardados em pasta.
Comece por list_projects. Itens são citados por referências mapping://<projeto>/<m|i|a>/<código>; passe-as a get_marking, get_annotation, get_image e resolve. Para ver uma marcação, use get_marking_image (recorte, ou a imagem inteira com a marcação contornada) e get_image_file.
Coordenadas das marcações são sempre em pixels da imagem original. Leia o recurso mapping-docs://AGENT-GUIDE.md para o fluxo típico.`;

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, new Roots(config.roots));
  for (const doc of DOC_RESOURCES) {
    server.registerResource(
      doc.name,
      doc.uri,
      { title: doc.title, description: doc.description, mimeType: 'text/markdown' },
      (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.text }],
      }),
    );
  }
  return server;
}
