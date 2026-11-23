# Quick review on the canvas — [Não lançado] (épico `epic/quick-review`)

## Pendências

- **Decision 9 — ghost overlay (QR2):** a `Konva.Group` that does not listen to events, at the bottom of the existing `overlay` layer, drawing the created and changed markings with their real component drawing plus the review's marks (dashed "created" line with the `+` badge, double "changed" line and badge). A moved marking shows its ghost at the new position and the current one stays drawn.
- **Decision 10 — ghost look (QR2):** new token `opacity-ghost` (0.38) in `src/theme/tokens.ts`, light and dark; grey comes from a cached `Grayscale` filter.
- **Decision 14 — quick review bar (QR3):** `src/ui/review/QuickReviewBar.tsx`, mounted inside `<main class="canvas-area">` after the canvas host; header "Quick review · from <agent> · <counts>" plus the Revised flag; buttons Show on the canvas, Reject, Review… and Accept (primary); hint line; blocked state with a reason line and only Show on the canvas and Review….
- **Decision 15 — tag (QR3):** DOM tag at the ghost's top-left corner: "+ <name> · proposal" on the ghost and "How it looks · not applied" during the real-look peek.
- **Decision 16 — keyboard (QR3):** the bar is `role="group"` with a label; Tab order Show on the canvas, Reject, Review…, Accept; Enter and Space only activate the focused button; Esc in the bar is Reject; focus inside the bar shows the real look; a polite live region announces the ghost.
- **Decision 17 — toast (QR3):** text-only toast after Accept: "Proposal applied: “<title>”. Undo with Ctrl+Z." with no button.
- **Decision 20 — `ProposalCard` states (QR3):** "On the canvas: accept or reject it there" while the ghost shows, and "Rejected on the canvas · ask for a change here" with a Show on the canvas button after a Reject; Review stays in both.

## Sincronização

Not written yet: the closing writes the pending items to the **Mapping** artifact.

## Ficou sem gravar

None yet.

- **Stacking and the card at the smallest window (CL2):** the bar sits after the corner notices and the minimap in the canvas area (same `--z-canvas-overlay`), so it is drawn above them; `barPosition` takes a free spot, else the one that covers the least. The proposal card keeps its icon beside the text and its buttons in one `.proposal-card-actions` row when they fit.
