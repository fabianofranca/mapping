# Change proposal format (`formatVersion` 9)

Every change made by an agent arrives as a **proposal**: the user reviews the differences, accepts or rejects at any level, and leaves notes; only what was accepted is applied to `mapping.json`. This document describes the proposal file and the review rules. The project format is in [`FORMAT.md`](FORMAT.md).

The feature is generic: the core does not know where the data comes from. Validation (zod) and all the rules live in `src/model/` (`proposal.ts`, `proposalChanges.ts`, `proposalReview.ts`, `proposalApply.ts`, `proposalCompare.ts`, `proposalRevise.ts`), as pure functions used by the app and by the MCP server.

## Where it lives

```
meu-projeto/
├── mapping.json
├── images/
└── proposals/
    └── 8c1f…/                # proposal id
        ├── proposal.json
        ├── images/           # new or replaced images, until they are accepted
        │   └── checkout.webp
        └── specs/            # new or updated library package (Library stage)
            └── material3/
                ├── material3.spec.json
                ├── components/
                └── …
```

- One folder per proposal, `proposals/<id>/`, with the `proposal.json`. The id only uses `[A-Za-z0-9._-]` and does not start with a dot (it becomes a folder name).
- Container without a file: the creation carries the whole container with `file: null` and `background`, with no file to move; `background` and `size` only exist as `update` fields when the container has no file on both sides (with a file, the size comes from the file replacement, field `file`).
- New or replaced image (container with a file): the change carries the final path (`images/checkout.webp`) and the file waits in `proposals/<id>/` plus that path (`proposals/<id>/images/checkout.webp`). When applying, it is moved to its final place.
- Library package (specialization `formatVersion` 4, a folder with `components/`, `docs/`, `examples/` and `fonts/`): the change is the usual specialization change (`entity: "specialization"`, `to = { id, version, file, spec }`), with `to.file` inside a folder (`specs/material3/material3.spec.json`). The package files wait in `proposals/<id>/` plus the final path (`proposals/<id>/specs/material3/components/botao.json`). The source of truth of the specialization is `to.spec`: its file in the proposal folder may be missing and, if present, it is ignored. When applying, the files are **copied** (not moved) to `specs/<folder>/`, which the session rewrites whole together with `mapping.json`; they stay in the proposal until it is deleted, so undoing and redoing do not touch them.
- Proposals live in the project folder, versioned in git along with everything else, and go into the exported zip, together with the files waiting for acceptance (images in `proposals/<id>/images/` and packages in `proposals/<id>/specs/<folder>/`, binaries included; those of changes already applied do not go). When reading the zip, only paths of these two kinds are accepted, with a valid id and without `..`.

## Who writes what

- **MCP server** (`propose_changes`, `withdraw_proposal`, `revise_proposal`): creates the folder and the `proposal.json` (`status: open`, `revision: 0`, no decisions or notes, `formatVersion` 4) and, afterwards, changes the `status` (`superseded` when an **open** proposal is superseded, `withdrawn` when it is withdrawn; an `applied` one that is superseded does not change) and writes the **agent revision** (`revise_proposal`: `changes`, the `decisions` of the replaced and withdrawn changes, the `notes` of the withdrawn ones, `revisions` and `formatVersion` 5; see "Agent revision"). It always rereads the file before writing and writes with `revision + 1`. It never writes `mapping.json`. In the `operations` field the `base64` content of images is replaced by a placeholder (the image is already in `proposals/<id>/images/`).
- **App**: writes `decisions`, `notes`, `applied` and the `status` as the user reviews and applies, keeping the file's `formatVersion` (and `revisions`, if present); it is the only one that writes `mapping.json`.

## Format versions

