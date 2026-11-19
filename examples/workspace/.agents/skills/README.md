# .agents/skills/

Skills in the Agent Skills format (`<name>/SKILL.md`), read by the tools that adopted the standard. `setup.sh` brings `spec-author` here, from the same release as the server (`SKILL.md`, with `sha256`), and keeps the `.claude/skills/spec-author` link for Claude Code (or, where links do not exist, a copy, which it updates on every run). To update the skill, run `setup.sh` again.

`watch-conversations` (source of the release's `watch-conversations.SKILL.md`) is the second skill, installed here by `setup.sh` with the same rules as `spec-author` (the `.claude/skills/watch-conversations` link, or a copy where links do not exist; `Watch skill:` line in the summary): ask "watch the conversations" and it starts `watch-comments.mjs --emit` so a conversation that waits for the agent wakes the same chat; "stop watching the conversations" stops it. See "Conversations" in the workspace `README.md`.
