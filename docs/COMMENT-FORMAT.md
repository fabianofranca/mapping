# Anchored conversation format (`mapping-thread`, `formatVersion` 1)

A **conversation** is a sequence of messages, from people and agents, anchored to an item of the mapping (a marking, an annotation field, a layer, a loose point on the canvas…). It stays open until **a person** resolves it. This document describes the conversation file, the grammar of references and citations, and the model API. The project format is in [`FORMAT.md`](FORMAT.md) and the proposal format is in [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md).

**The format is new** (Comments stage; `mapping.json` stays on schema v15). The app stores and reads `comments/` (folder, local project and zip) and shows the conversations in Details, in the Comments window and on the canvas pins; the MCP server (from 0.25.0 on) reads the inbox, opens conversations, replies and links proposals to them (`list_threads`, `get_thread`, `open_thread`, `post_message`, `wait_for_comment` and the `thread` argument of `propose_changes`; usage rules in "Conversas" in the agent guide, `mapping-docs://AGENT-GUIDE.md`).

Validation (zod) and all the rules live in `src/model/` (`thread.ts`, `threadOps.ts`, `threadView.ts`, `threadUsers.ts`, `threadFilters.ts`, `threadPins.ts`, `threadDelete.ts`, `citations.ts` and `refGrammar.ts`), as pure functions used by the app and by the MCP server.

## Where it lives

```
meu-projeto/
├── mapping.json
├── images/
├── proposals/
└── comments/
    ├── 5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902.json     # open conversation
    ├── c3a96f10-8e24-47bd-b5d0-1f7a2e9c6b38.json
    └── resolved/
        └── 91b7e2d5-0a4c-4c68-8f3e-6d2b5a1c9e70.json   # resolved conversation
```

- **One file per conversation.** Open ones live in `comments/<id>.json`; resolved ones, in `comments/resolved/<id>.json`. Two people who open a conversation on the same item generate different ids, and git merges without conflict.
- **Outside `mapping.json`.** The conversation does not enter undo, does not become a proposal and does not raise the schema (it stays v15).
- The `id` is a UUID and follows the proposal id rule: only `[A-Za-z0-9._-]` and it does not start with a dot (it becomes a file name). The same `id` appears in the file name and in the field.
- **The `resolved` field is the truth; the folder is only the index.** A file in `comments/` with `resolved` filled in, or in `resolved/` with `resolved: null`, counts by the field. The app moves it to the right folder on its next write.
- `repairProject` (mechanical repair) and the session cleanup **never read** `comments/`: nothing deletes a conversation on its own, not even an orphan one.
- Conversations stay in the project folder, versioned in git together with the rest, and go in the exported zip (see "Zip, local project and read-only").

## Example

```json
{
  "format": "mapping-thread",
  "formatVersion": 1,
  "id": "5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902",
  "anchor": {
    "kind": "field",
    "annotationId": "3f2a9c1e-7b4d-4e0a-9d51-0a1b2c3d4e5f",
    "key": "variant"
  },
  "createdAt": "2026-11-07T09:14:03.000Z",
  "revision": 2,
  "resolved": null,
  "messages": [
    {
      "id": "0b6f31c2-5e8a-4d97-a1c4-72e9d03b8f15",
      "author": { "kind": "agent", "name": "Claude Code", "email": null },
      "at": "2026-11-07T09:14:03.000Z",
      "text": "The specialization does not say which **variant** to use here. From the design it looks like `outlined`, but the button on the [login screen](mapping://meu-projeto/m/7c41b0e9) is `filled`. Which one applies?",
      "proposal": null
    },
    {
      "id": "e4a98d27-1b63-4f05-8c7a-3d5e0f2a6b91",
      "author": {
        "kind": "human",
        "name": "Marina Alves",
        "email": "marina@exemplo.com"
      },
      "at": "2026-11-07T09:41:20.000Z",
      "text": "It is `outlined`. The one on the login screen is the main one on the page, so it is `filled`.",
      "proposal": null
    },
    {
      "id": "a2c5d718-9f04-4b3e-86d1-0e7b4a93c5f6",
      "author": { "kind": "agent", "name": "Claude Code", "email": null },
      "at": "2026-11-07T10:02:47.000Z",
      "text": "Proposal: [Button variants](mapping://meu-projeto/p/8c1f2d9e)",
      "proposal": "8c1f2d9e"
    }
  ]
}
```

