# Quick review on the canvas — 2026-11-23 (épico `epic/quick-review`)

## Pendências

- **Decision 9 — ghost overlay (QR2):** a `Konva.Group` that does not listen to events, at the bottom of the existing `overlay` layer, drawing the created and changed markings with their real component drawing plus the review's marks (dashed "created" line with the `+` badge, double "changed" line and badge). A moved marking shows its ghost at the new position and the current one stays drawn.
- **Decision 10 — ghost look (QR2):** new token `opacity-ghost` (0.38) in `src/theme/tokens.ts`, light and dark; grey comes from a cached `Grayscale` filter.
- **Decision 14 — quick review bar (QR3):** `src/ui/review/QuickReviewBar.tsx`, mounted inside `<main class="canvas-area">` after the canvas host; header "Quick review · from <agent> · <counts>" plus the Revised flag; buttons Show on the canvas, Reject, Review… and Accept (primary); hint line; blocked state with a reason line and only Show on the canvas and Review….
- **Decision 15 — tag (QR3):** DOM tag at the ghost's top-left corner: "+ <name> · proposal" on the ghost and "How it looks · not applied" during the real-look peek.
- **Decision 16 — keyboard (QR3):** the bar is `role="group"` with a label; Tab order Show on the canvas, Reject, Review…, Accept; Enter and Space only activate the focused button; Esc in the bar is Reject; focus inside the bar shows the real look; a polite live region announces the ghost.
- **Decision 17 — toast (QR3):** text-only toast after Accept: "Proposal applied: “<title>”. Undo with Ctrl+Z." with no button.
- **Decision 20 — `ProposalCard` states (QR3):** "On the canvas: accept or reject it there" while the ghost shows, and "Rejected on the canvas · ask for a change here" with a Show on the canvas button after a Reject; Review stays in both.
- **Stacking and the card at the smallest window (CL2):** the bar sits after the corner notices and the minimap in the canvas area (same `--z-canvas-overlay`), so it is drawn above them; `barPosition` takes a free spot, else the one that covers the least. The proposal card keeps its icon beside the text and its buttons in one `.proposal-card-actions` row when they fit.
- **The card is not pinned to the end of the scroll (CL3):** the conversation scrolls as one body (messages, then the composer), so with replies after the card the end of the scroll shows them and the card sits above the scroll area; scrolling up shows it whole (110 px, same text). That is not a clip; a check of the card measures it scrolled into view, not at `scrollHeight`.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-23: version 111 (index at version 112). Written: the new `QuickReviewBar` component (guide and preview: bar, tag, keyboard, the toast after Accept, position and stacking at the smallest window), the `opacity-ghost` token in `tokens.json`, the ghost in `Canvas.md` and in the `CanvasMarking` guide, the two quick review states and the card layout in `ProposalCard` (guide and preview), the scroll note in the `ConversationWindow` guide, and short sections in `Revisao.md`, `Atalhos.md` and `Contraste.md`. Notes: the bar's Show on the canvas button is an icon-only `IconButton` (`locate`, label and tooltip); `opacity-ghost` is one value (0.38) in both themes; the bar's 1px `color-border-control` on `color-card` is 2.72:1 in dark over a white photo (3.13 in light over black), flagged in `Contraste.md` as the code's own pair.

## Ficou sem gravar

None.
