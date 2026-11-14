# Mappings folder (example)

Skeleton of a folder that centralizes Mapping projects and comes ready for any AI agent that speaks MCP: the server, the roots, the `spec-author` skill and the explanation for the agent (`AGENTS.md`) live inside the folder, by relative path. Each tool only gets a small configuration file pointing to the same command.

## How to use

1. Copy this folder wherever you like (e.g. `~/mappings`) and start a Git repository in it.
2. Run `./setup.sh` (needs Node ≥ 20 and `curl`). It downloads from the latest Mapping `mcp-v*` release the server (`tools/mapping-mcp.js`), the `spec-author` skill, the `AGENTS.md` rules, `watch-comments.mjs` (the conversation watcher, in the root) and the signature extractor (`tools/mapping-signature.mjs`), checks the `sha256` of all of them and only then updates the folder. For a specific version: `./setup.sh mcp-v0.5.0`; to test a release candidate or a PR build: `./setup.sh mcp-v0.5.0-rc.1` or `./setup.sh mcp-snapshot-pr172`.
3. Fill in the "What these mappings are for" section of `AGENTS.md`: it is what the agent cannot discover on its own.
4. Open the folder in the agent and approve the `mapping` server. Open the projects in the Mapping app as a **folder**, inside `projetos/`.
5. Version `tools/mapping-mcp.js` and its `.sha256` together: whoever clones has the server working without installing anything.

## Updating

Run `./setup.sh` again (or `./setup.sh <tag>`). Each run, in this order:

