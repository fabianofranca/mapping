# Comments window at width — 2026-11-08 (epic `epic/comentarios-largura`, PR #885, MCP 0.28.2 no change, schema v18)

## Alterado

- The bottom window (**Comments**, **List**, **Incomplete**, **Notices**, **Diagnostics**, **Proposals**) opens taller (360 px, before 208 px): at 900 × 720 **Comments** shows 4 whole rows of the list, with filters and header. The height you dragged before still applies.
- In the **User** filter of the **Comments** window, the first option is "Everyone" (before "Everyone (n)"); the person options keep the conversation count.

## Corrigido

- The **Comments** window fits the width it is in: no horizontal scrollbar and with the ⋯ menu of each row whole and clickable (it is the path to **Delete**), from 887 px down to the narrow 900 × 720 window with Tree, Layers and Details open.
- The status badge (**Waiting for human** and the others) stays inside the cell, with an ellipsis and the label in the tooltip when space runs out, and the **Status** column became wider; the **When** cell also cuts with an ellipsis.
- In a narrow window (under 640 px of window width), **Msgs** and **When** disappear and **By** shows only the avatar, with the name in the tooltip; Anchor, Last message, Status and the ⋯ remain.
- The tab strip of the bottom window fits whole at 900 × 720 (the first tab, **List**, is no longer cut off and the strip does not scroll): the tab count became tighter.
- At 900 × 720 the **Comments** window actually shows 4 whole rows of the list, also with long anchors wrapped onto two lines: in the narrow layout the filters sit on two rows of two (**Status** and **User**; search and **Citing selection**) instead of four stacked.
- In the **Resolved** tab (and in **All**), the anchor of a resolved conversation appears struck through and gray; before, the text was still underlined and dark.
- In the **Comments** window, the "unread" dot stays on the same line as the anchor (which cuts with an ellipsis): all rows have the height of one line and the 4 rows appear whole at 900 × 720, also with 4 conversations.
