# Perspectives in the guide and in the example — 2026-11-10 (epic `epic/guia-perspectivas`, PR #1419, MCP 0.29.0 unchanged, schema v18)

## Adicionado

- Interactive guide: step 14 **Perspectives** (Main, **New perspective…** with **Everyone on the project** and **Only me**, sending and removing items, only the position changes on drag, layers per perspective and the arrival with the "Came from…" badge and **Dismiss**) and the **Perspective** selector above the tabs (Main, Dados and Material 3): the choice filters the container tabs and turns off the chips of hidden layers. The perspectives and the arrival come from the example's `mapping.json`. The **Help** text now says 14 steps and mentions perspectives.
- Example project (`examples/exemplo-completo/` and the zip): two "For everyone" perspectives, **Dados** (Cadastro, Login and the "Cadastro" note, with Componentes, Eventos and Dúvidas hidden) and **Material 3** (Configurações and Detalhes do pedido), and one arrival: the "Cadastro" note appears in Main with the "Came from Dados" badge and "Arrivals: 1" in the status bar. The counts of images, markings, annotations, layers and specializations do not change.
- Script R11: R11.4 mentions the selector and the arrival, the new step R11.13 walks through Dados, Material 3 and **Dismiss**, and R11.14 walks through the guide's selector; R11.2 and R11.3 go to 14 steps.

## Corrigido

- The browser's benign warning "ResizeObserver loop completed with undelivered notifications" no longer goes to Diagnostics: with an arrival in Main (the example now has one) it lit the alert of the **Diagnostics** tab, which became 8 px wider and squeezed the tab strip of the bottom window.
