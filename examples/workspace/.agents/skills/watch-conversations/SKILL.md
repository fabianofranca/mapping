---
name: watch-conversations
description: Watch the conversations of the Mapping projects in this chat, and answer each one that waits for the agent as it arrives, without starting a new agent. Use when asked to watch the conversations, or to stop watching the conversations.
---

# Watch the conversations

A background process (`watch-comments.mjs --emit`) prints one `MAPPING_WAKE <json>` line when a conversation comes to await the agent. The line wakes **this chat**; nothing is spent while waiting. **Never edit `watch-comments.mjs`**: `setup.sh` replaces it on the next update; pass the options below instead.

## Preparation

1. `pgrep -fl watch-comments`: if a watcher is already running, tell the person and do not start a second one (to restart it, follow "Stop" first).
2. Check that `watch-comments.mjs` is in the workspace root and that the `mapping` server answers (`list_projects`). Otherwise run `./setup.sh` and try again.
3. Take the **projects root** from the client configuration: the first `--root` of the `mapping` server in `.mcp.json` (Claude Code) or `.cursor/mcp.json` (Cursor). Use it as `<root>` below (an older workspace may have `projetos`).

## Answer what is already waiting

The watcher fires on start for conversations that already wait, so answer them first: `list_threads` (no filter), then, for each one, `get_thread` and `post_message` with `after` (see "On wake").

## Start

The command is the same in both clients:

```
node watch-comments.mjs --emit --state .mapping-watch/state.json --quiet 1 --root <root>
```

The state file keeps a restart from repeating wakes, and a pair that arrived while the watcher was down fires on the restart. Logs go to stderr and do not wake the agent.

### Claude Code

Run the command with the `Monitor` tool, with `timeout_ms` 1800000 (the maximum). Each stdout line is a notification in this chat. When the monitor expires, run `list_threads` and answer what waits, then **re-arm** with the same command.

### Cursor

Run the command with `exec` in front, in the shell tool in the background (`block_until_ms: 0`), with `notify_on_output.pattern: ^MAPPING_WAKE` and `debounce_ms: 5000`. Without `exec` the watcher dies when the shell exits. If the workspace path ends with a space, use a quoted `cd` or a symlink without the space.

Tell the person that the watching is on, and how to stop it.

## On wake

1. `list_threads` (no filter): the open conversations that await the agent.
2. For each one: `get_thread`, then, only if the mapping has to change, `plan_changes` and `propose_changes` (with `thread`) or `revise_proposal`, then `post_message` with `after` = the id of the last message read.
3. On `stale-thread`, read the conversation again and answer again; nothing was written.
4. Answer only what is asked of you. Never resolve a conversation and never sign as a person. Short sentences, in the conversation's language.

## Stop

- Claude Code: `TaskStop` on the monitor. The watcher also exits by itself when `Monitor` closes its pipes (stdin ends or stdout breaks), so nothing is left running.
- Cursor: `pkill -f watch-comments.mjs`.
- Or the person says "stop" in the chat: do the one for the client in use, then check with `pgrep -fl watch-comments`: it must print nothing. If a process is left (an older `watch-comments.mjs`), end it with `pkill -f watch-comments.mjs`.

## Limits

- The client and this chat must stay open. A long chat costs more with each answer: open a new chat and run the skill again.
- Latency: about 1 s from the watcher, plus the time the agent takes to write.
- Plan B, for a client without output notifications: the `wait_for_comment` loop of the agent guide (it spends tokens on every round).