1. Downloads everything from the release (`mapping-mcp.js`, `mapping-signature.mjs`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` and `watch-comments.mjs`, each with its `.sha256`) to a temporary folder and **checks the `sha256` of all of them before replacing any file**. If one does not match, the script stops with an error and nothing in the folder changes.
2. **Updates itself.** If the release's `setup.sh` differs from the local one, it replaces the file at once, warns "setup.sh updated" and runs again, once only. `./setup.sh --no-self-update` (or `./setup.sh <tag> --no-self-update`) turns that off and carries on with the script you have. A release without `setup.sh` (an old tag): carries on with the current one and warns.
3. Replaces the server in `tools/`.
4. Brings the `spec-author` skill **from the same release as the server** to `.agents/skills/spec-author/SKILL.md` (if the release does not have it, it uses the one from `main` and warns). In `.claude/skills/spec-author`: if it is already a link, nothing; if it is a folder (a copy), copies again; if it does not exist, creates the link (and a copy where links do not exist).
5. Installs `watch-comments.mjs` in the workspace root, over whatever is there, with no backup (it is a managed file, like the server; do not edit it). A release without it (an old tag): warns and the local file, if any, stays.
6. Installs the extractor `tools/mapping-signature.mjs` (and its `.sha256`) next to the server, also with no backup; a release without it: warns and the local one stays. Usage: `node tools/mapping-signature.mjs kotlin --file … --symbol … [--path] [--ref] [--also] [--overload] [--out]`; it extracts the signature sheet that the agent passes to `plan_signature_import`.
7. Updates the rules block of `AGENTS.md`, described below.
8. Prints a summary: the server version, where the skill came from, what happened to `AGENTS.md` and the `Watcher:` and `Extractor:` lines (`installed`, `updated`, `no change` or `not updated (release without the …)`). Running twice in a row changes nothing the second time (and creates no backup).

### Workspace created before this

Whoever already has an old `setup.sh` runs this line **once**, in the workspace folder; after that `./setup.sh` updates itself:

```bash
curl -fsSL https://github.com/fabianofranca/mapping/releases/latest/download/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh
```

It only works after the first stable release that ships `setup.sh`; before that, use the release candidate: replace `latest/download` with `download/<tag>` and pass the same tag to `./setup.sh` (e.g. `…/releases/download/mcp-v0.25.0-rc.1/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh mcp-v0.25.0-rc.1`).

### `AGENTS.md` and the markers

The rules for the agent live in a **managed block**, between the lines `<!-- mapping:begin … -->` and `<!-- mapping:end -->`. `setup.sh` replaces only what is between them; **do not edit the block**, because the next update overwrites it. Everything outside the block is yours, starting with the "What these mappings are for" section.

- No `AGENTS.md`: creates one (title, an empty "What these mappings are for" section and the block).
- With the markers: replaces only the block.
- No markers and with the `AGENTS.md` of the old skeleton: keeps a backup `AGENTS.md.bak-YYYYMMDD-HHMMSS`, preserves the "Para que servem" section as it is and puts the block in place of the other sections.
- No markers and with an `AGENTS.md` the script does not recognize: keeps the backup, appends the block at the end and warns "review AGENTS.md: the old Mapping sections may have ended up duplicated".
- Broken markers (one without the other, out of order or repeated): does not touch the file and warns.

### What `setup.sh` touches and what it does not

Touches: `tools/mapping-mcp.js` and `tools/mapping-signature.mjs` (and the `.sha256` files), `.agents/skills/spec-author/`, `.claude/skills/spec-author`, `watch-comments.mjs` (in the root) and the `AGENTS.md` block (with the backup when the structure changes). **Never touches:** `projetos/`, `especializacoes/`, an existing `CLAUDE.md`, `.mcp.json` and the configurations of the other clients (you may have other servers registered in them).

### Security

The `sha256` comes from the same release as the files it checks: it protects against a corrupted or incomplete file, **not against a tampered release**. It is the same trust `mapping-mcp.js` already required: whoever publishes the Mapping release can change what your `setup.sh` downloads and runs. The script never runs anything that has not passed the check. Whoever prefers to pin the version of `setup.sh` itself uses `--no-self-update`.

### If GitHub does not respond

`setup.sh` shows the reason for each download failure, with the HTTP code, and retries twice when the failure may be temporary. If the direct download of the release answers 5xx, 429 or does not answer, it still tries the GitHub assets API (only `curl` and `node`, no `gh` and no token) and warns: `direct download failed (HTTP 504); using the GitHub assets API`. The `sha256` of all the files is checked the same way, and nothing changes if something fails. What each message means:

- `release … does not include <file> (HTTP 404)`: the release (or the tag you passed) does not publish the file; check the tag in [Releases](https://github.com/fabianofranca/mapping/releases);
- `GitHub did not respond (HTTP 5xx)`: GitHub is down; wait a few minutes and run again;
- `no response from <host> … Check the network`: DNS, connection or proxy; the `curl` text comes along;
- `HTTP <other code>`: the script does not interpret it (e.g. 401 and 403); the URL is in the message.

Last resort, if not even the API responds: download the release with `gh release download mcp-vX.Y.Z` into a folder and run `MAPPING_RELEASE_BASE=file://<folder> ./setup.sh mcp-vX.Y.Z`. Whoever still has an **old** `setup.sh` keeps hitting the failure until **one** download succeeds: the fix only arrives when the new script arrives through self-update (or through the line in "Workspace created before this"); for that, use the last resort above.

### Variables for testing only

`MAPPING_RELEASE_BASE` replaces the origin of the release (in place of `https://github.com/fabianofranca/mapping/releases/…`) and `MAPPING_RAW_BASE`, that of `main` (where the skill comes from if the release does not have it); both accept `file://` (with `MAPPING_RELEASE_BASE` set, the second path through the assets API is turned off). `MAPPING_GITHUB_BASE` replaces `https://github.com` (the direct download) and `MAPPING_GITHUB_API`, `https://api.github.com` (the second path), to point the script at a local server. They exist for the tests and for Mapping's tester, **do not use them day to day**: pointed at a place you do not control, they decide what the script downloads and runs. `MAPPING_SETUP_UPDATED` is internal (it marks the second round of self-update).

### Windows without WSL

`setup.sh` needs a POSIX shell. On Windows without WSL, do the steps by hand, with the files of the same release:

1. Download `mapping-mcp.js` and `mapping-mcp.js.sha256` into `tools/`, and check the `sha256` (`certutil -hashfile tools\mapping-mcp.js SHA256`).
2. Download `SKILL.md` into `.agents/skills/spec-author/` and copy that folder to `.claude/skills/spec-author/`.
3. Download `AGENTS.mapping.md` and paste its content (the lines from `<!-- mapping:begin … -->` to `<!-- mapping:end -->`) into your `AGENTS.md`, in place of the block that is already there (or at the end of the file, if it is the first).
4. Download `watch-comments.mjs` and `watch-comments.mjs.sha256` into the workspace root and check the `sha256` (`certutil -hashfile watch-comments.mjs SHA256`).
5. Download `mapping-signature.mjs` and `mapping-signature.mjs.sha256` into `tools/` and check the `sha256`.
6. The release's `setup.sh` is not needed; download it only if you will run it later in WSL.

## Conversations: waking the agent (`watch-comments.mjs`)

Anchored conversations live in `projetos/<project>/comments/` (format in Mapping's `docs/COMMENT-FORMAT.md`). The MCP server **never triggers an agent**: it only reads and writes conversations when the agent is already up. For the agent to wake up on its own when someone asks something, leave `watch-comments.mjs` (in the workspace root; `setup.sh` installs and updates it) running in a terminal (Node ≥ 20, no dependencies), passing the command that opens your agent after the `--`:

```bash
node watch-comments.mjs -- claude -p "There are conversations awaiting you in projetos/. Follow the Conversations section of AGENTS.md."
```

- Watches `projetos/*/comments/` and waits **5 s with no change** (`--quiet <seconds>` adjusts it) before acting.
- Only runs the command if there is an **open** conversation whose last message is from a person (it awaits the agent). A resolved conversation, or one that awaits a person, triggers nothing.
- Runs **one command at a time**: a change during the run waits for it to finish and is reevaluated. Each conversation and last-message pair is handled once, so a conversation the agent left unanswered does not become a loop.
- The command receives `MAPPING_AWAITING`, a JSON with `[{ "project", "thread", "path" }]` of the conversations that triggered the run. `--root <folder>` changes the watched folder (default: `projetos/` next to the script). Ctrl+C stops it.

## Where each tool reads its configuration

All of them point to the same command: `node tools/mapping-mcp.js --root projetos --root especializacoes`. The names change between versions; if a tool does not find the server, check its docs and adjust only the corresponding file.

| Tool              | MCP server              | Instructions                      | Skill                    |
| ----------------- | ----------------------- | --------------------------------- | ------------------------ |
| Claude Code       | `.mcp.json`             | `CLAUDE.md` (imports `AGENTS.md`) | `.claude/skills/` (link) |
| Cursor            | `.cursor/mcp.json`      | `AGENTS.md`                       | `.agents/skills/`        |
| Gemini CLI        | `.gemini/settings.json` | `AGENTS.md`                       | `.agents/skills/`        |
| Copilot (VS Code) | `.vscode/mcp.json`      | `AGENTS.md`                       | `.agents/skills/`        |
| Codex CLI         | `.codex/config.toml`    | `AGENTS.md`                       | `.agents/skills/`        |

## Two roots, not the whole folder

`projetos/` is where the server looks for `mapping.json` (at any depth). `especializacoes/` holds the sources of the specializations, which must be inside a root for `validate_specialization({ path })` and `apply_specialization` to read them. `.git/` and `tools/` stay out.

## Writing the solution from the markings

Each type's `code` says how to create an instance of it on each platform; the file that defines it lives in the specialization's repository (`repo`). The check that code files exist is confined to the directory where the client was opened. For that work (`get_code_hints`, `find_by_code`), open the agent in the code repository and register the server there with this folder as the root by absolute path:

```json
{
  "mcpServers": {
    "mapping": {
      "command": "node",
      "args": ["/path/mappings/tools/mapping-mcp.js", "--root", "/path/mappings/projetos"]
    }
  }
}
```

To map, review proposals and write specializations, open the agent in this folder.

## Reference

Server and tools: Mapping's `docs/MCP.md` and `docs/AGENT-GUIDE.md`. Specialization format: `docs/SPEC-FORMAT.md`. Skill: `.claude/skills/spec-author/SKILL.md` in the Mapping repository (the source of the `SKILL.md` that each release publishes and `setup.sh` brings).
