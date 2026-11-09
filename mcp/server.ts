import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOC_RESOURCES } from './docs';
import type { ImageServer } from './imageServer';
import { Roots } from './paths';
import { registerTools } from './tools';
import { BUILD_VERSION, SERVER_NAME } from './version';

export interface ServerConfig {
  /** Raízes já resolvidas (caminhos absolutos). */
  readonly roots: readonly string[];
  /** Diretório de trabalho do cliente (padrão: o do processo). Limita a conferência de arquivos de código. */
  readonly workDir?: string;
  /** Servidor HTTP local das imagens (`null`/ausente: desligado). */
  readonly images?: ImageServer | null;
}

const INSTRUCTIONS = `Servidor do Mapping: lê e altera projetos de mapeamento sobre containers (cada um com uma imagem ou só uma cor de fundo; marcações retangulares, camadas e anotações) guardados em pasta.
Comece por list_projects. Itens são citados por referências mapping://<projeto>/<m|i|a|l|c>/<código>; passe-as a get_marking, get_annotation, get_container e resolve (a letra "i" é o container, "l" a camada, "c" a conversa; campo, par e linha de uma anotação são a/<código>/f/<campo>, /e/<código> e /r/<código>). Para ver uma marcação, use get_marking_image (recorte, ou o container inteiro com a marcação contornada) e get_container_file.
Para escrever a solução a partir de uma marcação, use get_code_hints(ref, plataforma): dá as chamadas a escrever, com o código de instanciação de cada tipo (symbol: o que se chama; definition: o arquivo que o define, para ler a assinatura) e os argumentos de cada anotação; o repositório de cada biblioteca está na especialização (platforms[].repo) e o clone local, no projeto. Para achar os tipos (e as marcações) que se instanciam com um arquivo ou símbolo, find_by_code. O servidor nunca lê nem grava arquivos de código: só confere se existem.
Você nunca grava o projeto: para alterar, valide o lote com plan_changes (prévia, nada é gravado) e envie com propose_changes, que grava uma PROPOSTA (mapping://<projeto>/p/<código>) para o usuário revisar na app. Avise-o, espere a revisão terminar (get_proposal), leia get_proposal_review e corrija na mesma proposta com revise_proposal (enquanto nada foi aplicado) ou, depois, enviando outra proposta com supersedes. Em reexportações, use source nos containers e marcações e find_by_source / find_types_by_source. validate_specialization valida um arquivo de especialização.
Conversas: as pessoas comentam itens na app, e list_threads (sem nenhum filtro, as abertas que aguardam você) e get_thread as mostram. Diante de uma ambiguidade que a especialização não decide, abra uma conversa com open_thread no item e siga com o resto; responda com post_message, sempre com after = o id da última mensagem lida (stale-thread: entrou mensagem nova, nada foi gravado). Ligue uma proposta à conversa com o argumento thread de propose_changes; para esperar uma pergunta nova, repita wait_for_comment (no máximo 50 s por chamada). Você nunca resolve, reabre nem apaga uma conversa e nunca assina como pessoa.
Coordenadas das marcações são sempre em pixels do container (a imagem original, quando ele tem arquivo). Leia o recurso mapping-docs://AGENT-GUIDE.md para o fluxo típico.`;

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: BUILD_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, new Roots(config.roots, config.workDir), config.images ?? null);
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