- **`formatVersion` 9** (marking anchor, schema v20): this is the version that **creation** and the **agent revision** write **only when the proposal uses the anchor** (`PROPOSAL_ANCHOR_FORMAT_VERSION` is 9; `proposalUsesAnchor(changes)` decides: the **`anchor`** field of a marking, `update` with the anchor value or `null`, and the `anchor` inside the value of a created or removed marking; a proposal that is already on 9 stays on 9, and 9 also applies to proposals that use direction, density, or drawing mode). The value is `{ to, side?, align?, offset?: { main, cross } }` (`to` is the id of the anchor; whatever is missing takes the component defaults). **`snap_to_anchor` does not raise the version:** it is just the usual Position (`rect`) change. The file shape is that of 8. **Why a new version:** an earlier app or MCP would reject the `anchor` field, but would **silently discard** the `anchor` inside the value of a created marking (zod ignores the unknown key) and would apply the proposal without the anchor; with 9 they **reject the file** (`formatVersion` must be 1 to 8). Whoever writes it has to read it; versions 1 to 8 are still read and applied as always.
- **`formatVersion` 8** (reading direction, schema v20): this is the version that **creation** and the **agent revision** write **only when the proposal uses direction** (`PROPOSAL_DIRECTION_FORMAT_VERSION` is 8; `proposalUsesDirection(changes)` decides; a proposal that is already on 8 stays on 8, and 8 also applies to proposals that use density or drawing mode). It carries the container's **`direction`** field (`update`, value `"ltr"`, `"rtl"` or `null`, `null` = goes back to following the project), the `direction` inside the value of a created or removed container (only when set) and the `direction` (`"ltr"` or `"rtl"`, only when set) inside the `from`/`to` of the **`project`** entity, which becomes `{ drawingMode: string | null, direction?: "ltr" | "rtl" }`: the entity is replaced whole when applying, so the absence of `direction` in `to` removes the project's direction. The file shape is that of 7, with `revisions` **optional**. **Why a new version:** an earlier app or MCP would **silently discard** the `direction` inside the value of a created container and inside the `project` entity (zod ignores the unknown key) and would apply the proposal without the direction; with 8 they **reject the file** (`formatVersion` must be 1 to 7). Whoever writes it has to read it; versions 1 to 7 are still read and applied as always.
- **`formatVersion` 7** (container density, schema v19): this is the version that **creation** and the **agent revision** write **only when the proposal uses density** (`PROPOSAL_DENSITY_FORMAT_VERSION` is 7; `usesDensity(changes)` decides; 7 also applies to proposals that use drawing mode). It carries the container's **`density`** field (`update`, value a number from 0.5 to 8 or `null`, `null` = goes back to 1) and the `density` inside the value of a created or removed container (only when declared). The file shape is that of 6, with `revisions` **optional**. **Why a new version:** an earlier app or MCP would reject the `density` field, but would **silently discard** the `density` inside the value of a created container (zod ignores the unknown key); with 7 they **reject the file** (`formatVersion` must be 1 to 6). Whoever writes it has to read it; versions 1 to 6 are still read and applied as always.
- **`formatVersion` 6** (drawing mode, schema v18): this is the version that **creation** and the **agent revision** write **only when the proposal uses drawing mode**; without it, creation stays on 4 and revision on 5 (`PROPOSAL_FORMAT_VERSION` stays 4, and `PROPOSAL_DRAWING_MODE_FORMAT_VERSION` is 6; `usesDrawingMode(changes)` decides). It carries: the **`project`** entity (`entityId` `"project"`, only `update`, `field` `null`, `from`/`to` = `{ drawingMode: string | null }`; it belongs to the Project group, with `imageId` and `markingId` null), the container's **`drawingMode`** field (`update`, value `string | null`, `null` = goes back to following the project) and the `drawingMode` inside the value of a created or removed container (only when set). The file shape is that of 5, with `revisions` **optional** (the agent revision on a 6 proposal stays 6 and writes the history). **Why a new version:** an earlier app or MCP would reject the `project` entity and the `drawingMode` field (a read error, never a partial application), but would **silently discard** the `drawingMode` inside the value of a created container (zod ignores the unknown key) and would apply the proposal without the mode; with 6 they **reject the file** (`formatVersion` must be 1 to 5). 6 has to be read by whoever writes it; versions 1 to 5 are still read and applied as always.
- **`formatVersion` 5** (agent revision): this is the version that the **agent revision** (`revise_proposal`) writes. The file shape is that of 4, with one extra field at the root, **`revisions`**, the history of the agent's revisions, from oldest to newest (see "Revision history"). **Only the agent revision writes 5:** creation (`propose_changes`) still writes 4; the app, when rewriting decisions and notes, keeps the file's version; a 4 proposal becomes 5 on the first revision. **Why a new version:** an old app in cache would read the revised proposal without the mark and would discard `revisions` when rewriting; worse, reviewing at the same time as the agent, it would redo the person's decision on content they did not see. With 5, the old app **rejects the file** (`formatVersion` must be 1, 2, 3 or 4) and never overwrites it (today's rule for a file that changed and became unreadable). An old MCP server lists the proposal in `broken`. Versions 1 to 4 are still read and applied as always.
- **`formatVersion` 4** (position of the created marking): this is the version that **creation** (`propose_changes`) writes. The file shape is that of 3, with one extra field, **`insertBefore`**, only in the marking creation change (see "Position of the created marking"). **Why a new version, and not an optional field in 3:** an old app in cache would read 3, discard the field when rewriting the decisions and apply the proposal with the hierarchy inverted, with no warning; with 4 it **rejects the file** (`formatVersion` must be 1, 2 or 3). 4 has to be read by the app and by the MCP server at the same version that writes it. Versions 1 to 3 are still read and applied as always: an `insertBefore` that shows up in them is ignored, and whoever rewrites them (the app, when recording the decisions) keeps the file's version.
- **Schema v14 (roles and external documents) does not raise the version.** It is still `formatVersion` 4. The annotation's `parentRole` field (in the field change and inside the whole annotation of creation and removal) and the `docRepo` entity only exist in a v14 project, and an earlier app or MCP opens the v14 project **read-only** (`readOnly`; the app blocks "Apply accepted" (`read-only`) and the MCP rejects the batch), so no reader applies the proposal without understanding the v14 project. The proposal lives in the project folder and is read together with `mapping.json` (`loadProposals` in the app, `proposalStore` in the MCP); a proposal with `docRepo` or `parentRole` on an old reader gives a proposal read error, never a partial application. A proposal written before v14 (annotation creation without `parentRole`) is read as having no role (`parentRole: null`). An empty `parentRole` in the field change is a read error.
- **`formatVersion` 3** (no inheritance and with containment by geometry, schema v13): was the version written until the position of the created marking. The file shape is that of 2, with: `inherit` out of the `annotation` fields (in the change and in the whole annotations of creation and removal); the canvas marking (`containerId` null) and the **`canvas`** review level; the composite **`space`** change; **`floating`** compared; **`parentId` out of the comparison** (see "Canvas marking and containment"); and the **`arrow`** entity (the arrow), only with creation and removal (see "Arrow").
- **Old proposal with `parentId`.** A `formatVersion` 1 or 2 proposal with a marking `parentId` field change is read with that change **discarded**, along with the decision, the application and the note attached to it (the note moves to the proposal level), and the read returns a warning (`warnings`). The parent is now always recomputed from the geometry when applying. Old marking creations and removals without `floating` are read as `floating: false`. Separate `containerId` and `rect` changes of the same marking (the old way of changing space) **are still applied**, each on its own and as they are; the settle that comes right after redoes the space and the parent from the geometry (if only one of the two is accepted, the result is what the geometry gives, not necessarily that of the proposal).
- **Old proposal with `inherit`.** A `formatVersion` 1 or 2 proposal with an `inherit` field change is read with that change **discarded**: its decision and application go with it, and a note attached to it moves to the proposal level. The `inherit` field of the whole annotations of creation and removal is also removed. The read returns a warning (`warnings`; in the MCP, `proposal_review` shows `warnings` with `code: 'proposal-field-ignored'`; in the app, the warning goes to Diagnostics).
- **`formatVersion` 2** (container): was the version written until schema v12. The file shape is the same as 1; what changes is the vocabulary of the `operations` sent by the agent (kept for reference only). Those of the MCP server 0.8.0 batch are `add_container` (with a file: `file` or `base64`; or with only a background: `width`, `height`, `background`; plus `name?`, `source?`, `center?`, `as?`), `update_container`, `replace_container` and `delete_container` (argument `container`), and `create_marking` with `container`.
- **`formatVersion` 1**: is still **read** and applied. An old proposal with `add_image`, `add_blank_image`, `update_image`, `replace_image` or `delete_image` in the `operations` is valid as is (the `operations` are for reference only; the review and the application use the `changes`).
- **The old operations are accepted with a warning.** In the batch (`plan_changes`/`propose_changes`) `add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image` and the `image` argument of `create_marking` have the same effect as the new ones, but the result carries in `warnings` a `deprecated-op` notice ("add_blank_image is deprecated: use add_container", and so on). New proposals come out with `formatVersion` 4 and are born from the new operations. The acceptance of the old ones lasts one server version.
- **The written names did not change with schema v12.** The `proposal.json` still calls the container `image` in the names that already existed: `entity: "image"`, the change's `imageId` header (the container where it appears), the `image` level of the `reviewTree` and of the notes' `target`, and the container's `file`/`background`/`size`/`placement`/`markingColor` fields. The only change is in the **marking** values: in the v12 `mapping.json` it points to the container by `containerId` (it was `imageId`), and so the marking creation and removal carry `containerId` in the whole value, and the field change is `field: "containerId"`. The read accepts proposals written before (format 1 or 2) with `imageId` inside the marking value and converts them to `containerId` on its own.