In this example the last message is from an agent, so the conversation is **waiting for a human**. The derived subject is "The specialization does not say which variant to use here. From the design it looks like outlined, but the button on the…" (cut at 80 characters).

## Root fields

All are required; the "empty" value is `null`, as in the proposal.

| Field           | Type             | Description                                                                                                                    |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `format`        | string           | Always `"mapping-thread"`.                                                                                                     |
| `formatVersion` | `1`              | Format version.                                                                                                                |
| `id`            | string           | Conversation id (the file name). `[A-Za-z0-9._-]`, not starting with a dot.                                                    |
| `anchor`        | object           | Where the conversation is anchored (see "Anchors").                                                                            |
| `createdAt`     | string           | ISO 8601 date (UTC) when the conversation was opened.                                                                          |
| `revision`      | integer ≥ 0      | Write counter of the file, with the same check as `mapping.json` and the proposal (see "`revision` and writing").              |
| `resolved`      | object or `null` | `{ "by": { "name", "email" }, "at" }` when a person resolved it; `null` on an open conversation. `name` and `email` not empty. |
| `messages`      | array            | The messages (below), at least one. Reading sorts them by `at` and, on a tie, by `id`.                                         |

### Message

| Field      | Type             | Description                                                                                                                                                 |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string           | Unique within the conversation.                                                                                                                             |
| `author`   | object           | `{ "kind": "human" \| "agent", "name", "email" }`. `name` not empty; `email` is required for a person and `null` for an agent.                              |
| `at`       | string           | ISO 8601 date (UTC).                                                                                                                                        |
| `text`     | string           | Markdown, not empty (not only spaces) and up to 10,000 characters (`String.length`). May contain citations (see "References and citations").                |
| `proposal` | string or `null` | Id of a proposal linked to the message. Only the MCP server fills it, in `propose_changes` with `thread`; in the app the message becomes the proposal card. |

- **Append only:** nobody changes or removes a message. To delete, the whole conversation is deleted (see "Who writes what").
- Unknown fields are dropped on read (and, for that reason, do not come back on write): a new version of the format raises the `formatVersion`.

## Anchors

The anchor is **by id**: it follows the item that moves or changes parent. There are nine forms:

