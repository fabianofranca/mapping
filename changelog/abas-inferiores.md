# Bottom window tabs and the Incomplete columns — [Não lançado] (épico `epic/abas-inferiores`, PR #0, MCP unchanged, schema v20)

## Corrigido

- The bottom-window tabs have an 8 px gap at every width; in a narrow bottom window (up to 470 px), Notices and Diagnostics show only their icon, with the counter or the alert dot (AI1, #2078).
- The bottom-window tabs' accessible names carry the count, separated by a space (`Incomplete 1`, `Notices 20`, `Comments 2`); the counter is `aria-hidden` (AI1, #2078).
- The Incomplete list shows the layer on a second line under the marking in a narrow bottom window, with ellipsized headers and the layer name tooltip (AI2, #2079).
- In the Notices window at 900×720 the five kind filters wrap inside the bottom window instead of spilling out ("Pending" no longer cut), the table headers end in an ellipsis with a `title`, and "Legacy" no longer breaks inside the word (CL1, #2189).
