# Quick review on the canvas — [Não lançado] (épico `epic/quick-review`, PR #0, MCP 0.57.9, schema v23)

## Adicionado

- Quick review on the canvas: a small proposal linked to the conversation open in the Conversation window can be accepted in one write with one undo entry (Ctrl+Z brings the proposal back undecided) or rejected on this device, which writes nothing and hides it until the agent revises the proposal. This first part adds the eligibility rule (at most 5 markings in one container or on the canvas; creations and changes of markings and annotations; no removals), the quick review state of the open conversation, Accept and the Reject-on-this-device state. The second part draws the proposal on the canvas as a grey, translucent ghost with the review's created and changed marks (never selectable), shows the real result while the quick review bar has the pointer or the focus, and publishes the ghost's bounds for the bar. The bar and the card come in the next parts.
- Quick review bar fixes: at the smallest window the minimap and the corner notices no longer cover the bar (it moves beside or past them), the bar keeps its own width with the title on one line, and the "Rejected on the canvas" card keeps its text readable with **Show on the canvas** inside it, and the focus goes to the canvas after that button.

## Alterado

- The `dist/index.html` ceiling went up 16 KiB, from 2,441,216 to 2,457,600, by the budget rule.
- The `dist/index.html` ceiling went up 32 KiB, from 2,539,520 to 2,572,288, by the budget rule; above the limits, `bug` #2741 for the owner to review.