| `kind`       | Fields                         | Points to                                                                                                   | Where the pin lives (host)         |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `marking`    | `id`                           | A marking.                                                                                                  | The marking itself.                |
| `container`  | `id`                           | A container.                                                                                                | The container itself.              |
| `annotation` | `id`                           | An annotation.                                                                                              | The marking or arrow that owns it. |
| `arrow`      | `id`                           | An arrow.                                                                                                   | The arrow itself.                  |
| `layer`      | `id`                           | A layer.                                                                                                    | None (a layer has no pin).         |
| `field`      | `annotationId`, `key`          | A typed field of the annotation (the field's `key`).                                                        | The owner of the annotation.       |
| `entry`      | `annotationId`, `entryId`      | A pair of the free annotation.                                                                              | The owner of the annotation.       |
| `row`        | `annotationId`, `key`, `rowId` | A row of a `table` (the row's `_id`) in the `key` field.                                                    | The owner of the annotation.       |
| `point`      | `containerId`, `x`, `y`        | A loose point. `containerId` not null: container pixels, and the point moves with it; `null`: canvas units. | The point itself.                  |

- A point's container is decided **once**, when the conversation is created: the topmost container under the cursor, or the canvas. The point is not a marking and does not go through `settleHierarchy`. `x` and `y` are any numbers (they may be negative and fractional, on the canvas).
- **One pin per item that hosts the anchor, not by proximity:** a conversation on a field appears on the owner marking's pin, with no second pin on top of the first.

### Orphan

It is a conversation whose anchor **no longer exists in the project**: the item was deleted, or the point's container was deleted. The resolution says what disappeared (`marking`, `container`, `arrow`, `layer`, `annotation`, `entry` or `row`):

- `field`: it is enough for the annotation to exist; `entry` and `row` also need to exist (the pair among the annotation's pairs, the row among the table's rows);
- `point` is only orphan with a non-null `containerId` and the container deleted;
- an `annotation` or a `field` whose owner no longer exists has no pin, but is not an orphan either.

The orphan conversation stays listed, without a pin ("<kind> deleted · orphan"). **Nothing deletes it on its own.**

## States and what is derived

The file stores only the facts (messages and `resolved`). Everything that follows is **computed** by the model and **never written**:

| Derived      | Rule                                                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Waiting**  | Only on an open conversation. The last message (in `at`, `id` order) from a **person** gives **Waiting for agent**; from an **agent** it gives **Waiting for human**. Nobody is tagged. A resolved conversation waits for nobody.                                                               |
| **Subject**  | The first line with text of the first message, without the markdown markup (heading, list, quote, emphasis, code), with the citation labels as text and cut at 80 characters (the ellipsis `…` counts).                                                                                         |
| **Unread**   | **Per device.** The conversation is unread when it has a message from **another person** (another email) or from an **agent** strictly after that conversation's `lastReadAt`. The person's own message never counts. The `lastReadAt` lives in the device's `localStorage`, never in the file. |
| **Orphan**   | The anchor does not exist in the project (above).                                                                                                                                                                                                                                               |
| **Pin**      | Groups by host item, with the color of the most urgent conversation: waiting for human, then waiting for agent, then resolved. A resolved one only has a pin while it is selected. Layer and orphan have no pin. Showing or hiding the pins is interface state.                                 |
| **Cited in** | Backlinks: for each conversation cited by another (`c/<code>`), the conversations that cite it. It considers open and resolved ones.                                                                                                                                                            |

Accepted consequence of "waiting": a conversation only between people stays "Waiting for agent" while the last message is from a person. The agent guide tells it to answer only what it is asked.

## Who writes what

- **The app** writes as `human`, with the identity from Settings (name and email, per device, never in the project): it opens the conversation, appends messages, **resolves** (writes `resolved` and moves the file to `comments/resolved/`), **reopens** (clears the field and moves the file back) and **deletes** (conversation by conversation or in bulk, with the notice of whose messages are going away). Without an identity, the person can only read.
- **The MCP server** (from 0.25.0 on) writes only as `agent`, with `email: null`, and only in `comments/<id>.json`:
  - **New conversation** (`open_thread`): new file by **temporary file + hard link**, which never overwrites an existing one (on a disk without hard link, it writes directly, still without overwriting). The `id` and the first message's id are UUIDs generated by the server.
  - **Appended message** (`post_message`, and `propose_changes` with `thread`, which appends a message with `proposal`): **rereads the file immediately before writing**, redoes the operation on the disk version if the app changed it in the meantime and writes the whole file **atomically** (temporary + rename) with `revision + 1`; after 3 attempts without stability, it refuses with `revision-conflict`. `post_message` requires `after` (the id of the last message read): if a message came in after it, it does not write (`stale-thread`). The message time is never before the conversation's last one.
  - It **never** resolves, reopens or deletes a conversation (there is no tool for that), **never** writes in `comments/resolved/` (an MCP message on a resolved conversation is refused with `thread-resolved`) and **never** changes `mapping.json`. An unreadable file is not overwritten (`invalid-thread`).
  - The author name is the tool's `author` argument, else the MCP client's `clientInfo.name`, else "agente". The server never signs as a person: there is no `kind: "human"` coming from MCP.
- **The `kind` never comes from the caller:** the app only writes `human` and MCP only `agent`. In the model, the author enters as an argument of the functions; the model does not decide who is human.
- **Nobody changes or removes a message.**
- **No other code writes in `comments/`.** An external change (MCP, a text editor, git) becomes a reload in the app.

## `revision` and writing

Every write, from the app or from MCP, **rereads the file** before writing:

1. If the text changed since the last read or write, it adopts the disk version.
2. **It redoes the operation on it** (append, resolve and reopen are pure functions) and writes `revision + 1`.
3. A file that became unreadable is **not overwritten**.

Model convention: every operation that **changes** the conversation returns `revision + 1`; one that does not change it (resolving an already resolved conversation, reopening an open one) returns the same conversation, intact, without touching `revision`. That way, redoing the operation on a disk version that someone else already resolved changes nothing.

## The same conversation in two folders

A git merge, or a folder move that failed halfway (resolve or reopen), can leave the same `id` in `comments/` and in `comments/resolved/`. Reading **joins the two copies** (`mergeThreadCopies`):

- **Only one copy:** it wins, and the `resolved` field says the location.
- **Two copies:**
  - the messages are the **union by `id`** (a repeated id is the same message; the open copy's wins);
  - the `revision` is the **greater** of the two (no summing: whoever writes the result does the adding);
  - if the two copies have **the same messages** and a different `revision`, the copy with the **greater `revision`** decides: open (the interrupted reopening, open at `revision` 6 and resolved at 5, is not lost) or resolved (with its `resolved`);
  - in the other cases (different messages, or the same `revision`), the conversation is **resolved only if** the resolved copy's `resolved.at` is **later than the last message** of the union; otherwise it is open, with `resolved: null` (someone wrote after it was resolved, which amounts to reopening);
  - the anchor and `createdAt` come from the copy with the greater `revision` (the open one, on a tie).
- The app's next write writes in the right place (the folder the `resolved` field indicates) and deletes the other copy. MCP reads the same way.
- Copies with different ids, or no copy, are `invalid-thread`.

## The git limit: two machines on the same conversation

Two people who append messages to the **same** conversation on different machines get a **textual conflict** in git, because both write at the end of the `messages` list (and change the `revision` line). The conflict is only textual: no data is lost, and the read-time ordering by `at` and `id` accepts the result. To resolve it:

1. `git status` shows `comments/<id>.json` as "both modified". Open the file: the `<<<<<<<`, `=======` and `>>>>>>>` markers surround the end of `messages` (and, sometimes, the `revision` line).
2. **Keep both messages.** Delete only the three marker lines and leave the two message blocks, one after the other. The order between them does not matter (reading sorts by `at` and `id`, and the app's next write rewrites in canonical order).
3. Check the **comma** between the two blocks (the last object on each side has no comma and, together, they need one) and that the array still closes with `]`. No git marker may remain: the file must be valid JSON.
4. On the `revision` line, keep the **greater** of the two numbers. Any integer ≥ 0 is valid; the app just adopts what is on disk and adds 1 on the next write.
5. If both sides appended the **same** message (same `id`), keep only one: the `id` is unique within the conversation.
6. If one side **resolved** and the other appended a message, keep both things (both messages and one side's `resolved`): the copy-join rule decides on its own (the conversation is only resolved if the resolution is later than the last message).
7. `git add comments/<id>.json` and finish the merge. A "modified here, deleted there" conflict (one person deleted the conversation, the other wrote in it) is your decision: deleting is irreversible; when in doubt, keep the file.

If the file remains invalid, the app and MCP treat it as unreadable: they do not overwrite it and show the error with the exact path.

## Zip, local project and read-only

- **Exported zip:** carries `comments/` and `comments/resolved/`. On import **only those two paths** come in, with a valid id (the file name, without the extension, follows the `id` rule; no `..`). The text of an invalid file comes back identical on exporting again, like the proposal's: nothing is lost for not being understood.
- **Local project** (IndexedDB): the keys are the same paths. Writing marks the project as "not exported". In the local project the conversation works between people, without an agent, and is not watched (there is no `stat` to compare).
- **Read-only:** in a project opened only for reading (`readOnly`), the conversations are also read-only. The person reads, but does not write, resolve or delete. During the review of a proposal, the conversations are also read-only (the review shows the proposed project, and an anchor that exists only in the preview would become orphan).

## Validity rules

`parseThread` / `parseThreadText` validate the file and return the errors with the exact path (`errors`, in the `path: message` format, and `issues`, with `path` and `message` separate); reading also returns `warnings` (empty in `formatVersion` 1). The actual errors:

| Situation                                                    | Error                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Not JSON                                                     | `JSON inválido: Expected property name or '}' in JSON at position 1 (line 1 column 2)`                           |
| Wrong `format` or `formatVersion`                            | `format: deve ser "mapping-thread"`, `formatVersion: deve ser 1`                                                 |
| Invalid conversation id                                      | `id: id inválido; use [A-Za-z0-9._-], sem começar com ponto`                                                     |
| Date that is not ISO 8601                                    | `createdAt: data inválida; use ISO 8601 (UTC)` (also in `messages[i].at` and `resolved.at`)                      |
| Conversation without a message                               | `messages: deve ter ao menos uma mensagem`                                                                       |
| Repeated message id                                          | `messages[2].id: id "a" repetido`                                                                                |
| Person without email                                         | `messages[2].author.email: obrigatório na pessoa`                                                                |
| Agent with email                                             | `messages[2].author.email: deve ser null no agente`                                                              |
| Invalid author `kind`                                        | `messages[2].author.kind: deve ser "human" ou "agent"`                                                           |
| Empty name                                                   | `messages[2].author.name: não pode ser vazio` (and `resolved.by.name`)                                           |
| Empty text, only spaces                                      | `messages[2].text: não pode ser vazio`                                                                           |
| Text with more than 10,000 characters                        | `messages[2].text: no máximo 10000 caracteres`                                                                   |
| Invalid anchor `kind`                                        | `anchor.kind: deve ser "marking", "container", "annotation", "arrow", "layer", "field", "entry", "row", "point"` |
| Missing anchor field                                         | `anchor.key: Invalid input: expected string, received undefined`                                                 |
| Missing required field (including `resolved` and `proposal`) | `resolved: Invalid input: expected object, received undefined`                                                   |
| Invalid `resolved`                                           | `resolved.by.name: não pode ser vazio`, `resolved.at: data inválida; use ISO 8601 (UTC)`                         |

In short:

- root with all the fields; exact `format` and `formatVersion`; `id` by the proposal id rule; ISO 8601 dates (they accept a time zone, and reading normalizes them to UTC with `Z`); `revision` integer ≥ 0;
- `messages` with at least one message, unique ids, non-empty `text` of up to `THREAD_MESSAGE_MAX` (10,000) characters, `proposal` string or `null`;
- `human` author with `email` filled in and `agent` with `email: null`;
- anchor of one of the nine forms, with `id`, `annotationId`, `key`, `entryId` and `rowId` not empty, and `containerId` string or `null`, `x` and `y` numbers;
- `resolved` `null` or `{ by: { name, email }, at }`, with `name` and `email` not empty.

Outside the file (rules of the caller, not of the format): an MCP message on a resolved conversation (`thread-resolved`) and the `after` guard of `post_message`. The model operations throw `ThreadError` with `thread-message-duplicate` (appending an `id` that already exists) or `invalid-thread` (invalid data, copies that do not match).

Writing (`serializeThread`) is canonical: keys always in the same order, messages in `at`/`id` order, 2-space indentation and a line break at the end. That way, an appended message is a new block at the end of the array and the git diff stays small.

## References and citations

### Reference grammar

The `mapping://` reference is the same for the app and for MCP (`refGrammar.ts`, on top of `itemRef.ts`). The letters and segments come **after the code**, never as a suffix:

```
mapping://<project>/<m|i|a|p|l|c>/<code>                item, proposal, layer (l) or conversation (c)
mapping://<project>/a/<code>/f/<field>                  typed field (the key, encoded)
mapping://<project>/a/<code>/e/<code>                   pair of the free annotation
mapping://<project>/a/<code>/f/<field>/r/<code>         table row
```

| Form                                                    | Example                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Marking or arrow (`m`; the ids of both share the space) | `mapping://meu-projeto/m/7c41b0e9`                                     |
| Container (`i`)                                         | `mapping://meu-projeto/i/9b1c4d2e`                                     |
| Annotation (`a`)                                        | `mapping://meu-projeto/a/3f2a9c1e`                                     |
| Proposal (`p`)                                          | `mapping://meu-projeto/p/8c1f2d9e`                                     |
| Layer (`l`)                                             | `mapping://meu-projeto/l/d41e7a05`                                     |
| Conversation (`c`)                                      | `mapping://meu-projeto/c/5d0e8a41`                                     |
| Typed field                                             | `mapping://meu-projeto/a/3f2a9c1e/f/variant`                           |
| Field whose key has special characters (encoded)        | `mapping://meu-projeto/a/3f2a9c1e/f/cor%20de%20fundo`                  |
| Pair of the free annotation                             | `mapping://meu-projeto/a/3f2a9c1e/e/b07c15d3`                          |
| `table` row                                             | `mapping://meu-projeto/a/3f2a9c1e/f/passos/r/2e90a6f4`                 |
| Short form (without the project)                        | `c/5d0e8a41`, `a/3f2a9c1e/f/variant`, `a/3f2a9c1e/f/passos/r/2e90a6f4` |

- **Short codes.** The code is the start of the normalized id (without hyphens, lowercase): 8 characters, growing by 4 at a time if there is a collision. The `m` code is unique among markings and arrows; the `i` code, among containers; the `a` code, among annotations; the `l` code, among layers; the `p` code, among the project's proposals; the `c` code, among the project's conversations (open and resolved); the pair's code (`e`), among the annotation's pairs; the row's code (`r`), among the table's rows. On resolution, the id whose normalized form is exactly the code wins; otherwise the only id that starts with it counts (more than one is ambiguous).
- **`<project>`** is the folder name, encoded with the _unreserved_ set of RFC 3986 (`A-Z a-z 0-9 - . _ ~`; the rest becomes `%XX` in UTF-8, and so do `( ) ! ' *`).
- **`<field>`** is the field's `key`, encoded the same way (reading decodes it; an invalid `%` gives `null`).
- **Strict reading** (`parseAnyRef`): anything after the code, `?`, `#`, a space in the middle, an empty segment, an unknown letter or `e`/`f`/`r` in the wrong place give `null` (MCP calls it `invalid-ref`). Only the full URL is accepted, or the short one starting with the letter (`c/…`, `a/…`); the bare code belongs to the old `parseRef` (`m`, `i`, `a`).
- **The links of the library documents** (`mapping://<typeId>` and `mapping://<specId>/<typeId>`) have at most two segments after the scheme, and the grammar requires the letter followed by the code: they are never confused with a reference, and `extractCitations` ignores them.
- The earlier references (`m`, `i`, `a`, `p`) remain valid, unchanged. The MCP server accepts the new forms (`l`, `c`, `/f/`, `/e/`, `/r/`) from 0.25.0 on: `resolve` understands all of them, and `get_annotation` and the other item tools accept a field, pair and row as the annotation that contains them (on a marking or container tool, a part is `wrong-kind`; a suffix the grammar does not know, `invalid-ref`).

### The citation is a markdown link

There is no new syntax: the citation is the link `[<current name>](<reference>)` in the message text, and the text stays readable in any markdown reader (in git, in the editor).

- The app writes the label with `[`, `]` and `\` escaped (`formatCitation`, `escapeCitationLabel`): `[a\[0\] da lista](mapping://meu-projeto/a/3f2a9c1e/f/lista)`. An empty label is not a link in markdown: whoever has no name uses a neutral text.
- **Inside a conversation, the citation counts in the conversation's project.** The `<project>` in the URL only informs whoever reads the raw file: the app and MCP resolve the code in the conversation's project, and a renamed folder breaks nothing. In a local project, the app writes the project name in that segment.
- `extractCitations` reads the text with the same markdown reader that draws the message (with `lineBreaks`), so what the screen shows as a link counts; a link inside a code block does not. A `mapping://` link that does not satisfy the grammar comes back with `ref: null` (a **broken** citation); ordinary links (`https://`, `#anchor`) and the library ones are not citations.

### The live chip

The chip shows the target's **current** name, resolved through the reference (`liveLabel`):

| Target                                | Chip label                                                               |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Marking, container, arrow, annotation | The name (the annotation's, the instance's or the type's name).          |
| Field                                 | The field's `label` (the `key`, if there is no type).                    |
| Pair                                  | The pair's `key`.                                                        |
| Row                                   | The value of the `rowLabel` column (the `#n` position if there is none). |
| Layer                                 | The name.                                                                |
| Conversation                          | The subject.                                                             |
| Proposal                              | The title.                                                               |

- The label between the link's brackets is the **fallback**. With the target deleted (or the code not resolving), the chip is struck through with that label and the tooltip says the target no longer exists. The reason is `missing` (the code does not exist, or the field, pair or row does not exist in the annotation), `ambiguous` (the short code serves more than one target) or `invalid` (the link does not even satisfy the grammar).
- A target that exists but has no name (a marking without a name, for example) comes back with `label: null`; the interface shows the translated text.
- Clicking takes you to the target: it selects the item and focuses the field, opens the conversation, or shows the proposal in the Proposals window.
- **Cited in:** a conversation cited by another (`c/<code>`) lists the conversations that cite it; it is derived from the loaded conversations, and nobody writes it by hand (`backlinks`).

## API in `src/model/`

- Format (`thread.ts`): `THREAD_FORMAT`, `THREAD_FORMAT_VERSION`, `COMMENTS_DIR`, `RESOLVED_DIR`, `THREAD_MESSAGE_MAX`, `THREAD_ID_RE`, `THREAD_ANCHOR_KINDS`, `threadFilePath`, `compareThreadMessages`, `sortThreadMessages`, `parseThread`, `parseThreadText`, `serializeThread`, and the schemas `threadSchema`, `threadMessageSchema`, `threadAuthorSchema`, `threadAnchorSchema`, `threadResolvedSchema`, `threadResolverSchema`; types `Thread`, `ThreadMessage`, `ThreadAuthor`, `ThreadAuthorKind`, `ThreadAnchor`, `ThreadAnchorKind`, `ThreadResolved`, `ThreadResolver`, `ThreadParseResult`.
- Pure operations (`threadOps.ts`): `openThread`, `appendMessage`, `resolveThread`, `reopenThread`, `mergeThreadCopies` (the join of the two copies), `threadLocation` (`open` or `resolved`, the folder where the file must live), the class `ThreadError` (`thread-message-duplicate`, `invalid-thread`); types `OpenThreadArgs`, `MergedThread`, `ThreadLocation`, `ThreadErrorCode`.
- View (`threadView.ts`): `resolveAnchor`, `isOrphan`, `hostOf`, `hostKey` (anchor, orphan and pin host), `lastMessage`, `awaiting`, `threadSubject` (with `SUBJECT_MAX` and an optional `resolveLabel` for the citations' live label), `isUnread`; types `ThreadHost`, `ThreadMissingKind`, `AnchorResolution`, `ThreadAwaiting`, `SubjectLabelResolver`, `ThreadViewer`.
- Users (`threadUsers.ts`): `normalizeEmail`, `userKey` (`human:<email>` or `agent:<name>`), `userLabel`, `initials` (first and last word; the agent is `AG`), `threadUsers` (the User filter, with each one's conversation count); type `ThreadUser`.
- Filters (`threadFilters.ts`): `filterThreads` (status, user, text insensitive to case and accents, and "only those that cite the selection", combined); types `ThreadFilter`, `ThreadStatusFilter`, `ThreadSelectionFilter`.
- Pins (`threadPins.ts`): `pinGroups` (one group per host item, with color, initials, message count, label and "unread"); types `PinGroup`, `PinColor`, `PinGroupOptions`.
- Delete (`threadDelete.ts`): `deleteImpact` (the messages and authors that go away, and whether it can be deleted directly), `bulkDeleteCandidates` ("Only the resolved ones" and "last message before"); types `DeleteImpact`, `DeleteAuthorCount`, `MessageSummary`, `BulkDeleteCriteria`, `BulkDeleteCandidates`.
- Grammar (`refGrammar.ts`): `parseAnyRef`, `formatAnyRef`, `formatSubRef`, `ANY_REF_KINDS`, `layerShortCodes`, `layerShortCode`, `matchLayerCode`, `threadShortCodes`; types `AnyRef`, `AnyRefKind`, `ItemAnyRef`, `FieldAnyRef`, `EntryAnyRef`, `RowAnyRef`, `SubRef`, `ParsedAnyRef`. `parseRef` and `formatRef` (`itemRef.ts`) stay as they were.
- Citations (`citations.ts`): `extractCitations`, `escapeCitationLabel`, `formatCitation`, `resolveCitation`, `citationTargetKey`, `liveLabel`, `liveCitation`, `citedTargets`, `backlinks`; types `Citation`, `CitationTarget`, `CitationTargetKind`, `CitationResolution`, `CitationContext`, `CitationProposal`, `LiveLabel`, `LiveCitation`.
- Markdown (`markdown.ts`): `parseMarkdown(text, { lineBreaks: true })` breaks the line inside the paragraph, for the messages; the Catalog stays as it is.

## In the app and in MCP

The app uses the model for storage (folder, local project and zip), the session with the `revision` check, the identity and the "unread" state. The MCP server uses it in the tools `list_threads`, `get_thread`, `open_thread`, `post_message`, `wait_for_comment`, in `propose_changes` with `thread` and in `resolve` with the new grammar, and serves this document as the resource `mapping-docs://COMMENT-FORMAT.md`. The agent guide (`mapping-docs://AGENT-GUIDE.md`, "Conversas" section) carries the usage rules: when to open a conversation, the `after`, and what the agent never does.
