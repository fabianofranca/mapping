import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Threads } from './threads';
import { WAIT_DEFAULT_SECONDS, WAIT_MAX_SECONDS } from './threads';

// As tools de conversa (etapa Comentários, CM6). O servidor lê a caixa de entrada, abre
// conversas e responde com a guarda `after`; nunca resolve, reabre nem apaga.

type Json = Record<string, unknown>;

export interface ThreadToolDeps {
  readonly threads: Threads;
  readonly respond: (produce: () => Promise<Json>) => Promise<CallToolResult>;
  readonly projectArg: z.ZodString;
  readonly optionalProjectArg: z.ZodOptional<z.ZodString>;
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITES = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const threadRefArg = z
  .string()
  .describe(
    'Referência da conversa (`mapping://projeto/c/3f2a9c1e`, a que list_threads e open_thread devolvem), `c/3f2a9c1e` (com `project`) ou o id completo.',
  );

const anchorArg = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe(
    'Onde a conversa fica: qualquer referência do projeto (marcação ou seta `…/m/…`, container `…/i/…`, anotação `…/a/…`, camada `…/l/…`, campo `…/a/<código>/f/<campo>`, par `…/a/<código>/e/<código>`, linha `…/a/<código>/f/<campo>/r/<código>`) ou um ponto solto `{ point: { container, x, y } }` (`container` é a referência de um container, com x e y em pixels dele, ou null para o canvas).',
  );

const authorArg = z
  .string()
  .optional()
  .describe(
    'Nome com que a mensagem aparece (padrão: o nome do cliente MCP, ou "agente"). A autoria é sempre de agente: não existe assinar como pessoa.',
  );

export function registerThreadTools(server: McpServer, deps: ThreadToolDeps): void {
  const { threads, respond, projectArg, optionalProjectArg } = deps;

  server.registerTool(
    'list_threads',
    {
      description:
        'A caixa de entrada de conversas do projeto. Sem nenhum filtro, traz as conversas ABERTAS que aguardam você (a última mensagem é de pessoa); com `text` ou `anchor` (ou só `status`/`awaiting`), o que você não informar é `status: open` e `awaiting: any`. `status`: `open`, `resolved` ou `all`; `awaiting`: `agent` (a última mensagem é de pessoa), `human` (é de agente) ou `any`; `anchor`: só as ancoradas num item, camada, campo, par, linha ou ponto (e nas partes dele); `text`: busca no texto das mensagens, sem diferença de caixa nem de acento. Cada linha traz `ref` (`mapping://projeto/c/código`), `anchor` (a referência, ou `{ point }`), `path`, `orphan` (o item da âncora foi apagado), `status`, `awaiting`, `messages`, `subject` e `last` (a última mensagem, com as `cites` resolvidas). Paginação por `limit` (padrão 50, máximo 200) e `offset`; `total` é o número que casa. `broken` lista arquivos de conversa ilegíveis. Para ler a conversa inteira use get_thread.',
      inputSchema: {
        project: projectArg,
        status: z.enum(['open', 'resolved', 'all']).optional(),
        awaiting: z.enum(['agent', 'human', 'any']).optional(),
        anchor: anchorArg.optional(),
        text: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ_ONLY,
    },
    (args) => respond(() => threads.list(args)),
  );

  server.registerTool(
    'get_thread',
    {
      description:
        'Uma conversa inteira: o estado (`status`, `awaiting`, quem resolveu), a âncora resolvida (`ref`, `kind`, `path`, `name` e, em campo ou par, o `value` de agora; `orphan` se o item foi apagado), as mensagens em ordem (autor, hora, texto em markdown, a proposta ligada e as `cites`: cada link `mapping://` do texto resolvido com `kind`, `ref`, `path`, `label`, `value` e `broken`), `citedIn` (as conversas que citam esta) e `proposals` (as propostas ligadas, com estado e progresso). Responda com post_message usando o `id` da ÚLTIMA mensagem como `after`.',
      inputSchema: { ref: threadRefArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) => respond(() => threads.get(ref, project)),
  );

  server.registerTool(
    'open_thread',
    {
      description:
        'Abre uma conversa ancorada num item do projeto, com a sua primeira mensagem (markdown, até 10.000 caracteres), e devolve a `ref` dela. Use diante de uma ambiguidade que a especialização não decide, em vez de adivinhar ou largar a tarefa; siga com o resto do trabalho: a pessoa responde na app, no item. Cite itens, campos e outras conversas no texto como links markdown `[nome](mapping://projeto/…)`; citação que não resolve é gravada assim mesmo, com o aviso `broken-cite`. Grava só `comments/<id>.json`, num arquivo novo (nunca sobrescreve); o `mapping.json` não muda. O servidor não resolve conversa: quem resolve é uma pessoa, na app.',
      inputSchema: {
        project: projectArg,
        anchor: anchorArg,
        text: z.string().describe('Primeira mensagem, em markdown.'),
        author: authorArg,
      },
      annotations: WRITES,
    },
    (args) => respond(() => threads.openConversation(args)),
  );

  server.registerTool(
    'post_message',
    {
      description:
        'Responde numa conversa aberta. `after` é OBRIGATÓRIO: o id da última mensagem que você leu (get_thread). Se entrou mensagem depois dela, a tool recusa com `stale-thread`, sem gravar nada, e devolve as `newMessages`: leia-as, ajuste a resposta e chame de novo. Numa conversa resolvida recusa com `thread-resolved` (a dica manda abrir outra conversa que cite esta). A mensagem é sempre de agente. Responda só ao que lhe é pedido e nunca resolva a conversa (não há tool para isso).',
      inputSchema: {
        ref: threadRefArg,
        text: z.string().describe('A mensagem, em markdown (até 10.000 caracteres).'),
        after: z
          .string()
          .describe('Id da última mensagem que você leu na conversa (get_thread).'),
        project: optionalProjectArg,
        author: authorArg,
      },
      annotations: WRITES,
    },
    (args) => respond(() => threads.post(args)),
  );

  server.registerTool(
    'wait_for_comment',
    {
      description: `Espera até ${WAIT_MAX_SECONDS} s por uma conversa do projeto que PASSE a aguardar você (uma mensagem nova de pessoa, ou uma conversa nova com a última mensagem de pessoa) e devolve a primeira em \`thread\` (como uma linha de list_threads); no prazo sem novidade devolve \`{ changed: false }\` e você repete a chamada. Só vale o que mudou depois de começar a espera: leia antes a caixa de entrada com list_threads. O limite de ${WAIT_MAX_SECONDS} s existe porque o Claude Code corta qualquer tool em 60 s. Envia progresso a cada 15 s quando o cliente manda \`progressToken\`.`,
      inputSchema: {
        project: projectArg,
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(WAIT_MAX_SECONDS)
          .optional()
          .describe(
            `Segundos de espera (padrão ${WAIT_DEFAULT_SECONDS}, máximo ${WAIT_MAX_SECONDS}).`,
          ),
      },
      annotations: READ_ONLY,
    },
    (args, extra) => {
      const token = extra._meta?.progressToken;
      return respond(() =>
        threads.wait(args, {
          signal: extra.signal,
          progress:
            token === undefined
              ? undefined
              : async (seconds) => {
                  await extra.sendNotification({
                    method: 'notifications/progress',
                    params: {
                      progressToken: token,
                      progress: seconds,
                      message: 'aguardando uma conversa',
                    },
                  });
                },
        }),
      );
    },
  );
}
