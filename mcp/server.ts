import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DOC_RESOURCES } from './docs';
import type { ImageServer } from './imageServer';
import { Roots } from './paths';
import { registerTools } from './tools';
import { BUILD_VERSION, SERVER_NAME } from './version';

export interface ServerConfig {
  /** Roots already resolved (absolute paths). */
  readonly roots: readonly string[];
  /** Working directory of the client (default: the process's). Limits the check of code files. */
  readonly workDir?: string;
  /** Local HTTP server for images (`null`/absent: off). */
  readonly images?: ImageServer | null;
}

const INSTRUCTIONS = `Mapping server: reads and changes mapping projects over containers (each with an image or just a background color; rectangular markings, layers and annotations) stored in a folder.
Start with list_projects. Items are cited by references mapping://<project>/<m|i|a|l|c>/<code>; pass them to get_marking, get_annotation, get_container and resolve (the letter "i" is the container, "l" the layer, "c" the conversation; an annotation's field, pair and row are a/<code>/f/<field>, /e/<code> and /r/<code>). To see a marking, use get_marking_image (a crop, or the whole container with the marking outlined) and get_container_file.
To write the solution from a marking, use get_code_hints(ref, platform): it gives the calls to write, with the instantiation code of each type (symbol: what you call; definition: the file that defines it, to read the signature) and the arguments of each annotation; each library's repository is in the specialization (platforms[].repo) and the local clone is in the project. To find the types (and the markings) that are instantiated with a file or symbol, use find_by_code. The server never reads or writes code files: it only checks that they exist.
You never write the project: to change it, validate the batch with plan_changes (preview, nothing is written) and send it with propose_changes, which writes a PROPOSAL (mapping://<project>/p/<code>) for the user to review in the app. Notify them, wait for the review to finish (get_proposal), read get_proposal_review and fix it in the same proposal with revise_proposal (while nothing has been applied) or, afterwards, by sending another proposal with supersedes. On re-exports, use source on containers and markings and find_by_source / find_types_by_source. validate_specialization validates a specialization file.
Conversations: people comment on items in the app, and list_threads (with no filter, the open ones waiting for you) and get_thread show them. When facing an ambiguity that the specialization does not settle, open a conversation with open_thread on the item and carry on with the rest; reply with post_message, always with after = the id of the last message read (stale-thread: a new message came in, nothing was written). Link a proposal to the conversation with the thread argument of propose_changes; to wait for a new question, repeat wait_for_comment (at most 50 s per call). You never resolve, reopen or delete a conversation and never sign as a person.
Marking coordinates are always in pixels of the container (the original image, when it has a file). Read the resource mapping-docs://AGENT-GUIDE.md for the typical flow.`;

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
