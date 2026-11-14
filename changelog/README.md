# Changelog

One file per epic (or stage) merged into `main`, with what changed for people who use the app and the MCP server, in English. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The details of each stage are in the closed issues with the `in-progress` label (`em-andamento` until 2026-11-03) and, before them, in the git history.

## Rule

- The epic creates `changelog/<name>.md`, where `<name>` is the branch without `epic/`, with `[Não lançado]` in the title in place of the date.
- The closing renames the file to `changelog/AAAA-MM-DD-<name>.md` (`git mv`) and puts the same date in the title.
- The `epic` job of `ci.yml` fails if the PR from `epic/<name>` to `main` does not carry one of the two names.

## Format

The first line is:

```
# <Stage> — <AAAA-MM-DD | [Não lançado]> (épico `epic/<name>`, PR #<n>, MCP <version>, schema v<n>)
```

Then come the categories `## Adicionado`, `## Alterado` and `## Corrigido` (only the ones that have items), with bullets aimed at people who use the app and the MCP. An epic that only touches the delivery workflow (workflow skills, CI, `docs/FLOW.md`, `CLAUDE.md` rules) writes the categories for those who run the workflow (the owner and the agents). Old entries, from before the epics, keep only the fields they had.

## Order

- `ls changelog/` comes out in chronological order, with the unreleased ones at the end.
- Epics of the same day are in alphabetical order. The exact merge order is that of `git log --first-parent main`.

## Finding the MCP version of an epic

The version is in the first line of the file: `grep -m1 '^# ' changelog/*<name>.md`, or `grep -h '^# ' changelog/*.md` for all of them.

## Epic opened before this rule

If an epic opened with its section in the old `CHANGELOG.md`:

- its section becomes `changelog/<name>.md` (headings one level up: `##` → `#`, `###` → `##`);
- its row or its pending items in `DESIGN-SYSTEM.md` become `docs/design-system/<name>.md`;
- a conflict in a table of `docs/TESTING.md`: the epic's version stays, and `npx prettier --write docs/TESTING.md` is run.