## Example

```json
{
  "format": "mapping-proposal",
  "formatVersion": 4,
  "id": "8c1f2d9e",
  "title": "Checkout from Figma",
  "description": "Screens of the Checkout page of the Store v3 file.",
  "origin": "Figma: Store v3 › Checkout",
  "author": "Claude Code",
  "createdAt": "2026-10-09T12:00:00.000Z",
  "baseRevision": 41,
  "supersedes": null,
  "status": "open",
  "revision": 0,
  "operations": [],
  "changes": [
    {
      "id": "c1",
      "kind": "update",
      "entity": "marking",
      "entityId": "3f2a",
      "imageId": "9b1c",
      "markingId": "3f2a",
      "field": "rect",
      "from": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "to": { "x": 10, "y": 32, "width": 300, "height": 80 }
    }
  ],
  "decisions": { "c1": { "state": "rejected", "at": "2026-10-09T12:30:00.000Z" } },
  "notes": [
    {
      "id": "n1",
      "target": { "level": "change", "id": "c1" },
      "text": "The old position was right.",
      "at": "2026-10-09T12:30:00.000Z"
    }
  ],
  "applied": {}
}
```

## Root fields

All are required (the "empty" value is `null`), **except `revisions`**, which only exists in `formatVersion` 5 (required) and 6 (optional).

