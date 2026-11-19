# Mappings

## What these mappings are for

These mappings are used to **design and evolve Mapping itself**: map the application's screens, flows and components in order to create new features and improve the product's UI/UX.

The outcome of each piece of work is its **implementation**: from the markings and annotations, open **new issues in the Mapping repository**, each with its scope, the expected behavior and the mapping item that originated it (a `mapping://…` reference), so that every issue can be implemented without depending on this workspace.

**Language:** work on files, issues and commits in English. The content of mapping projects (annotations, conversations) may be written in the language the author prefers.

<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->

This folder centralizes the **Mapping** projects: containers (images of screens, prototypes, diagrams, or areas with no file) with marked rectangular areas, organized into layers and described by annotations, each project in a folder with a `mapping.json`. It is tool-agnostic: everything you need is here, by relative path.

## Structure

| Folder                   | What it is                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projetos/<name>/`       | A Mapping project: `mapping.json`, `images/`, `specs/` (copies of the applied specializations), `proposals/`.                                            |
| `especializacoes/`       | The **sources** of the specializations (`<id>.json`). The copy in `projetos/*/specs/` is derived; edit here and reapply.                                 |
| `tools/mapping-mcp.js`   | The Mapping MCP server (self-contained; Node ≥ 20).                                                                                                      |
| `.agents/skills/`        | Skills in the Agent Skills standard; `.claude/skills/spec-author` is a link to its folder (or a copy, where links do not exist; `setup.sh` recopies it). |
| `.mcp.json` and siblings | The same server configuration for each client (Claude Code, Cursor, Gemini CLI, Copilot, Codex).                                                         |

## MCP server `mapping`

The tools appear as `mcp__mapping__…` (or `mapping/…`, depending on the client). If they do not appear, the client did not load this folder's configuration; the command is:

```
node tools/mapping-mcp.js --root projetos --root especializacoes
```

Start with `list_projects`. The server describes its usage in its own instructions and in the `mapping-docs://AGENT-GUIDE.md` resource; read the guide before the first change. Items are cited by reference `mapping://<project>/<m|i|a|p>/<code>`, URL only (no readable path and with the project encoded: `My%20Project`); a reference in the old format gives `invalid-ref` and must be copied again from the app.

## Rules

- **Never edit `mapping.json`, `specs/` or `proposals/` by hand.** Every change goes through `plan_changes` (preview) and `propose_changes` (saves a proposal); the person reviews and applies it in the app. After proposing, notify them and wait for the review (`get_proposal`, `get_proposal_review`).
- **Perspectives are read-only.** `get_project` returns `perspectives` and `arrivals`, `get_perspective` the roots of a perspective, and `get_marking` and `get_container` say in which perspectives the item appears. You never create or change them and always propose in the Main one (details in the "Perspectives" item of the concepts of the `mapping-docs://AGENT-GUIDE.md` guide).
- **Specializations start in `especializacoes/`**, with the `spec-author` skill (below), are validated with `validate_specialization` and applied to a project only by proposal (`apply_specialization` inside `propose_changes`). To change an applied one, edit the source, bump the `version` and send `update_specialization`. **Libraries** (`formatVersion` 4) are **folders** `especializacoes/<id>/`: validate with `validate_library({ path })` (not just the file) and hand the validated folder to the person, who applies it in the app (Specializations) or asks you to propose it: `apply_specialization` (or `update_specialization`, for a major version) in a `propose_changes`, with `file` = the folder (before that, on an update, `plan_library_update` shows the impact); details in "Writing a library" in the `mapping-docs://AGENT-GUIDE.md` guide. To read the components, use `list_components` and `get_component`.
- **Coordinates** of a marking are in pixels of the container's original image (the letter `i` in `mapping://…/i/…` references is the container). The exception is the **canvas marking** (`space: "canvas"`, `container: null`), which wraps containers and has a `rect` in canvas units, with no image to crop (`get_marking_image` answers `canvas-marking`). Who is inside whom comes **ready**: `parent` and `members` in `get_marking`, `parent` in `get_container`; read it, do not compute intersections and do not choose the parent (`parent` in `create_marking`/`update_marking` is ignored with a warning).
- **Notes, tables and arrows.** A `floating` type (the notes library: `nota` and `tabela`) creates a **floating** marking, on the canvas, that belongs to nothing; it is linked to the element by an **arrow**, which is a marking that points (`create_arrow`, `from`/`to`; never `points`). To find a button's table, read `arrows` in the button's `get_marking` and follow the floating end. To create one, use `create_marking` with `near` the button and `create_arrow`, in a single batch. Types with `appliesTo: ["arrow"]` annotate the arrow. To create a marking around others (the app's **Wrap**), use `wrap_items` with the items, without computing the rectangle by hand. If an item fills the container, the new one gets the same rectangle as it and is the item's **parent**, in the plan and in the applied project (read the response's `membership`). It also holds with `move_marking` in the batch; the rare exception is the known limit #625 (a new tie between markings that already existed, decided by an intermediate step of the batch): in that case, check with `get_marking` after applying.
- **Code**: the server only checks that code files exist, and only inside the directory where the client was opened. A type's `code` says how to create an instance of it on each platform (what to call and the file that defines it, in the specialization's repository); the mapping stores nothing about the solution. To write the solution from the markings (`get_code_hints`, `find_by_code`), open the agent in the code repository, with this folder as the server root by absolute path.

## Skill `spec-author`

To write, review or update a specialization, use the `spec-author` skill (`.agents/skills/spec-author/SKILL.md`): it brings the method, the mandatory reading of the format and the validation; the request only needs to state the `id`, the origin, the `formatVersion`, the platforms and what stays out and, for a library, the output folder and the origin of the components (template at the end of the skill). Save the source in `especializacoes/<id>.json` (library: in the `especializacoes/<id>/` folder).

## Typical flow

1. `list_projects` → `get_project` → `get_specialization` of the types you will use.
2. Read the containers and markings that matter (`list_markings`, `get_marking`, `get_marking_image`). If your client does not show images in the chat (like Cursor), paste the `markdown` that `get_marking_image`/`get_container_file` return (local URL of the server).
3. Build the batch, check it with `plan_changes` (read the response's `membership`, which lists who changes parent or space; do not compute intersections), send it with `propose_changes`, notify the person.
4. When the review is done, read `get_proposal_review` and, if needed, fix the same proposal with `revise_proposal` (while nothing has been applied; afterwards, send another one with `supersedes`).

## Conversations

People and agents talk in **conversations anchored** to an item of the mapping (marking, field, layer, canvas point…), stored in `projetos/<project>/comments/`. The usage rules (tools, `after`, citations, linked proposals) are in the "Conversations" section of the `mapping-docs://AGENT-GUIDE.md` guide; read it before opening or answering one. The summary:

- **Who wakes you up.** If `watch-comments.mjs` (in the root of this folder, see the `README.md`) is running, it calls you with a prompt like this: "There are conversations awaiting you in projetos/. Read them with `list_threads` (by default: the open ones awaiting the agent), reply to each one with `post_message` and continue with the rest of the work." The `MAPPING_AWAITING` variable carries the conversations that triggered the run. The server never wakes an agent.
- **Open a conversation** (`open_thread`) when faced with an ambiguity the specialization does not decide, instead of guessing or dropping the work; then carry on with the rest.
- **Answer where you were asked**, always with `after` (the id of the last message you read). If you get `stale-thread`, read the new messages and answer again.
- **Cite, do not repeat.** If another open conversation deals with the same subject, cite it with `[subject](mapping://<project>/c/<code>)` instead of redoing the work.
- **Linked proposal:** in `propose_changes`, pass `thread` so the proposal appears in the conversation.
- **Answer only what is asked of you.** A conversation that awaits the agent because the last message is from a person does not mean there is a question for you; and do not answer a conversation between people only without being called.
- **Never sign as a person and never resolve a conversation** (there is no tool for it): a person resolves it, in the app.

References accepted in texts and citations (URL only; project encoded as in `My%20Project`):

| Reference                                         | Points to                     |
| ------------------------------------------------- | ----------------------------- |
| `mapping://<project>/l/<code>`                    | layer                         |
| `mapping://<project>/c/<code>`                    | conversation                  |
| `mapping://<project>/a/<code>/f/<field>`          | field of an annotation        |
| `mapping://<project>/a/<code>/e/<code>`           | pair (entry) of an annotation |
| `mapping://<project>/a/<code>/f/<field>/r/<code>` | row of a table field          |

<!-- mapping:end -->
