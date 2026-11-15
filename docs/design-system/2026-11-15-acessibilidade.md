# Accessibility as a concept of the format — 2026-11-15 (épico `epic/acessibilidade`)

## Pendências

- **Notices window** (`src/ui/NoticesView.tsx`): a new **Accessibility** section, a `tbody` of the same table below the notice groups, with the `notices-group-row` header ("Accessibility" and "<n> warning(s)") and one row per `touch-target-small` warning (marking, layer, annotation and the size text, with "Go to"). It follows only **Only visible layers**; the kind filter and **Only notices in use** do not apply to it, and the empty-table text only shows when the table and the section are both empty. Existing pattern: no new component, token or icon; the guide of the Notices window needs the section.
- **Status bar** (`NoticesItem`): the count adds the annotations with a warning, once per annotation, to those with a specialization notice.
- **Details** (`MarkingPanel.tsx`): one `Notice` (`tone="warning"`, `size="sm"`) per warning of the marking, after the arrival notice, with the size in units and in image pixels at the container's density (no platform unit name). The pending item `accessible-label-missing` uses the existing status of the field and of the table cell (the part's name, and the row of a table part), and the **Incomplete** window lists it.

## Sincronização

Nothing to write to the **Mapping** artifact so far: phase A1 does not change a component, token or icon of the app.

## Ficou sem gravar

Nothing so far.
