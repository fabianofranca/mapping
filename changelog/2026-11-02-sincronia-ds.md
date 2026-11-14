# Design system sync — 2026-11-02 (epic `epic/sincronia-ds`, PR #287, MCP unchanged, schema v13)

## Adicionado

- `docs/DESIGN-SYSTEM.md`: the living record of the project's design system (the **Mapping** artifact in Claude Design, curated by hand). It brings the URL, the map from each DS component, section, token and icon to its origin in the code, the triggers that require checking the DS, the open pending items and the sync history.

## Alterado

- Workflow: every PR description now declares the **DS impact**, and the closing of each epic applies the pending items accumulated in the design system. The `epic` CI job requires the epic PR to touch `docs/DESIGN-SYSTEM.md`, as it already required `CHANGELOG.md`.
- The design system was brought up to date with the deliveries since 2026-10-24: Proposed with components, Suggestions in the text field, Remote images, Material 3 library and the **Wrap** of the Parent marking.
