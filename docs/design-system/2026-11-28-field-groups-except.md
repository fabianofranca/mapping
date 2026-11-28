# `except` in a slot's `accepts`; field groups and `visibleWhen` in Details — 2026-11-28 (épico `epic/field-groups-except`)

## Pendências

- **Field group subheading** (FG3, #2918): a new full-width row of the Details `PropertyGrid` (and of the Catalog Playground form). A ghost `sm` `Button` with a chevron (`chevronDown` open, `chevronRight` collapsed) and the group name, `aria-expanded`/`aria-controls`, and a `HelpTip` for the group's description; a `1px` `--color-border` rule below it. The group's rows follow in a `display: contents` wrapper, so the label/control columns hold. Open at the start; the state is per type and group for the session.
- **Hidden-fields line** (FG3, #2918): a full-width row at the end of the typed fields, "<n> hidden fields" in muted small text and a ghost `sm` **Show** / **Hide** `Button` (`aria-expanded`). Shows only while a condition leaves a field out.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-28: version 117. Both pending items went into the guides: `PropertyGrid` (new paragraphs for the group subheading and the hidden-fields line, plus the classes and `FieldGroups.tsx` in the "in the code" line) and `CatalogPage` (new Playground paragraph, pointing to the `PropertyGrid` guide). Only existing tokens (`color-text`, `color-text-muted`, `color-border`) and existing controls (ghost `sm` `Button`, `HelpTip`, `chevron-down`/`chevron-right` icons), so the contrast pairs are the ones already in the DS for both themes; no component, token or icon was added. Index `lastChange` filled.

## Ficou sem gravar

- Previews of `PropertyGrid` and `CatalogPage` do not draw the group subheading or the hidden-fields line. Motivo: the item asked for the guide text; the previews are large hand-curated documents (about 38 KB and 34 KB) generated from the app's rendering, and drawing the two new states without a browser to check the layout and the contrast in both themes would risk breaking them.