| Field           | Type             | Description                                                                                                                                                           |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | string           | Always `"mapping-proposal"`.                                                                                                                                          |
| `formatVersion` | `1` to `6`       | Format version. 4 is that of creation, 5 that of the agent revision and 6 that of whoever uses drawing mode; the earlier ones are still read (see "Format versions"). |
| `id`            | string           | Proposal id (name of the folder in `proposals/`).                                                                                                                     |
| `title`         | string           | Title (not empty).                                                                                                                                                    |
| `description`   | string or `null` | Description.                                                                                                                                                          |
| `origin`        | string or `null` | Where the data came from (free text).                                                                                                                                 |
| `author`        | string or `null` | Who sent it (e.g. the agent's name).                                                                                                                                  |
| `createdAt`     | string           | ISO 8601 date (UTC).                                                                                                                                                  |
| `baseRevision`  | integer ≥ 0      | `revision` of the `mapping.json` on which the changes were computed.                                                                                                  |
| `supersedes`    | string or `null` | Id of the proposal that this one replaces.                                                                                                                            |
| `status`        | string           | `open`, `applied`, `superseded` or `withdrawn` (see "States").                                                                                                        |
| `revision`      | integer ≥ 0      | Write counter of the proposal file, with the same check as `mapping.json` (`FORMAT.md`).                                                                              |
| `operations`    | array            | The operations sent by the agent, for reference only. The review and the application use the `changes`.                                                               |
| `changes`       | array            | The changes (below).                                                                                                                                                  |
| `decisions`     | object           | Decision of each change, by id: `{ "state": "accepted" \| "rejected", "at" }`. Absent = no decision.                                                                  |
| `notes`         | array            | Review notes: `{ id, target: { level, id }, text, at }`.                                                                                                              |
| `applied`       | object           | Changes already made effective in the project, by id: `{ "at" }`. Only an accepted change can be here.                                                                |
| `revisions`     | array            | The history of the agent's revisions (below). **Only in `formatVersion` 5**, where it is required; before it, it does not exist.                                      |

### Revision history (`revisions`)

In `formatVersion` 5, each agent revision appends an entry to the end of `revisions` (oldest first). The history is a record only: the review and the application use the `changes`, and the root `baseRevision` remains that of creation.

```json
"revisions": [
  {
    "at": "2026-11-07T10:00:00.000Z",
    "baseRevision": 43,
    "operations": [],
    "changed": { "c3": { "to": "Screen title", "state": "rejected" } },
    "added": ["c9"],
    "dropped": [
      { "change": { "id": "c4", "kind": "update", "…": "…" }, "state": null, "notes": ["n2"] }
    ]
  }
]
```

| Field          | Description                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`           | ISO 8601 date (UTC) of the revision.                                                                                                                                                        |
| `baseRevision` | `revision` of the `mapping.json` on which the revision was computed.                                                                                                                        |
| `operations`   | The operations of the revision batch, for reference only (the images' `base64` is replaced by the placeholder, as at the root).                                                             |
| `changed`      | By id of the replaced change: `{ to, state }`, the `to` and the decision **from before** this revision. `state` is `"rejected"` or `null` (no decision); an accepted one is never replaced. |
| `added`        | The ids of the new changes.                                                                                                                                                                 |
| `dropped`      | The withdrawn changes: `{ change, state, notes }`, the whole change as it was, the decision from before and the ids of its notes that moved to the proposal level.                          |

## Changes

Whoever sends the proposal applies the operations to a copy of the project (with the pure operations of `src/model/`) and compares before and after entity by entity, field by field (`computeChanges` / `buildProposal`). Each change stores the value **before** (`from`, at the time of the proposal) and the value **after** (`to`).

| Field          | Description                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | `c1`, `c2`… (unique in the proposal).                                                                                                                                                                                                                                                                                                            |
| `kind`         | `create`, `update` or `remove`.                                                                                                                                                                                                                                                                                                                  |
| `entity`       | `specialization`, `platformRepo`, `docRepo`, `project` (the drawing mode, `formatVersion` 6), `layer`, `image` (the **container**: the name stayed in the format), `marking`, `arrow` (the arrow) or `annotation`.                                                                                                                               |
| `entityId`     | Entity id; in the code repository, the platform id; in the documents repository, the id in the specialization's `docRepos`.                                                                                                                                                                                                                      |
| `imageId`      | Container where the change appears in the review. `null` with `markingId` null: the Project group (specializations, repositories and layers); `null` with `markingId`: a canvas marking (and its annotations), the **Canvas** group.                                                                                                             |
| `markingId`    | Item (marking or arrow) where the change appears: the marking itself, the arrow itself, or the owner of the annotation (`null` in containers and in the Project group).                                                                                                                                                                          |
| `field`        | Changed field; `null` in creation, removal and in the change of a specialization or repository (which carry the whole entity).                                                                                                                                                                                                                   |
| `from`         | Creation: `null`. Removal: the whole entity. Change: the value of the field before.                                                                                                                                                                                                                                                              |
| `to`           | Creation: the whole entity. Removal: `null`. Change: the value of the field after.                                                                                                                                                                                                                                                               |
| `insertBefore` | Only in **marking creation** (`formatVersion` 4), optional: the id of the base marking before which the created one enters the `markings` array, or `null` (see "Position of the created marking"). In any other change, or with a value that is neither an id nor `null`, the read gives an error with the path (`changes[3].insertBefore: …`). |

- **Creation**: one change with the whole entity, in the `mapping.json` format. The id is already the **final** one: notes, dependencies and later proposals can cite it.
- **Removal**: one change per entity. The model's cascade (children and annotations of a marking, linked annotations, markings of a container…) appears as separate removals, tied by dependency.
- **Change**: one change per field:

| Entity              | Fields (`field`)                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image` (container) | `name`, `file` (the replacement: `{ file, width, height }`), `background` (`#RRGGBB` color) and `size` (`{ width, height }`) only in a container without a file, `placement`, `markingColor`, `locked`, `source`                                                |
| `marking`           | `name`, `space` (`{ containerId, rect }`, the space change), `rect` (without a space change), `floating`, `locked`, `source`, `position` (index among the siblings); `containerId` alone only in an old proposal                                                |
| `annotation`        | `name`, `parentAnnotationId`, `parentRole` (v14: the id of the role on the owner, or `null`), `markingId`, `layerId`, `values.<key>` (a field of the typed one), `entries.<id>` (a pair of the free-form one: `{ key, value }` or `null` = absent pair), `type` |
| `layer`             | `name`, `color`, `spec`, `position` (index in the list)                                                                                                                                                                                                         |
| `specialization`    | — (`field: null`; `from`/`to` = `{ id, version, file, spec }`, with the specialization content in `spec`)                                                                                                                                                       |
| `docRepo`           | — (`field: null`; `from`/`to` = `{ localPath }`, the local clone of the documents repository, v14; like `platformRepo`, only in a v14 project)                                                                                                                  |
| `platformRepo`      | — (`field: null`; `from`/`to` = `{ localPath }`, the local override of the clone; the read ignores the `urlTemplate` of old proposals)                                                                                                                          |

- `values.<key>` absent is `null`. A table (`table`) changes whole, in a single change.
- `type` is the **type change** of an annotation (e.g. typed converted to free-form when removing a specialization): `{ type, values, entries }` change together, in a single change, without separate `values.*` or `entries.*`.
- `position` only appears in layers whose **relative order** changes (creating or removing another layer does not generate `position`). In a layer created by the proposal itself, `from` is `null`.
- A marking's `position` is the index among its **siblings** (same space, the container or the canvas, and same `parentId`; 0 = the first, drawn at the bottom) and it also only appears when the relative order of the siblings changes: creating or removing another marking does not generate `position`, and neither does a created marking that is born already in the order of the proposed project (in the place `insertBefore` gives, or at the end). If the created one needs to come before some sibling, it carries `position` with `from` `null`. Applying reorders like the app's reorder action (index clamped to the valid range) and there is a conflict if `from` does not match the current position. The `position` changes of the **same group of siblings** are applied **together**: the repositioned ones leave the group and come back in increasing order of `to`, each at index `to` among the siblings (clamped to the range); a lone `position` (partial acceptance) gives the same as an isolated reorder.
- They do not become changes: the `parentId` (derived, see "Canvas marking and containment"), the order of the pairs within the list, `needsReview` (the review is itself the check; creation carries the proposed value) and `project.updatedAt`.
- Order of the changes: Project group (specializations, code and documents repositories, layers), containers, markings, arrows and annotations; in each collection, the order of the proposed project and, at the end, the removed ones. Applying everything appends the created entities in the same order as the proposed project (the marking, in the place of `insertBefore`).

### Position of the created marking

A marking's parent comes from the geometry, and the tie (equal rectangles, or candidates of the same area as parent) is decided by the current relation and, in a new tie, by the order of the `markings` array (`settleHierarchy`). That is why creation carries the place in the array where the marking enters: **`insertBefore`** is the id of a marking **from the base** (which, being in the proposed project, the proposal does not remove) and the created one enters before it. Absent or `null`, the created one goes to the end. What the anchor **guarantees**: in the array the applier builds (the base order, with the created ones at the anchors), the settle's ties come out as in the proposed project, and the ones created with the same anchor enter in the order of the proposed project.

- **Why the anchor is a base marking:** each change is decided separately, and a created one may be rejected; the base marking only disappears if its removal is accepted, and then the created one goes to the end. An anchor that does not exist in the base (or in the list, when applying) is not a read error: the created one goes to the end.
- **Application** (`patchProject`): the created one enters before the anchor, if it is in the list after the removals, and at the end if it is not; several created ones with the same anchor stay in the order of the changes, which is that of the proposed project. All of this happens **before** the settle and the `position` changes, so the tie-break is that of the proposed project.
- **Computation** (`computeChanges`): chooses the anchor of each created one and emits the `position` over the same array the applier builds, already settled, so only the missing `position` comes out: wrapping (`wrap_items`) does not carry `position` for the created one or for the wrapped one, and two created ones before the same anchor do not carry an extra `position`.
- **Guarantee:** applying all the changes gives the **same `parentId`s** (markings and containers) and the **same order among siblings** as the proposed project, with or without reordering (`position` coming from `move_marking` or `reorderMarking`) in the batch. The global order of the `markings` array outside the siblings (the place of a child among markings of other groups) may differ.
- **Known limit (#625):** if, in the same batch, a tie between markings that already existed in the base was decided by an intermediate step that the proposal does not record (a marking resized and then another that reaches the same area, or a `move_marking` before two markings end up with the same rectangle), the applied result follows the base relation, or the base order, and may have a different parent; it is rare (about 1 batch in 1,000 in a fuzz of random batches), the Proposed view already shows what will be applied and, in that case, check with `get_marking` after applying.

### Canvas marking and containment

A marking with `containerId: null` is the **canvas marking**: its `rect` is in canvas units (integers, without the `≥ 0` limit) and creation and removal carry the whole marking as usual (`containerId: null`, `floating`).

- **`space`: the space change is a single change.** When the marking changes container, or enters or leaves the canvas, the change is `field: "space"` with `from` and `to` equal to `{ containerId, rect }` (`containerId` null = the canvas; the `rect` is in the units of its space). The reviewer accepts or rejects the whole space, never "half" (the container without the `rect` or the reverse), like the container's file replacement (`file` = `{ file, width, height }`). With the change, there is no separate `rect` change; without it, the `rect` is the usual `rect` field. The descendant markings that go along each carry their own `space`.
- **`floating`** (boolean) is compared like any marking field. A floating marking always lives in the canvas and stays out of containment; turning floating on usually comes together with a `space`.
- **`parentId` is not compared**, nor is the container's `parentId`: the parent always comes from the settle (`settleHierarchy`), never from the proposal. Accepting a geometry and rejecting "the parent" no longer exists. The `parentId` is still inside the whole value of a marking creation or removal, only as information (and for the review to nest the items); when applying, the settle recomputes it.
- **Settle after applying.** The project resulting from "Apply accepted" (and the "how it would look" of the Proposed view) goes through `settleHierarchy` right after the changes are applied and before reordering the siblings (`position`) and checking the invariants: each non-floating marking goes to the space the geometry gives (the container that fully contains it, otherwise the canvas, with the `rect` converted), and the parent of every marking and every container is recomputed. Hence the result may differ from the proposed one when only part of the changes is accepted, without ever becoming inconsistent.
- **`parent` in the operations.** The batch operations that cite `parent` (for example `create_marking`) accept the field and **ignore it with a warning**: the parent is derived. `create_marking` without `container` creates the canvas marking.

### Arrow

The arrow (`arrow`, schema v13: see [`FORMAT.md`](FORMAT.md), "Fields in v13 (arrows)") is a marking that points and is **only created and removed** in a proposal: `create-arrow` and `delete-arrow` are the changes `kind: "create"` and `kind: "remove"` with `entity: "arrow"`, like those of a marking.

- **Value.** `{ id, from, to, fromSide, toSide, style, name, locked }`, in the `mapping.json` format **without `points`**: the route belongs only to the person and never comes from a proposal. A `points` that someone writes by hand is ignored when applying, and the created arrow is always born with `points: []`. The missing optionals take the format default (`null`, `curve`, `false`).
- **Header.** `markingId` is the **arrow id** (equal to `entityId`) and `imageId` is the container of the **source** marking (`null` = the source is in the canvas): in the review, the arrow is an item inside the container (or the Canvas group) and, when the source marking also has changes, it appears inside it. The arrow's annotations use the usual annotation changes, with `markingId` = the arrow id and the same `imageId`.
- **No field of an arrow that already exists is proposed** (style, name, lock, endpoints, sides and route). An `update` change of `entity: "arrow"` in a file is **ignored on read, with a warning** (`warnings`), along with its decision, application and the note attached to it, like the `parentId` of an old proposal.
- **Dependencies.** Creating the arrow requires the creation of the new markings that are its endpoints (and its annotations require the arrow); rejecting the creation of a marking rejects the arrows and their annotations. Accepting the removal of a marking accepts the removal of the arrows attached to it (the model's cascade), and rejecting the removal of one of those arrows rejects that of the marking. Accepting the marking's removal without the arrow's would leave the arrow without an endpoint: the set is refused (`arrow-endpoint-missing`).
- **Conflict.** Removing the arrow is a conflict if it changed after the proposal, **except the route**: the `points` are not part of the comparison. Creating an arrow with an id that already exists is a conflict, as with any entity.
- **Applying.** An arrow that already existed loses its `points` if an endpoint changes space through the application (a marking's `space` change, or the settle). The Proposed view draws the proposed arrows (the non-rejected ones).
- **Proposal comparison.** The created arrow is found by the readable path (`source → target › name`, with the endpoints by their path), so the same arrow with another generated id counts as the same change.

## Review

### Levels

**Proposal → Project / Canvas / Container → Item → Change** (`reviewTree`). The Project group gathers specializations, repositories and layers; the **Canvas** group (`level: "canvas"`, a sibling of the containers, between the Project and them) gathers the items of the canvas markings (changes with `imageId` null and `markingId`); each container (`image` level in the file) gathers the container itself and its items; an item is a marking (or an arrow) with everything that changed in it (space, geometry, name, lock, source, annotations), and the child markings with changes appear inside it (in the nearest ancestor, in the same space, that also has changes). The note uses the same levels in `target.level` (`proposal`, `project`, `canvas`, `image`, `item`, `change`); `target.id` is `null` in `proposal`, `project` and `canvas`. The review filter by container has the **Canvas** option (`CANVAS_FILTER`), and the readable path of a created marking in the proposal comparison is "Canvas › parent › name" when it belongs to the canvas.

### Decisions

- Only the decision of each **change** is written (`decisions`). Deciding at a level (`decide`) applies to all the changes below it; a lower level can later contradict the higher one.
- Three states per change: accepted, rejected or no decision. A level shows **partial** when the changes below it diverge, with the counts (`summarizeDecisions`).
- Changes already applied do not change decision (reject only before making effective). Only an `open` proposal receives decisions.

### Dependencies

Resolved automatically when deciding; `decide` returns which changes changed along (`cascaded`), so the review can explain ("3 annotations rejected along with it").

1. **Accepting a change inside a created item accepts its creation** and that of the ancestors created in the same proposal (and of everything it cites that was created by the proposal: container, layer, owner, specialization, target of a reference).
2. **Rejecting the creation of an item rejects what depends on it**: annotations, children, linked ones and references (`ref`) that point to it.
3. **Accepting the removal of an item accepts the removal of what the model's cascade removes** (children, annotations, linked ones…).
4. **Rejecting the removal of something in the cascade rejects the removal of the one that causes it** (you cannot remove the parent and keep the child).

Clearing the decision of a change removes the acceptance of what depended on it.

### Conflicts

A change is a **conflict** when the project changed after the proposal: `from` does not match the current value (`changeStatus`, with the current value in `current`), the entity to change disappeared, or the entity to create already exists. Changing something created by the proposal itself is not a conflict. The conflict is recomputed against the current project at every opening, without losing the decisions already made. **Accepting overwrites the current value; rejecting keeps it.**

### Locked item

Geometry changes (`rect` or `space` of the marking; `placement` and a file replacement of another size of the container) or removal on a locked item (by its own lock or, for geometry, by an ancestor's) carry the "Locked item" warning (`changeStatus(...).locked`). Accepting is allowed (the review is a deliberate decision) and the lock stays on afterwards.

### Validation of the accepted set

"Apply accepted" applies the accepted and not-yet-applied changes to a copy of the project and validates the result (`validateAccepted`): the model invariants (`validateProject`), cited specializations that would not end up applied (`missing-specialization`) and changes that do not fit the current project (`entity-missing`: change of something that disappeared; `entity-exists`: creation of an id that already exists; `field-mismatch`: e.g. `values.*` on an annotation that became free-form, or `values.<key>` with a new value on a key that is not a field of the type, such as the `codeRef` field that left the format in v9 in an old proposal; clearing a key outside the type, `to: null`, is not a conflict: the key leaves `values`, as with `remove-field` and `rename-field` of a migration in the same proposal). Only new problems count. Each problem carries the accepted changes involved (`changeIds`: rejecting one of them resolves it) and the ones with no decision on the same entities (`related`: accepting one of them may resolve it, e.g. the missing position of the parent). With any problem, applying is blocked.

### Apply accepted

`applyAccepted(project, proposal, data)` makes effective only the accepted ones not yet applied, in a single project change (one undo entry for the caller), and returns the new project, the proposal with `applied` updated, the changes applied, the images to move from `proposals/<id>/` to the final place (`files`) and the library packages to copy from `proposals/<id>/specs/<folder>/` to `specs/<folder>/` (`packages`: `specId`, `version`, `dir`, `from`, `file` and `spec`). Before handing the package to the session, the app reads it, builds the specialization file from `to.spec` and validates it through the three library levels, with the applied version as the previous one (version contract): with no file at all the application fails with `package-missing`, and an invalid package with `package-invalid`; in both cases nothing changes. What has no decision stays pending in the same proposal; a later application makes effective whatever is accepted next. The application does not go through the model operations (the lock does not prevent it), but the result goes through the invariants.

### States

| `status`     | When                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`       | Under review.                                                                                                                                             |
| `applied`    | Everything decided and the accepted ones applied (the last application changes the state by itself). When superseded, it stays `applied` (it is history). |
| `superseded` | Open and replaced by another (`supersedes`). Decisions and notes stay stored; the accepted ones can still be applied, the pending ones cannot.            |
| `withdrawn`  | Withdrawn by the agent. Nothing more is applied.                                                                                                          |

`reviewProgress` counts the accepted ones awaiting application and says whether the review has finished (`complete`: nothing without a decision and nothing accepted without being applied), which is when a proposal should be superseded.

### Superseded proposal

Each change of the old proposal shows whether the new one carries the **same** thing, **another** thing or **does not include** it (`compareProposals(old, new)`): the corresponding change is found by the source (creation of a container or marking with `source`, even if recreated with another id), then by the entity and the field and, among the creations left over, by the readable path (container › parent › name; for the annotation, marking › layer › type › name), one by one and in order. The `to` value is compared with the ids generated by each proposal replaced by the path.

An **applied** proposal that is superseded stays `applied`: the app derives from the new one's `supersedes` the "Applied · superseded by <title>", with **Open the new one**.

### Agent revision

The agent fixes the **open** proposal in the proposal itself, without creating another (`revise_proposal`; `prepareRevision` and `reviseProposal`, in `proposalRevise.ts`). The revision writes `formatVersion` 5 and appends an entry to `revisions`.

- **When it can.** `open` proposal with `applied` empty. With a change already applied, the error is `proposal-applied` (the hint is `propose_changes` with `supersedes`); outside `open`, `not-open`.
- **`drop`.** The ids of the changes to withdraw. It follows the dependencies of the `proposalIndex`: withdrawing the creation of an item withdraws what depends on it, and withdrawing a removal from the cascade withdraws the removal of the one that causes it. An id that does not exist: `change-not-found`.
- **The batch runs over the whole proposed project** after the `drop`: the current project with all the changes that remained, undecided, accepted and rejected. That is why the agent edits by the final id an item that the proposal creates, even if rejected. If the whole proposed project does not fit the current project: `proposal-not-applicable`, with the problems and the ids.
- **Classification.** Each change in the result falls into one of four:
  - **untouched**: identical (id, `from`, `to`, `insertBefore`, decision and notes);
  - **replaced**: keeps the id, the `from` and the notes, receives the new `to`, loses the decision and gains the "Revised" mark;
  - **new**: receives the next free `c<n>` (never an id already used, nor that of a withdrawn one), the `from` of the current project, no decision and the mark;
  - **withdrawn**: is in the `drop`, or the batch undid its effect; leaves `changes` along with its decision.
- **Freezing.** Replacing or withdrawing an **accepted** change (including through dependencies) rejects the whole call, writing nothing: `change-frozen`, with the ids.
- **Decisions.** Only those of the replaced and withdrawn ones change. Dependents rejected along with them stay rejected (the item appears as Partial).
- **How the replaced ones are found, without heuristics.** By the change key: entity, id and field in a change; entity and kind (`create` or `remove`) in creation and removal. `prepareRevision` builds the whole proposed project; the net effect is `computeChanges(current, result)` and what the batch touched is `computeChanges(proposed, result)`. For each change that remained: the net effect has the key with the same `to` → untouched (in marking and container creation, the `parentId`, which is derived, stays out of the comparison); with another `to` → replaced; without the key → withdrawn if the batch touched it, untouched if it did not (the project changed from outside). "Touched" counts by field family: in the marking, `rect`, `space` and `containerId` are one family; in the annotation, `type`, `values.*` and `entries.*`; in creation and removal, any change of the entity. A `position` that the net effect no longer asks for is always withdrawn: which siblings carry `position` depends on the whole group. The net-effect changes without a pair are the new ones. The order of `changes` is that of the net effect (that of the proposed project, which the application follows when appending the created ones). Finally, if applying everything does not give the parents and the order among siblings of the result with the old anchors, the marking creation whose `insertBefore` needs to change becomes **replaced** (the place in the array is part of its effect; if accepted, it is refused with `change-frozen`). `compareProposals` does not work here, because the created ids are kept.
- **Guarantees.**
  - **Fidelity:** applying all the changes of the revised proposal to the current project, without conflict, gives the same as applying the batch over the whole proposed project (same values, `parentId` and order among siblings), with the #625 limit from "Position of the created marking".
  - The untouched ones stay byte for byte identical in the canonical serialization.
  - Revision with no effect: `no-changes`.
  - Conflict: the untouched and replaced ones keep the `from` from when they were proposed, and the conflict with the current project appears as today.
  - Proven by a fuzz with a fixed seed (`tests/model/proposalReviseFuzz.test.ts`, 1,000 cases or more).
- **Note of a withdrawn change.** It moves to the proposal level (`target: { level: "proposal", id: null }`), with the same text and date, and the id goes into `dropped[].notes`. In the review it appears in the proposal's notes with "From the withdrawn change: <change summary>".
- **The "Revised" mark** (model, `proposalRevisions.ts`). It appears when the change has no decision and is listed in `changed` or `added` of some revision. Deciding removes the mark from the screen (the record stays in the file); clearing the decision brings it back. The "before the revision" comes from the newest revision that replaced the change.
- **Outside the revision.**
  - New or replaced library package: `revise-unsupported`, goes in a new proposal. Withdrawing a package change that is already in the proposal is allowed, and its files leave the folder.
  - Changing the title, description or origin.
  - The agent deciding or writing a note.

## Validity rules

`parseProposal` / `parseProposalText` validate the file and return the errors with the exact path (e.g. `changes[3].to.rect.width: …`, `decisions.c9: nonexistent change`):

- root with all the fields; valid `format`, `formatVersion`, `status` and ISO 8601 dates; non-empty `title`; `supersedes` different from the proposal's own `id`;
- unique change and note ids;
- each change consistent with its `kind` (creation with `from: null`, removal with `to: null`, change with a `field` of the entity), with the values in the `mapping.json` format (the specialization is validated as in `SPEC-FORMAT.md`), the whole entity's id equal to `entityId`, `imageId` (the container) filled in on the image and null only in the Project group and in canvas markings, `markingId` filled in on markings and annotations;
- `decisions` and `applied` only cite existing changes, and `applied` only accepted changes;
- the notes' `target` with `id` `null` in `proposal`, `project` and `canvas`, and citing an existing change in `change`.

In `formatVersion` 6 or later, `revisions` is optional (and what follows holds if it exists); `project` only accepts `update` with `entityId` `"project"`; `drawingMode` follows `[a-z0-9][a-z0-9-]*`; `direction` (container and `project`) is `ltr` or `rtl`; in `formatVersion` 9, a marking's `anchor` is `null` or `{ to, side?, align?, offset? }` with `to` (the id of a marking) required.

In `formatVersion` 5, additionally:

- `revisions` required (and absent in earlier versions, with an error and path); `at` ISO 8601 in each revision;
- `changed.<id>.state` only `"rejected"` or `null`;
- an id in `dropped` never comes back to `changes` (`revisions[0].dropped[0].change.id: …`);
- an id in `added` appears only once in the whole history;
- `dropped[].change` is validated as a change;
- the rest is history and may cite a change or note that no longer exists.

## API in `src/model/`

- Format: `PROPOSAL_FORMAT`, `PROPOSAL_FORMAT_VERSION`, `PROPOSAL_FORMAT_VERSIONS`, `PROPOSAL_REVISED_FORMAT_VERSION`, `PROPOSALS_DIR`, `proposalDir`, `proposalFilePath`, `proposalImagePath`, `parseProposal`, `parseProposalText`, `serializeProposal`; types `Proposal`, `Change`, `ChangeKind`, `ChangeEntity`, `Decision`, `DecisionState`, `ProposalNote`, `ReviewTarget`, `ReviewLevel`, `ProposalStatus`, `ProposalRevision`, `RevisionDropped`, `RevisedPriorState`.
- Changes: `computeChanges(before, after)`, `buildProposal(before, after, { title, … })`.
- Review: `proposalIndex` (dependencies), `requiredChanges`, `dependentChanges`, `reviewTree`, `summarizeDecisions`, `reviewProgress`, `decide`, `changeStatus`, `changeStatuses`, `addNote`, `editNote`, `removeNote`, `notesOf`, `withdrawProposal`, `supersedeProposal`.
- Agent revision: `prepareRevision`, `reviseProposal` (`proposalRevise.ts`; types `ReviseArgs`, `ReviseSummary`, `ReviseError`, `ReviseErrorCode`).
- Revision mark (`proposalRevisions.ts`): `revisionMark`, `revisionMarks`, `visibleRevisedChanges`, `latestRevisionSummary`, `droppedNoteOrigin`; type `RevisionMark`.
- Application: `acceptedPending`, `validateAccepted`, `applyAccepted`, `previewProject` (the "how it would look" view), `patchProject`.
- Comparison: `compareProposals`.
- Reading for the interface (`proposalView.ts`): `changeType`, `dominantChangeType`, `reviewKey`, `changeTarget`, `changeLayerId`, `changeImageFile`, `filterChanges` (`ReviewFilters`, `NO_FILTERS`), `undecidedChanges`, `acceptedPendingIds`, `leftBehind`, `stepChange`.
- Sources: `findBySource`, `setImageSource`, `setMarkingSource` (`FORMAT.md`, v8) and `findTypesBySource` (`SPEC-FORMAT.md`, `formatVersion` 3).

## In the app

How the app stores and checks proposals (storage, `revision`, undoing the application, resuming the review) is in [`ARCHITECTURE.md`](ARCHITECTURE.md), under the item "Change proposals".
