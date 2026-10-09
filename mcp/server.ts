import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOC_RESOURCES } from './docs';
import { Roots } from './paths';
import { registerTools } from './tools';
import { SERVER_NAME, SERVER_VERSION } from './version';

export interface ServerConfig {
  /** Raízes já resolvidas (caminhos absolutos). */
  readonly roots: readonly string[];
  /** Diretório de trabalho do cliente (padrão: o do processo). Limita a conferência de arquivos de código. */
  readonly workDir?: string;
}

const INSTRUCTIONS = `Servidor do Mapping: lê e altera projetos de mapeamento de imagens (marcações retangulares, camadas e anotações) guardados em pasta.
Comece por list_projects. Itens são citados por referências mapping://<projeto>/<m|i|a>/<código>; passe-as a get_marking, get_annotation, get_image e resolve. Para ver uma marcação, use get_marking_image (recorte, ou a imagem inteira com a marcação contornada) e get_image_file.
Para implementar uma marcação no código, use get_code_hints(ref, plataforma); para achar a marcação de um arquivo ou símbolo, find_by_code. O servidor nunca lê nem grava arquivos de código: só confere se existem.
Você nunca grava o projeto: para alterar, valide o lote com plan_changes (prévia, nada é gravado) e envie com propose_changes, que grava uma PROPOSTA (mapping://<projeto>/p/<código>) para o usuário revisar na app. Avise-o, espere a revisão terminar (get_proposal), leia get_proposal_review e corrija enviando outra proposta com supersedes. Em reexportações, use source nas imagens e marcações e find_by_source / find_types_by_source. validate_specialization valida um arquivo de especialização.
Coordenadas das marcações são sempre em pixels da imagem original. Leia o recurso mapping-docs://AGENT-GUIDE.md para o fluxo típico.`;

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, new Roots(config.roots, config.workDir));
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
