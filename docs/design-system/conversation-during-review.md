# Conversation during review — [Não lançado] (épico `epic/conversation-during-review`)

## Pendências

Phase CV1 (stage #1881), for the **Mapping** artifact:

- `ToolWindow` and the `Layouts.md` section: the right column stacks Details and Conversation like the left one stacks Tree and Layers; the column carries the width; splitter in both columns (`clampStackedHeight`: 96 px in the left column, 160 px each in the right one); token `size-tw-conversation` (`320px`).
- `ToolStripButton`: the window without a shortcut (the hint shows only the name).
- Icon `conversation` (two overlapping speech bubbles, 16 px grid).
- New component `Janela Conversa`: for now only the empty state ("No conversation open. Choose one in Details, in Comments or on a pin."); the header, state badge, anchor line and live region come in the next phases.

Phase CV2 (stage #1881), for the **Mapping** artifact:

- `ThreadsSection`: now only a list (rows with `aria-current` on the window's conversation, **New** in the header, empty text "No conversations on this item."); it no longer holds a thread or a composer.
- `Janela Conversa`: header with the conversation's state badge (`StateBadge`, moved out of the thread head), body with the "on <where>" line, the thread and the composer (new-conversation composer with Cancel); the empty state also covers a deleted conversation.
- `StandaloneThreadPanel` removed from the component map (`CommentsWindow` and others rows).

Phase CV3 (stage #1881), for the **Mapping** artifact:

- `ProposalCard`: the card of the proposal under review shows "In review" with no button; after an agent revision it also shows "Revised · N to check" (singular "Revised · 1 to check"). Outside the review it is unchanged (Review, View or nothing).
- `CommentsWindow` in the review: no "Leave the review to chat" notice; a row opens the conversation in the Conversation window without changing the selection; **New conversation**, the row ⋯ and **Delete conversations…** stay hidden. `ThreadView` in the review keeps the composer, **Resolve** and **Reopen**, and the ⋯ has no **Delete**.
- `Notice` in Details (review return): `info` tone, small size, at the top of Details above any panel: "The proposal "<title>" is still open." with **Review** and a dismiss button.
- `Janela Conversa`: the anchor line gains " · linked to the proposal under review", and the polite live region ("New message from <name>") is visually hidden.

## Sincronização

Not synced yet.

## Ficou sem gravar

Everything above.
