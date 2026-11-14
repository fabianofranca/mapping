# Focus that is not lost and stable accessible names — 2026-11-05 (épico `epic/foco-e-nomes`, PR #535, MCP 0.16.0 unchanged, schema v13)

## Corrigido

- Review mark legend: `Esc` with focus on it closes it, the X is named "Close legend" and, on closing (by the X or by `Esc`), focus returns to the **Mark legend** button instead of being lost.
- Leaving the review: by the button or by the "Exit the review?" dialog (**Exit anyway**), focus goes to the proposal's **Review** or **Continue** in the Proposals window, or to the canvas if the window is closed.
- Going back from the library Catalog to the home screen (by Enter or by click): focus goes to **Open library**, and no longer to the page background.
- Details no longer closes when the window narrows from 1280 to 900 px: the side windows shrink but stay open. Only opening the app already in a window below 1200 px starts with Details collapsed.
- Row ⋮ menu (Details pairs, Layers and Tree): opens on the first click even when the row is out of view and the click makes the page or the list scroll; scrolling after it opens still closes the menu.
