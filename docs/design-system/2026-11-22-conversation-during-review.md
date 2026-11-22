# Conversation during review — 2026-11-22 (épico `epic/conversation-during-review`)

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

Phase CV4 (stage #1881), for the **Mapping** artifact:

- `Atalhos.md`: the **Conversation** window has no `Ctrl+Shift` number (the list has no line for it); `Shift+Esc` and `Ctrl+Shift+arrows` work on it as on any window, and `Esc` closes it with the focus inside, outside a field.
- `Layouts.md`: the right column stacks Details and **Conversation** (checked at 1280×720 and 900×720 in the tester's visual pass, with the review notice above the Details panel).

## Sincronização

Gravado no artefato **Mapping** on 2026-11-22: version 107 (new component), version 108 (content) and version 109 (index, id `1795353725-e3d5`). The new component went first (107), then the content (108), then the index with `lastChange` (109); the icon was uploaded to the asset store before them. The previews use the pt-BR text of the app and were checked in Chrome in the light and dark themes (the pairs are the existing tokens, no new color). CV1 to CV4 of stage #1881:

- **Written (CV1, version 107)** new component `ConversationWindow` (the Conversation window of the pending items; the folder name is the code name because a component folder must be an ASCII identifier): `README.md` and `preview.html` (`@dsCard` the Comments group, `height=1180`). The README covers the window in the right column under Details, the target that does not follow the selection, the empty state (also for a deleted conversation), the header with the state badge (CV2), the "on <where>" line, the new-conversation composer with Cancel, the resolved, no-identity and read-only states, the review behavior (Resolve, Reopen and the reply composer stay, the ⋯ has no Delete, " · linked to the proposal under review", card without a button; CV3), the visually hidden polite live region "New message from <name>" and the keyboard rules (no `Ctrl+Shift` number, `Shift+Esc`, `Ctrl+Shift+←/→`, `Esc`; CV4). The preview draws six states: empty, open, new, resolved, in review and no identity.
- **Written (CV1, version 108)** `ToolWindow` (`README.md`, `preview.html`, `height=2670`): the right column stacks Details and Conversation like the left one stacks Tree and Layers; the column carries the width; splitter in both columns with `clampStackedHeight` (96 px in the left column, 160 px each in the right one); `size-tw-conversation` (320px); Esc also closes Conversation. New preview section "Coluna da direita" (empty conversation; splitter in hover, return notice above Details and an open conversation).
- **Written (CV1, version 108)** `ToolStripButton` (`README.md`, `preview.html`): the right strip has Details and Conversation; the window without a shortcut has no `kbd` chip and no `aria-keyshortcuts`, the hint shows only the name (right strip drawn with the Conversation button).
- **Written (CV1, version 108)** `tokens.json`: `size-tw-conversation` (`320px`, after `size-tw-layers`), the 178th token (the file has 62 `size` tokens now).
- **Written (CV1, uploaded before version 108, indexed in 109)** icon `conversation` (two overlapping speech bubbles, 16 px grid, the three paths of `src/ui/icons.tsx`): `assets/Icons/conversation.svg` (347 bytes, asset `83a4360c13797884d73686e88e94a981`, after `chat.svg` in the group order), `assets/Icons/README.md` (93 icons, the `conversation` line in the Conversations group) and the brand book `README.md` (93 icons; Details and Conversation on the right).
- **Written (CV2, version 108)** `ThreadsSection` (`README.md`, `preview.html` redrawn, `height=580`): only a list (rows with `aria-current` on the conversation of the window, **New** in the header, empty text "No conversations on this item."); it no longer holds a thread or a composer; the old "standalone panel" cell and the `StandaloneThreadPanel` mentions are gone. States drawn: two conversations, a conversation of an annotation or field ("on Button › Radius", in the app's pt-BR text), empty, read-only without **New**, resolved conversation of the window kept in the list. `ThreadMessage`, `Composer` and `CommentPin` READMEs now point to the Conversation window instead of the Details section.
- **Written (CV3, version 108)** `ProposalCard` (`README.md`, `preview.html`, `height=600`): the card of the proposal under review shows "In review" with no button; after an agent revision also "Revised · N to check" (plural and singular drawn). Outside the review the states are unchanged.
- **Written (CV3, version 108)** `CommentsWindow` (`README.md`, `preview.html`): in the review no "Leave the review to chat" notice (the `.comments-notice` text is gone from the README and from the drawn state); a row opens the conversation in the Conversation window without changing the selection; **New conversation**, the row ⋯ and **Delete conversations…** stay hidden; the anchor is a button again in the drawn review state. `ThreadMessage` README: in the review `ThreadView` keeps the composer, **Resolve** and **Reopen**, and the ⋯ has no **Delete**.
- **Written (CV3, version 108)** `Notice` (`README.md`, `preview.html`, `height=1160`): the `Notice` in Details (review return), `info` tone, `sm` size, `proposal` icon, at the top of Details above any panel: "The proposal "<title>" is still open." with **Review** and the ghost **Dismiss** button. Drawn inside a Details window, in the `Notice` preview and in the `ToolWindow` right column.
- **Written (CV3, version 108)** `bundle.css`: `.conversation-empty`, `.conversation-view`, `.conversation-anchor`, `.thread-section-empty`, `.proposal-card-review` (and its `b`) and `.review-return-notice`, copied from `src/theme/editor.css` and `src/theme/threads.css`; the previews declare no extra class.
- **Written (CV4, version 108)** `Atalhos.md`: the Conversation window has no `Ctrl+Shift` number (no line in the list); `Shift+Esc` and `Ctrl+Shift+arrows` work on it as on any window; `Esc` closes it with the focus inside, outside a field (also in the Esc row of the Edit table).
- **Written (CV4, version 108)** `Layouts.md`: the right column stacks Details and **Conversation** (default height, minimums, return notice above the Details panel, checked at 1280×720 and 900×720 in the tester's visual pass) and the right strip has both windows.
- **Index (version 109)** `project/design-system.json`: the `conversation.svg` record and order and `lastChange` (`via` "Claude Code (épico conversation-during-review, #1881)").

Outside the artifact: the size line and the Map of `docs/DESIGN-SYSTEM.md` were updated at the closing (80 components with a guide, 178 tokens, 93 icons, artifact at version 109; new `ConversationWindow` row in "Components: conversations and comments").

## Ficou sem gravar

Nada.
