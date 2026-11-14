# Roles and external documents — 2026-11-05 (épico `epic/papeis-e-docs-externos`)

## Pendências

PD1 and PD2: none (format v11 and schema v14 do not change size, token, icon or component anatomy).

PD6 and PD7: none (MCP, examples, guide and documentation; no new screen). The captures of the PD3, PD4 and PD5 screens go into the tester's visual pass.

PD3:

- **Type list with search and groups** (`src/ui/TypePicker.tsx`, CSS in `src/theme/forms.css`): search field at the top (`TextField` with the text "Search among N types"), group headers (`h3`) in layer order, an "Other" block at the end and the state "No type matching \"<text>\"". The items (`.type-option` with `NoticeBadge`) do not change. No new icon.
- **Owner step with role** (`src/ui/AnnotationsPanel.tsx`): one option per owner and role ("Button Continue › Click") in the "Owner of the <type>" dialog, when the owner has `childRoles`; without roles, today's button per owner.

PD4:

- **"Link" dialog** (`src/ui/LinkDialog.tsx`): `Dialog` with the `TypePicker` (search and groups) restricted to the owner's set of children; title "Link to <owner>" or "Link to <owner> › <role>". It always opens, even with a single type. No new icon.
- **"Linked" by role** (`src/ui/AnnotationEditor.tsx`, `LinkedRow`): an owner with roles has one row per role (name, children, "+ Link…"), "none" on the empty role and the "No <label>" row with the pending mark; an owner without roles groups by layer with one "+ Link…". The direct "+ <type>" buttons go away.
- **Role `Select` on the child's card** (`src/ui/AnnotationEditor.tsx`): label from `childRolesLabel` (or "Role"), "Choose…" and the pending item (`missing-role`/`unknown-role`) when it is missing; it only appears when the owner has roles.
- **Texts in the List and in review** (`src/ui/ListView.tsx`, `src/ui/review/changeText.ts`): "↳ of Button Continue (Click)" in the List; the `parentRole` change (from → to, with the role label) and the `docRepo` entity in proposal review.

PD5:

- **Document section of the component page, in five states** (`src/ui/catalog/CatalogPage.tsx`, `src/ui/catalog/ExternalDoc.tsx`, styles in `src/theme/`): (1) the rendered document with the discreet "Open in repository" link; (2) the "Allow access to <repo>" button; (3) the message "<path> is not in <repo>" with the "Change folder…" button; (4) the "Connect the <repo> folder…" button; (5) with no folder picker or no `urlTemplate`, only the link or the text `<repo>: <path>`. The buttons are `Button` and the link is an `<a>` with the app's link style (`.external-doc-link`, `.external-doc-path` in `src/theme/catalog.css`), no new variant. No new icon.
- **"Repositories" dialog with the Documents section** (`src/ui/PlatformRepos.tsx`, CSS in `src/theme/layout.css`): the title goes from "Code repositories" to "Repositories", with the "Code" and "Documents" subsections; in Documents, a "Local path of the root" `TextField` for each `docRepos` repository. No new icon.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-05: version 39 (content, 9 files) and version 40 (index, only with the `lastChange`).

- **PD3:** `LayerGroup/README.md` describes the type choice (`TypePicker`: "Search among N types" search, group headers, "Other" block, state `No type matching "<text>"`) and the owner step with role ("Button Continue › Click").
- **PD4:** `LayerGroup/README.md` describes "Linked" by role, the "Link to <owner> [› <role>]" dialog and the role `Select` on the child's card; `Dialog/README.md` mentions the `LinkDialog`; `DataGrid/README.md` carries the List text ("↳ of Button Continue (Click)"); `ChangePopover/README.md` and `OtherChanges/README.md` carry the `parentRole` change and the document repositories in review.
- **PD5:** `CatalogPage/README.md` and the preview gained the Document section in the five states (height 2300 to 3300, estimated); `SettingsDialog/README.md` and the preview gained the "Repositories" dialog with the Code and Documents subsections (height 6000 to 6400, estimated).
- Tokens and icons: only the existing ones. `tokens.json` and `bundle.css` did not change. The previews declare the `.external-doc*`, `.repos-group` and `.repos-subtitle` classes in their own `<style>`.
- **Contrast:** no new color; visual check pending (below).

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: Own component for `TypePicker`, `LinkDialog`, `AnnotationEditor`/`LinkedRow`/`OwnerRoleField` and `PlatformRepos`: owner's decision, for the "With a visible shape and no component in the DS" list (`PlatformRepos` and `AnnotationEditor` are already in it).
- Passou para o registro do épico `epic/sincronia-ds-2`: `LayerGroup` preview without the PD3 and PD4 states (search with groups, rows per role, role `Select`), and no `LinkDialog` preview (the latter an owner's decision).
- Passou para o registro do épico `epic/sincronia-ds-2`: Visual check of the `CatalogPage` previews (five "External document" cards) and of `SettingsDialog` ("In the editor" card): contrast, heights and the link in the dark theme.
- Passou para o registro do épico `epic/sincronia-ds-2`: Classes missing from `bundle.css` (`.external-doc*`, `.repos-group`, `.repos-subtitle`, `.type-search`, `.type-section`, `.type-group-title`, `.linked-role-*`, `.annotation-linked-roles`) and the previews that declare them separately.
