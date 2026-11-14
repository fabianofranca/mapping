# Capture density — 2026-11-12 (épico `epic/densidade-captura`)

## Pendências

- **Container Details** — **Density** field (D2, #1104): `Property` with a `Select` (**1x**, **1.5x**, **2x**, **3x**, **4x** and **Custom**, which opens a number `TextField` from 0.5 to 8 beside it, accepting comma or period, confirmed with Enter or on leaving the field), the suggestion hint in `muted` ("Suggestion: 3x (Phone 360 × 800)") and the small **Apply** button when the suggestion differs from the value; notice "Use a number from 0.5 to 8." under the field. It comes after **Drawing mode**. No new token (the usual `--space-*`, `--color-*`).
- **New container** — the same **Density** field (`Select` + number in "Custom", default 1x, without the suggestion or the Apply), after the **Background color**, with the explanation in `muted` under it; an invalid number blocks **Create container** with the same notice. No new token.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-12: version 82 (81 carried the two guides and 82 the index, with `lastChange`). Written: the `ContainerDialog` guide (**Density** field after the background color, `Select` + number in "Custom", default 1x, a 0.5 to 8 notice that blocks **Create container**, no suggestion or Apply) and that of the `MarkingPanel` (**Density** field in the container Details, after Drawing mode, with the suggestion in `muted` and the **Apply**). No new token, so contrast does not change: the new text only uses `muted` and `field-error`, already checked in the light and dark themes. No DS file was deleted.

## Ficou sem gravar

- The `components/ContainerDialog/preview.html` and `components/MarkingPanel/preview.html` previews without the **Density** field (still static, rendered from the app before the epic). Motivo: closing only touched the guides (hand-curated, only what the delivery changed); the previews are HTML rendered from the app and rewriting them requires opening the app in a browser, which this session did not do.
