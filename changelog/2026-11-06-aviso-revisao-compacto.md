# Review notices on one line — 2026-11-06 (epic `epic/aviso-revisao-compacto`, PR #643, MCP 0.22.0, schema v14)

## Alterado

- Review: the **new conflicts** notices ("1 new conflict(s)", with **Show conflicts**) and the **proposal superseded** notice ("Proposal superseded", with **Open the new one**) above the Proposals window list now take a single line, one control tall, with an **X**. The full sentence ("The project changed since your last session.", "This proposal was superseded by another one.") is in the text's tooltip and is still read by the screen reader. At the default height of the Proposals window (240 px), at 900×720 and at 1280×720, the list shows 2 whole rows with the notice (before, none) and 3 after the X.
- Review: the **X** hides the notice until you leave the review and moves focus to the list. The new-conflicts one comes back if another new conflict appears during the review (for example in an external reload); the superseded one comes back when the proposal is reopened. Nothing is saved in the project or in the review memory.
