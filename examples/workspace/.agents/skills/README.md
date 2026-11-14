# .agents/skills/

Skills in the Agent Skills format (`<name>/SKILL.md`), read by the tools that adopted the standard. `setup.sh` brings `spec-author` here, from the same release as the server (`SKILL.md`, with `sha256`), and keeps the `.claude/skills/spec-author` link for Claude Code (or, where links do not exist, a copy, which it updates on every run). To update the skill, run `setup.sh` again.
