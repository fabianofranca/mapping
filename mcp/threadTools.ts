import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Threads } from './threads';
import { WAIT_DEFAULT_SECONDS, WAIT_MAX_SECONDS } from './threads';

// The conversation tools (Comments stage, CM6). The server reads the inbox, opens
// conversations and replies with the `after` guard; it never resolves, reopens or deletes.

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
    'Reference of the conversation (`mapping://project/c/3f2a9c1e`, the one list_threads and open_thread return), `c/3f2a9c1e` (with `project`) or the full id.',
  );

const anchorArg = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe(
    'Where the conversation sits: any reference in the project (marking or arrow `…/m/…`, container `…/i/…`, annotation `…/a/…`, layer `…/l/…`, field `…/a/<code>/f/<field>`, entry `…/a/<code>/e/<code>`, row `…/a/<code>/f/<field>/r/<code>`) or a loose point `{ point: { container, x, y } }` (`container` is the reference of a container, with x and y in its pixels, or null for the canvas).',
  );

const authorArg = z
  .string()
  .optional()
  .describe(
    'Name the message appears under (default: the name of the MCP client, or "agent"). Authorship is always an agent\'s: there is no signing as a person.',
  );

export function registerThreadTools(server: McpServer, deps: ThreadToolDeps): void {
  const { threads, respond, projectArg, optionalProjectArg } = deps;

  server.registerTool(
    'list_threads',
    {
      description:
        "The project's conversation inbox. Without any filter, it brings the OPEN conversations awaiting you (the last message is from a person); with `text` or `anchor` (or just `status`/`awaiting`), whatever you do not give is `status: open` and `awaiting: any`. `status`: `open`, `resolved` or `all`; `awaiting`: `agent` (the last message is from a person), `human` (it is from an agent) or `any`; `anchor`: only those anchored to an item, layer, field, entry, row or point (and to its parts); `text`: searches the text of the messages, accent- and case-insensitive. Each row carries `ref` (`mapping://project/c/code`), `anchor` (the reference, or `{ point }`), `path`, `orphan` (the anchor's item was deleted), `status`, `awaiting`, `messages`, `subject` and `last` (the last message, with the `cites` resolved). Pagination by `limit` (default 50, maximum 200) and `offset`; `total` is the number that matches. `broken` lists unreadable conversation files. To read the whole conversation use get_thread.",
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
        'A whole conversation: the state (`status`, `awaiting`, who resolved it), the resolved anchor (`ref`, `kind`, `path`, `name` and, on a field or entry, the current `value`; `orphan` if the item was deleted), the messages in order (author, time, text in markdown, the linked proposal and the `cites`: each `mapping://` link in the text resolved with `kind`, `ref`, `path`, `label`, `value` and `broken`), `citedIn` (the conversations that cite this one) and `proposals` (the linked proposals, with state and progress). Reply with post_message using the `id` of the LAST message as `after`.',
      inputSchema: { ref: threadRefArg, project: optionalProjectArg },
      annotations: READ_ONLY,
    },
    ({ ref, project }) => respond(() => threads.get(ref, project)),
  );

  server.registerTool(
    'open_thread',
    {
      description:
        'Opens a conversation anchored to an item of the project, with its first message (markdown, up to 10,000 characters), and returns its `ref`. Use it when facing an ambiguity the specialization does not settle, instead of guessing or dropping the task; carry on with the rest of the work: the person answers in the app, on the item. Cite items, fields and other conversations in the text as markdown links `[name](mapping://project/…)`; a citation that does not resolve is saved anyway, with the `broken-cite` warning. Writes only `comments/<id>.json`, as a new file (never overwrites); `mapping.json` does not change. The server does not resolve conversations: a person does, in the app.',
      inputSchema: {
        project: projectArg,
        anchor: anchorArg,
        text: z.string().describe('First message, in markdown.'),
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
        'Replies in an open conversation. `after` is REQUIRED: the id of the last message you read (get_thread). If a message came in after it, the tool refuses with `stale-thread`, writing nothing, and returns the `newMessages`: read them, adjust the reply and call again. In a resolved conversation it refuses with `thread-resolved` (the hint says to open another conversation that cites this one). The message is always from an agent. Reply only to what is asked of you and never resolve the conversation (there is no tool for that).',
      inputSchema: {
        ref: threadRefArg,
        text: z.string().describe('The message, in markdown (up to 10,000 characters).'),
        after: z
          .string()
          .describe('Id of the last message you read in the conversation (get_thread).'),
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
      description: `Waits up to ${WAIT_MAX_SECONDS} s for a conversation of the project that STARTS awaiting you (a new message from a person, or a new conversation whose last message is from a person) and returns the first in \`thread\` (like a row of list_threads); if the time runs out with nothing new it returns \`{ changed: false }\` and you repeat the call. Only what changed after the wait started counts: read the inbox first with list_threads. The limit of ${WAIT_MAX_SECONDS} s exists because Claude Code cuts any tool at 60 s. Sends progress every 15 s when the client sends \`progressToken\`.`,
      inputSchema: {
        project: projectArg,
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(WAIT_MAX_SECONDS)
          .optional()
          .describe(
            `Seconds to wait (default ${WAIT_DEFAULT_SECONDS}, maximum ${WAIT_MAX_SECONDS}).`,
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
                      message: 'waiting for a conversation',
                    },
                  });
                },
        }),
      );
    },
  );
}
