# Format of `mapping.json` (schema v20)

The project is a folder (or a zip with the same content) with `mapping.json`, `images/` (the containers' image files) and,
if any specializations are applied, `specs/` (and, if there are change proposals, `proposals/`). All the markings' coordinates are
**whole pixels of the container's original image** (`containers[].file`, with the EXIF orientation already applied), with one exception
since v13: the **canvas marking** (`containerId` null), whose `rect` is in canvas units (see "Fields of v13 (containment)").

```
my-project/
├── .gitignore        # folder mode only, created with the project: ignores backups/
├── mapping.json
├── images/
├── specs/            # copies of the applied specializations (see SPEC-FORMAT.md)
│   ├── sdui.json
│   ├── modelo-dados.json
│   └── material3/    # library package (formatVersion 4): the specialization's folder
│       ├── material3.spec.json
│       ├── components/ docs/ examples/ fonts/
├── proposals/        # change proposals (see PROPOSAL-FORMAT.md)
│   └── 8c1f…/
│       ├── proposal.json
│       └── images/   # new or replaced images, until they are accepted
├── comments/         # anchored conversations, one per file; the resolved ones in comments/resolved/ (see COMMENT-FORMAT.md)
└── backups/          # folder mode only: originals saved before migrating the schema
    └── mapping.v1.20260930-143015.json
```

When a `mapping.json` of an old version is opened, the app migrates it in memory and, **before the first
save**, stores the original text in `backups/mapping.v<version>.<YYYYMMDD-HHMMSS>.json`
(local time). When a project is **created** in a folder, the app also writes a `.gitignore` with `backups/`
(or appends the line to an existing `.gitignore`, without overwriting it), for those who version the folder
with git. In local mode, the backup stays in the browser's storage (the 3 most recent
per project). The `backups/` folder is not part of the project: the exported zip does not include it.

```json
{
  "schemaVersion": 18,
  "revision": 0,
  "app": "mapping",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": { "id": "6f1c…", "name": "Car", "createdAt": "…", "updatedAt": "…" },
  "specializations": [],
  "platformRepos": {},
  "docRepos": {},
  "layers": [{ "id": "L1", "name": "Components", "color": "#E53935", "spec": null }],
  "containers": [
    {
      "id": "I1",
      "name": "Home Screen",
      "file": "images/home.webp",
      "width": 1182,
      "height": 2560,
      "placement": { "x": 0, "y": 0, "scale": 0.4 },
      "parentId": null,
      "markingColor": null,
      "locked": false,
      "source": null,
      "background": null
    }
  ],
  "markings": [
    {
      "id": "M1",
      "containerId": "I1",
      "parentId": null,
      "name": "Button",
      "rect": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "needsReview": false,
      "locked": false,
      "floating": false,
      "source": { "system": "figma", "id": "12:34", "url": null }
    }
  ],
  "perspectives": [],
  "arrivals": [],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Button",
      "parentAnnotationId": null,
      "type": null,
      "values": null,
      "entries": [{ "id": "E1", "key": "style", "value": "primary" }]
    }
  ]
}
```

## Field reference

All the fields below are **required** (none is omitted; "empty" is `null`). Ids are
non-empty strings, unique within their collection (the app generates `crypto.randomUUID()`; short ids
such as `M1` in the examples are valid too). Colors are `#RRGGBB`.

**Root**

| Field              | Type    | Description                                                                        |
| ------------------ | ------- | ---------------------------------------------------------------------------------- |
| `schemaVersion`    | `20`    | Schema version.                                                                    |
| `revision`         | integer | Write counter (v6, see below).                                                     |
| `app`              | string  | Always `"mapping"` (reading also accepts `"mapeador-imagens"`).                    |
| `coordinateSystem` | string  | Always `"image-pixels-exif-oriented"`: image pixels, EXIF applied.                 |
| `project`          | object  | `id` (v16), `name`, `createdAt` and `updatedAt` (ISO 8601; time zone becomes UTC). |
| `specializations`  | array   | Applied specializations (see v4).                                                  |
| `platformRepos`    | object  | Local clone of each platform (v7; only `localPath` since v11, see below).          |
| `docRepos`         | object  | Local clone of each documents repository (v14, see "Fields of v14").               |
| `drawingMode`      | string  | The project's drawing mode (v18, optional, see "Fields of v18").                   |
| `direction`        | string  | The project's reading direction (v20, optional, see "Fields of v20").              |
| `layers`           | array   | Layers, **global** (they apply to all containers), in display order.               |
| `containers`       | array   | The project's containers (v12; formerly `images`).                                 |
| `markings`         | array   | Rectangular markings (of a container or of the canvas, v13).                       |
| `arrows`           | array   | Arrows (v13): markings that point, linking two markings.                           |
| `perspectives`     | array   | "For everyone" perspectives (v16, see "Fields of v16").                            |
| `arrivals`         | array   | "Came from…" marks of the Main perspective (v16, see "Fields of v16").             |
| `annotations`      | array   | Annotations (free or typed).                                                       |

**`layers[]`**: `id`; `name` (non-empty); `color`; `spec` (`null` or `{ specId, layerId }`).

**`containers[]`** (v12; until v11 the collection was called `images`): `id`; `name` (`string` or `null`); `file` (relative path, e.g. `images/home.webp`, unique
in the project; `null` in the container without a file, v10: see below); `width` and `height` (whole pixels, with the EXIF orientation already applied);
`placement` (`{ x, y, scale }` — the image's position and scale on the canvas, for the interface only);
`parentId` (v13: `null` or the canvas marking that wraps the container, computed by the app; see below);
`markingColor` (`null` or color); `locked` (boolean, v5: see below); `source` (`null` or source, v8:
see below); `background` (`null` or `#RRGGBB` color, v10: the background color of the container without a file);
`drawingMode` (v18, optional: the drawing mode that the container pins; see "Fields of v18"); `direction` (v20, optional: the reading direction that the container pins, `ltr` or `rtl`; see "Fields of v20"); `density` (v19, optional: image pixels per component unit; see "Fields of v19").

**`markings[]`**: `id`; `containerId` (v12; formerly `imageId`; `null` in the canvas marking, v13); `parentId` (parent marking or `null`,
computed by the app since v13); `name` (`string` or `null`);
`rect` (`{ x, y, width, height }`, **whole pixels of the container's original image**, `x`/`y` ≥ 0; in the canvas marking,
**whole canvas units**, `x`/`y` may be negative);
`needsReview` (boolean, for the interface only); `locked` (boolean, v5: see below); `floating` (boolean, v13: see below);
`source` (`null` or source, v8: see below); `anchor` (v20, optional: the anchor; see "Fields of v20").

**`arrows[]`** (v13): `id` (in the same space as the markings' ids); `from` and `to` (marking ids, different); `fromSide` and `toSide`
(`top`, `right`, `bottom`, `left` or `null`); `points` (waypoints of the route); `style` (`straight`, `curve` or `elbow`);
`name` (`string` or `null`); `locked` (boolean). See "Fields of v13 (arrows)".

**`perspectives[]`** (v16): `id`; `name`; `hiddenLayers` (layer ids); `items` (`{ root, x, y }`). **`arrivals[]`** (v16): `{ root, from, fromName }`.
See "Fields of v16 (perspectives)".

**`annotations[]`**: `id`; `markingId` (the id of a marking **or of an arrow**, v13); `layerId`; `name` (`string` or `null`);
`parentAnnotationId`; `parentRole` (v14: the role in the owner, `string` or `null`; see "Fields of v14"); `type`, `values` and `entries` (see v4). Free: `type` and `values` are `null`.
Typed: both filled in and `entries` empty.

## Validity rules

A file only opens if it passes the rules below (`validateProject` in `src/model/`); otherwise, the app
lists the problems and repairs what has a mechanical repair (see "Inconsistent files"), without changing the
file on read.

- Unique ids in each collection; unique `file` among the images that have a file; unique `file` of the specializations.
- Container (v12): `file` is `null` if, and only if, `background` is a color (`container-content`).
- Every marking has a null `containerId` (canvas marking, v13) or one of an existing container; `parentId`, if any, is an existing marking.
- `rect`: integers, width and height **≥ 1 px** (on opening, any marking is valid from 1 px; below that it is `rect-too-small`; gestures and MCP require 8 px on a regular marking, see "Fields of v18"); in the container marking, **entirely inside** the image (`0 ≤ x`,
  `x + width ≤ image width`; same for `y`); in the canvas marking, no position limit.
- The parent marking is **in the same space** (the same container, or the canvas) and **contains** the child's `rect`. There are no cycles.
- Containment (v13): see "Fields of v13 (containment)"; the container's `parentId` and the floating marking have rules of their own.
- Images **do not overlap** on the canvas (`placement` × size × scale).
- Every annotation points to an existing marking (or arrow, v13) and an existing layer.
- Anchor (v20): `anchor.to` is an existing marking in the **same space**, different from the marking itself and with no cycle
  (`anchor-missing`, `anchor-self`, `anchor-other-space`, `anchor-cycle`); see "Fields of v20".
- Arrow (v13): `from` and `to` are existing markings (neither another arrow nor a container) and different
  (`arrow-endpoint-missing`, `arrow-self`); its id does not repeat that of a marking or of another arrow
  (`duplicate-id`). Nothing else is an invariant: two identical arrows are allowed.
- Perspective and arrival (v16): see "Fields of v16 (perspectives)" (`perspective-*`, `arrival-*` and the `duplicate-id` between perspectives).
- Pairs (`entries`): key non-empty (after `trim`) and unique within the annotation; pair ids unique in the project.
- `table` rows: `_id` unique within the list.
- `source` (v8): `null` or `{ system, id, url }`, with `system` and `id` non-empty strings and `url` a string or
  `null` (all three keys present).
- `platformRepos` (v11): keys in the format `[a-z0-9-]+`; each value with `localPath` (string). An
  unknown key in the input (the old `urlTemplate`) is discarded on read. Configuration of a platform
  that no specialization declares does not prevent opening.
- `docRepos` (v14): keys in the format `[a-z0-9-]+`; each value with `localPath` (non-empty string). An entry
  without `localPath` is dropped on read, and any other key in the input is discarded. The id of a repository that no
  specialization declares does not prevent opening, and removing the specialization does not delete the entry.
- Link role (v14): a non-null `parentRole` is a non-empty string (`empty-role`) and requires a non-null `parentAnnotationId`
  (`role-without-owner`). A role that the owner does not offer, or missing on an owner with `childRoles`, does **not**
  prevent opening: it becomes a pending item (`unknown-role`, `missing-role`).
- "Owner" annotation (`parentAnnotationId`): exists, is in the **same marking**, and the chain has no cycles. The
  **free** one only has an owner in **another layer**; the **typed** one may have an owner in the **same layer** when the owner's
  type accepts it (v15, see "Fields of v15").

Specialization rules (empty required field, incompatible type, broken reference,
`allowedChildren`…) do **not** prevent opening: they become **pending items** (see below).

### Inconsistent files

A file that violates the rules above (edited by hand, generated by another tool) does not open directly: the app
shows the **exact list** of problems (rule, item type, id and name), with **Copy**.

When all the problems have an unambiguous mechanical repair (`repairProject` in `src/model/repair.ts`), the
dialog offers **Repair and open**:

| Problem                                                                                                                 | Repair                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pair with an `id` already used (in another annotation or in the same one)                                               | The first keeps the id; the others get a new id.                                        |
| `rect` outside the image                                                                                                | Clipped to the image bounds; if no area is left, the marking is removed.                |
| Marking of a nonexistent image                                                                                          | Removed.                                                                                |
| Arrow with a nonexistent endpoint (or that is another arrow) or linked to itself (v13)                                  | Removed, with its annotations (in the next round).                                      |
| Annotation of a nonexistent marking or layer                                                                            | Removed, with the annotations it owns (`parentAnnotationId`).                           |
| Nonexistent `parentId` or cycle in the marking hierarchy                                                                | The marking (in a cycle, each one in the cycle) becomes a root of its space.            |
| Floating marking inside a container or with a parent (v13)                                                              | Goes to the canvas, with the `rect` converted, and is left without a parent.            |
| Parent of a floating marking; container parent that is nonexistent, not on the canvas or that does not contain it (v13) | The `parentId` becomes `null`.                                                          |
| Overlapping images                                                                                                      | The one with the higher index goes to the right of the earlier ones' box.               |
| Perspective with a root item that is nonexistent, not a root or repeated; nonexistent hidden layer (v16)                | The item (the second, if repeated) or the layer leaves the perspective.                 |
| Perspective with a repeated `id` (v16)                                                                                  | The first keeps the id; the others get a new id.                                        |
| Perspective with a repeated name (v16)                                                                                  | The first keeps the name; the others get " (2)", " (3)"…                                |
| Arrival of a root that is nonexistent, not a root or repeated (v16)                                                     | Removed (the second, if repeated).                                                      |
| Anchor with a target that is nonexistent, itself, in another space or in a cycle (v20)                                  | The marking stays where it is, with `anchor: null` (in a cycle, each one in the cycle). |

A repair may expose another (the removed marking leaves its annotations without a marking and its children without a parent):
each round resolves what the previous one exposed. Any other problem (repeated id of an image, marking,
annotation, layer or specialization; repeated file; `rect` too small; child outside the parent; parent in
another image; owner annotation problems; empty or repeated key; repeated `_id` in `table`)
leaves the file **rejected**: the dialog only lists and closes. Fix the file by hand (or restore a copy)
and open it again.

Reading never writes. When repairing, the project opens repaired in memory; the original goes to
`backups/mapping.v<version>.<YYYYMMDD-HHMMSS>.json` and the repaired one to `mapping.json` only on the **first
write**, as in migration. The name is the same as the migration backup's (a repaired v11 becomes
`mapping.v11.<date>.json`): to find out the reason, compare the date with the Diagnostics or the content
with the current `mapping.json`. The repair summary appears in the editor's notice and in the Diagnostics. The MCP
server keeps rejecting the file (reading never writes), with the same list of problems in the response.

Dates (`createdAt`, `updatedAt`) with a time zone (`2026-10-01T09:30:00-03:00`, from another tool) are accepted
and written in UTC (`2026-10-01T12:30:00.000Z`).

## Fields of v2 and v3 (historical record)

The `annotations[].inherit` field (v2) was removed in v13 (see "Fields of v13"); below, what v2 and v3 introduced.

- `containers[].name`: optional label (`null` = use the file name). Changing it does not rename the file.
- `containers[].markingColor` (v3): `#RRGGBB` color of the border of the image's markings, or `null` (neutral theme color). It only affects the interface, not the crop.
- `annotations[].inherit` (v2, **removed in v13**): marked the annotation as valid for the marking's descendants.
- `annotations[].parentAnnotationId`: "owner" annotation (or `null`).
  - the owner is in the **same marking**; until v14 it was always in **another layer** (v15 allows the same layer for the typed annotation, see "Fields of v15");
  - there are no cycles (the chain may cross several layers).
- `placement` and `needsReview` only matter to the interface; `placement` does not affect the crop.

An annotation is valid only for its own marking; a child marking's context comes from the path (`parentId`),
not from inherited annotations.

## Fields of v4 (specializations)

A **specialization** is a JSON file that defines layers and annotation types (format in
[`SPEC-FORMAT.md`](SPEC-FORMAT.md)). When applied, it is **copied** to `specs/<id>.json`:
the project becomes self-contained and whoever reads it understands the meaning of the layers and keys.

- `specializations[]`: `{ "id", "version", "file" }` of each applied specialization. `file` is the
  path of the copy (`specs/sdui.json`) or, in a library package, that of the specialization file
  **inside the folder** (`specs/material3/material3.spec.json`).
- **Folder `specs/<id>/` (the library's package, `formatVersion` 4).** Applying the specialization
  from a folder (or zip) **copies the whole folder** to `specs/<id>/` (`<id>` cleaned for a folder
  name, with a `-2`… suffix if it collides): the specialization file, `components/`, `docs/`,
  `examples/` and `fonts/`, with the relative paths that the specialization cites. The bytes are
  preserved (fonts are binary); in the exported zip the folder goes as is. Only the specialization
  file is read into the in-memory project (the `file` above); the other files are not
  part of the state nor of undo: the app reads them when it needs to (validate on open, draw).
  Updating the version rewrites the whole folder (what the new version lacks goes away); removing the
  specialization deletes the folder; undoing either one restores the files. An incomplete package
  (a cited file is missing) does not prevent opening the project: it appears as a library problem in the
  Diagnostics. The `mapping.json` schema does not change: v1 to v3 remain `specs/<id>.json`.
- `layers[].spec`: `null` (free layer) or `{ "specId", "layerId" }`, the source layer in the
  specialization. Specialization layers only have **typed** annotations of it.
- `annotations[].type`: `null` (**free** annotation) or `{ "specId", "typeId" }` (**typed** annotation).
- `annotations[].values`: `null` in the free one; in the typed one, an object with the values by the field's `key`,
  in **native JSON**:
  - `string` and `enum`: text; `number`: number; `date`: ISO text `YYYY-MM-DD`;
  - `table`: array of rows; each row has the column keys and an internal id `_id`;
  - `ref`: reference object (below);
  - empty field: `null` (or absent); empty `table`: `[]` (`null` is valid too).
- `annotations[].entries`: pairs of the free annotation; always `[]` in the typed one. Each pair has an `id`.
- The label of a typed annotation is the `name`; if empty, the value of the type's `labelField` field;
  if empty, the type's name. E.g.: a Class with `nome: "Contato"` appears as `Contato`.

Typed annotation (Class of the `modelo-dados` specialization):

```json
{
  "id": "A2",
  "markingId": "M-form",
  "layerId": "L3",
  "name": null,
  "parentAnnotationId": null,
  "type": { "specId": "modelo-dados", "typeId": "classe" },
  "values": {
    "nome": "Contato",
    "descricao": null,
    "versao": 1,
    "revisadoEm": "2026-10-02",
    "atributos": [
      {
        "_id": "R1",
        "nome": "email",
        "tipo": "String",
        "obrigatorio": "sim",
        "exemplo": null
      }
    ]
  },
  "entries": []
}
```

## Fields of v6 (revision)

`revision` (integer ≥ 0, required, right after `schemaVersion`) counts the file's writes. Whoever
writes (the app or the MCP server) rereads the file first, checks that the `revision` on disk is the one it loaded, and
writes `revision + 1`; if it is another, someone changed `mapping.json` from outside and the write is refused or
confirmed by the user. Whoever edits the file by hand does not need to touch the field, but the value only goes up
when the app or the MCP write; the app notices a hand edit by the content (and by the file's date), not only
by the `revision`. The `src/model/` operations do not change the `revision`: it belongs to the file, not to the content
(the app keeps it in the session and increments it on each write). A file without the field (v5) is worth `0`, as in
migration.

## Fields of v5 (lock)

`containers[].locked` and `markings[].locked` (`true`/`false`, required) protect already-reviewed items
from accidental changes. Whoever **reads** the file (an agent that crops the image) may ignore them:
the lock does not change the meaning of the data, only what the app lets be **changed**.

- The lock applies to **direct manipulation of the locked item itself**: it **cannot be moved,
  resized or deleted**. Selection remains free, and name, parent, annotations and "Confirm position"
  remain editable.
- Locking a marking **locks the geometry of its descendants** (move and resize), without changing their
  `locked`: unlocking the parent frees them all. Deleting a loose descendant remains allowed.
- A locked descendant **never blocks the parent**. Moving the parent **carries along** the locked descendants,
  keeping the relative position (the parent and the descendants move by the same offset); resizing the
  parent does not move the children. Deleting the parent (or an image) with locked descendants is allowed: they are
  deleted along with it, and the confirmation reports **how many locked items** will be deleted. Only the
  locked marking (or image) itself blocks deletion.
- Locked image: it cannot be moved or resized on the canvas. Its markings follow their own
  rule (coordinates are in image pixels, so moving the image does not change them). Replacing the file
  with another of a **different size** (which rescales the markings) is blocked if the image or any
  of its markings is locked; repointing a file of the same size is free.
- Creating new markings inside a locked parent or image remains allowed, and their `locked`
  starts as `false`.
- "Lock all markings in this image" changes the `locked` of all the image's markings at once
  (one undo entry). Locking and unlocking go into undo.
- Items that arrive from another tool (stage 4) come in through reviewed **change proposals**
  ([`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)); accepting in a review a geometry change or the
  removal of a locked item is allowed (with a warning), and the lock stays on afterwards.

The rules live in `src/model/locks.ts` (`canEditMarkingGeometry`, `canDeleteMarking`,
`canEditImagePlacement`, `canDeleteImage`, `canReplaceImage`); model operations throw the
`locked` error if someone tries to bypass them.

### Stable ids

The ids of pairs (`entries[].id`) and rows (`_id`) are UUIDs that **do not change** when the key or the
values are edited. References rely on them. They are unique: pair ids across the whole project and row ids
within the table.

### References (`ref`)

The value of a `ref` field (or of a `ref` column cell) points to a tuple, row, field or
annotation of **another** annotation, in any marking or container of the project. There are four formats (the fourth
is from v17):

| Target                  | Value                                | Label           |
| ----------------------- | ------------------------------------ | --------------- |
| Free annotation pair    | `{ "annotationId", "entryId" }`      | `User.name`     |
| `table` row with a tag  | `{ "annotationId", "key", "rowId" }` | `Contato.email` |
| Simple field with a tag | `{ "annotationId", "key" }`          | `Contato.nome`  |
| Whole annotation (v17)  | `{ "annotationId" }`                 | `Pedido 4`      |

The fourth format is only the `annotationId`, without `key`, `entryId` or `rowId`; any other combination of
keys is not a reference.

**How to resolve a reference** (step by step):

1. Find in `annotations` the annotation with `id` equal to `annotationId`. If it does not exist, the
   reference is **broken**.
2. If the value is only `annotationId` (whole annotation, v17): the target is the annotation itself, which must be
   **typed** to be accepted; the label is the instance's: `name`, else the value of the type's `labelField`,
   else the type's name.
   If the value has `entryId`: look in the `entries` of that (free) annotation for the pair with that `id`.
   The target is the pair; the label is `<annotation label>.<pair key>`.
3. If it has `key` and `rowId`: in `values[key]` (an array), find the row with `_id` equal to
   `rowId`. The label uses the value of the column indicated by `rowLabel` in the specialization's field.
4. If it has only `key`: the target is the `values[key]` field of the typed annotation; the label uses the field's
   `label` (or the `key`).
5. To know whether the target is **accepted**, compare with the source field's `accepts`: a free pair is only
   valid with `"free": true`; a row or field must have, in the specialization, one of the
   tags (`tags`) in `accepts.tags`; a whole annotation must be typed, of the **same
   specialization** as the source annotation, and of a type covered by `accepts.annotations` (type ids and
   `{ layer, groups? }` clauses, resolved like `allowedChildren`). Never the source annotation
   itself. A field's accepted targets are the union of `tags`, `free` and `annotations`.

Deleting the target **does not delete** the reference: it stays in the file and becomes broken.

Deleting the target's type (`remove-type` migration) deletes its annotations, and the `ref`s that pointed to
them count as broken. The `{ "annotationId" }` value does not change with `rename-type` or `rename-field`.

In TypeScript code, `src/model/` offers `resolveRef`, `refLabel`, `findRefTargets` (targets accepted
by a field) and `getBacklinks` (who points to an annotation). In the `backlinks`, the reference keeps the
whole `ref`: the consumer tells the whole annotation by the absence of `key`, `entryId` and `rowId`.

### Pending items

The "incomplete" state **is not written**: it is computed from the project and the copies in `specs/`
(`getAnnotationIssues` in `src/model/`). Reasons: empty required field (including a required
column in a row), value incompatible with the type, nonexistent option, key outside the type,
nonexistent type, annotation outside its type's layer, missing owner (`requiresOwner`), owner of a
type not allowed (`allowedChildren`), broken reference and target not accepted. None of them prevents
opening the project.

## Fields of v7 (repositories per platform)

> **History:** in v11 the `urlTemplate` left the project: the repository address moved to the
> specialization and the project keeps only the `localPath`. See "Fields of v11".

v7 linked the mapping to the code of the platforms that the specializations declare
([`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Platforms and code"): the specialization says how to create an
instance of each type (`code`, with the `symbol` and the file that defines it, `path`) and the project kept
**where the repository was** for each platform (`platformRepos`), with a `urlTemplate` and a `localPath`.
Until v8 there was also the `codeRef` field (the place in the solution where the instance was written), which was removed
in v9 (see "Fields of v9").

## Fields of v8 (external source)

`containers[].source` and `markings[].source` hold the **identity of the item in an external system**, so that
a re-export recognizes the same elements (e.g. the same container or the same component exported again
from a design tool) and proposes only what changed.

```json
"source": { "system": "figma", "id": "12:34", "url": "https://www.figma.com/design/abc?node-id=12-34" }
```

| Field    | Type             | Description                                                           |
| -------- | ---------------- | --------------------------------------------------------------------- |
| `system` | string           | Source system (free text, non-empty). The core does not interpret it. |
| `id`     | string           | Id of the element in the source system (non-empty).                   |
| `url`    | string or `null` | Address of the element at the source, if any.                         |

- `null` = item without a source (created by hand). The source does not change the meaning of the data or the lock.
- The format does not require unique sources: the search (`findBySource(project, system, id)` in `src/model/`)
  returns all the images and markings with the same source, images first.
- Whoever assigns the source is whoever imports (an agent, through a proposal); the app shows and preserves it.

Deleting the target's type (`remove-type` migration) deletes its annotations, and the `ref`s that pointed to
them count as broken. The `{ "annotationId" }` value does not change with `rename-type` or `rename-field`.

In TypeScript code, `src/model/` offers `resolveRef`, `refLabel`, `findRefTargets` (targets accepted
by a field) and `getBacklinks` (who points to an annotation). In the `backlinks`, the reference keeps the
whole `ref`: the consumer tells the whole annotation by the absence of `key`, `entryId` and `rowId`.

### Pending items

The "incomplete" state **is not written**: it is computed from the project and the copies in `specs/`
(`getAnnotationIssues` in `src/model/`). Reasons: empty required field (including a required
column in a row), value incompatible with the type, nonexistent option, key outside the type,
nonexistent type, annotation outside its type's layer, missing owner (`requiresOwner`), owner of a
type not allowed (`allowedChildren`), broken reference and target not accepted. None of them prevents
opening the project.

## Fields of v7 (repositories per platform)

> **History:** in v11 the `urlTemplate` left the project: the repository address moved to the
> specialization and the project keeps only the `localPath`. See "Fields of v11".

v7 linked the mapping to the code of the platforms that the specializations declare
([`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Platforms and code"): the specialization says how to create an
instance of each type (`code`, with the `symbol` and the file that defines it, `path`) and the project kept
**where the repository was** for each platform (`platformRepos`), with a `urlTemplate` and a `localPath`.
Until v8 there was also the `codeRef` field (the place in the solution where the instance was written), which was removed
in v9 (see "Fields of v9").

## Fields of v8 (external source)

`containers[].source` and `markings[].source` hold the **identity of the item in an external system**, so that
a re-export recognizes the same elements (e.g. the same container or the same component exported again
from a design tool) and proposes only what changed.

```json
"source": { "system": "figma", "id": "12:34", "url": "https://www.figma.com/design/abc?node-id=12-34" }
```

| Field    | Type             | Description                                                           |
| -------- | ---------------- | --------------------------------------------------------------------- |
| `system` | string           | Source system (free text, non-empty). The core does not interpret it. |
| `id`     | string           | Id of the element in the source system (non-empty).                   |
| `url`    | string or `null` | Address of the element at the source, if any.                         |

- `null` = item without a source (created by hand). The source does not change the meaning of the data or the lock.
- The format does not require unique sources: the search (`findBySource(project, system, id)` in `src/model/`)
  returns all the images and markings with the same source, images first.
- Whoever assigns the source is whoever imports (an agent, through a proposal); the app shows and preserves it.

## How an agent reads `mapping.json`

1. **Marking crop**: `rect` in pixels of the image in `containers[].file` (EXIF orientation applied).
   The canvas marking (`containerId` null) has no crop: its `rect` is in canvas units.
   **Containment**: who is inside whom already comes written in `parentId` (of the marking and of the container).
   Group by `parentId`; **do not compute intersections or choose a parent by geometry**, and do not write `parentId`
   by hand: the app recomputes it from the rectangles (see "Fields of v13 (containment)").
2. **Own annotations**: `annotations` with the marking's `markingId`, grouped by `layerId`.
3. **Structure**: annotations with `parentAnnotationId` form a tree; the layer name of the
   linked annotation is the property name in the owner. E.g.: `Button.Eventos = [onClick, onLongPress]`.
4. **Meaning**: in a typed annotation, read the type in `specs/<file>.json` (layer
   `layers[].id == layer.spec.layerId`, type `annotationTypes[].id == type.typeId`). The fields
   (`fields`) give the `label`, the type and the description of each `values` key.
5. **References**: `ref` fields in `values` point to other annotations (see above).
6. **Instantiation code**: the type's `code` says how to create an instance of it on each platform
   (`symbol` is what you call, `path` is the file that defines it, `params`, `values` and `notes` say how to
   pass the fields; [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Platforms and code"). The file of each `symbol`
   is in the platform's `repo`, **in the type's specialization**: build the URL with the `repo`'s `urlTemplate`
   (see "Fields of v11") or, if the project gives the local clone in `platformRepos[platform].localPath`,
   join the `localPath` and the `path` (relative to the project folder). Read the file to learn the signature and
   write the call in the solution. To go from code to mapping, look for the types whose `path` equals the
   file or ends with it by whole segments (`DSButton.kt` matches `app/…/DSButton.kt`,
   `Button.kt` does not) or whose `symbol` is equal, and then the annotations of those types. The mapping stores
   nothing about the solution.

In TypeScript code, `src/model/` offers `getLinkedAnnotations(project, annotationId)` and, for code, `codeLink`, `codeLocalPath`,
`findByCode` and `codeBlueprint`.

## Fields of v9 (no code field)

v9 adds no fields: it removes from the format the specializations' `codeRef` field (the place in the
solution where the instance was written, a list of `{ _id, platform, path, symbol, line }` entries in
`values`). The mapping and the specialization store only what helps to **instantiate** the types (the types'
`code`), never where the instance ended up.

- **Migration v8 → v9**: the values of the `codeRef` fields are removed from `values`. Each field's type comes from the
  **copy of the applied specialization** (`specs/<id>.json`): the migration reads the copy (raw, unvalidated) and
  discards, in the annotations of its types, only the keys that it declares with `"type": "codeRef"`. A key
  of the same name in another type is not touched. The rest of the project does not change; a v8 without `codeRef` only changes
  version.
- **Without the copy** (missing, unreadable JSON or of another specialization) there is no way to know which keys
  were `codeRef`, and the migration does not guess from the shape of the value: the values stay. With the copy
  back, they appear as "key that does not exist in the type" (`unknown-field`), like any field that
  left a type.
- **Copies in `specs/`**: a `codeRef` field in the copy is read and ignored (it leaves the type, with a warning on
  import); the app does not rewrite the copy just for that, so it keeps the field until the next
  update of the specialization.
- **Old proposals**: a `values.<field>` change on a field that no longer exists in the type does not fit the
  project (`field-mismatch`, see [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)): accepted, it blocks
  "Apply"; the Proposed view leaves it out. The reviewer rejects it and the agent resends without it.

## Fields of v10 (container without a file)

> This section describes v10 with the names of the time (`images[]`, `blank-background`, `blank-image`); in v12 the
> collection is `containers[]` and the invariant is `container-content` (see "Fields of v12").

v10 allows an image **without a file**, the **container** without a file: an area
with a size and background color where components are marked and drawn, with no photo underneath. **Container** is the name
that the interface, the MCP and the documentation give to the canvas's top-level object (with a photo or without); `mapping.json`
writes it in `images[]` (in v12, `containers[]`) and the letter `i` in the `mapping://<project>/i/<code>` references is the container. In `images[]`:

- `file: null` and `background: "#RRGGBB"` (uppercase color); `width` and `height` integers from 1 to 20000
  (`MAX_BLANK_SIZE`). There is no file in `images/`, nor in the exported zip, nor a bitmap: the container is drawn
  by the app. An image with a file has `background: null`.
- **Invariant `blank-background`** (today `container-content`): `file === null` if, and only if, `background !== null`. The check
  for a repeated `file` (`duplicate-file`) ignores the container without a file.
- Everything else is the same as for an image: `placement` (same placement when adding, longer side of 1000
  canvas units), markings in container pixels, name (`name`; without a name the interface shows
  "Container"), `markingColor`, `locked`, `source`.
- **Editing**: the color changes freely; the size is geometry (a locked image refuses) and cannot leave
  a marking outside (`rect-out-of-image`) or make the image overlap another. It keeps the scale of the
  `placement`.
- **Does not apply** to the container without a file: replacing the file (`replace_container`/"Replace image"), "Copy crop"
  and reading the file through the MCP (`get_container_file` returns `container-without-file`; `get_marking_image` returns the region
  in the background color).
- **Proposals**: creation carries the whole image with `file: null`; the change gains the fields `background`
  (color) and `size` (`{ width, height }`), only when the image is a container without a file (see
  [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)).
- **Migration v9 → v10**: every image gets `background: null` (an existing value is preserved). Nothing
  else changes.

## Fields of v11 (local repository override)

v11 changes **where the repository** of each platform lives. The file of each `symbol` is in the **library's**
repository, and so its address moved to the specialization (`platforms[].repo`,
`formatVersion` 5; [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Platforms and code"). The project keeps only a
**local override**: where the clone of that repository is on this machine.

### Local override (`platformRepos`)

```json
"platformRepos": {
  "android": { "localPath": "../../.." },
  "bff": { "localPath": "../../../../bff" }
}
```

- The key is the platform id. Platforms with the **same id** in different specializations are the same
  platform and use the same override (the displayed name is that of the first applied specialization). The
  address, by contrast, belongs to each specialization: each declares the `repo` of its own library.
- **`localPath`**: root of the platform repository's local clone, **relative to the project folder** (e.g.
  `../../..` when the project lives in `docs/mapping/telas/` inside the app's repository). Non-empty string:
  the app does not write an empty entry, and a platform without a path is dropped from the object. Removing a specialization
  does not delete the override.
- There is no address in the project: `urlTemplate` no longer exists in `platformRepos`. An old file with
  it is read, and the field is discarded by the migration (see below).
- A platform without `localPath` is not a problem: the agent uses the address of the specialization's `repo`. The
  missing-repository warning (`missing-repo`) **was removed in v11**; what remains is the specialization's warning
  (`path-without-repo`, a platform in which some type has a `path` and that does not declare a `repo`), checked on its
  validation and on import.

### How to build the URL of a type's file

The `path` of a specialization type's `code` (`code.<platform>.path`, the file that defines the
`symbol`, relative to the root of the platform's `repo`; [`SPEC-FORMAT.md`](SPEC-FORMAT.md)):

1. Take, from the **specialization that owns the type** (the one in `type.specId`), `platforms[<platform>].repo.urlTemplate`,
   with the platform of the `code` key. Without `repo` or without `urlTemplate`, there is no link.
2. Replace `{path}` with the `path`, encoding **each segment** (`encodeURIComponent`) and keeping the `/`
   (e.g. `Minha Tela.kt` → `Minha%20Tela.kt`).
3. Remove the part from the **last `#`** on if it contains `{line}` (and not `{path}`):
   `…/{path}#L{line}` → `…/{path}`; `…#lines-{line}` → without the fragment. If `{line}` is not in a
   fragment like that (e.g. `?linha={line}`), it becomes empty.

E.g.: `https://github.com/org/app-android/blob/v3/{path}` with `path: "app/Main.kt"` gives
`…/blob/v3/app/Main.kt`. The `repo.ref` is informational and does not go into the link.

### How to find the local file

Join `localPath` and `path` with `/`: the result is relative to the **project folder** (the one with `mapping.json`).
E.g.: `localPath: "../../.."` and `path: "app/Main.kt"` → `../../../app/Main.kt`. Without `localPath`, there is no
local path.

In TypeScript code, `src/model/` offers `codeLink` (the URL, from the `urlTemplate` of the `repo` of the
specialization that owns the type), `codeLocalPath` (the path relative to the project folder, from the override),
`findByCode` (the types whose `code` points to a file or symbol, with their annotations),
`codeBlueprint` (what `get_code_hints` returns: the instantiation code of each type and, per marking,
the values to pass) and `projectPlatforms` (platforms of the applied specializations, without repeating an id, each
with the `repo`s of the specializations that declare it).

### Migration v10 → v11

- The `urlTemplate` of each `platformRepos` entry is **discarded**.
- An entry left without `localPath` (it only had `urlTemplate`, or the `localPath` was `null` or empty) is
  **removed**. One that had `localPath` keeps it, with nothing else.
- A v10 without `platformRepos` migrates without changing anything else.
- Like every migration, the original goes to `backups/mapping.v10.<YYYYMMDD-HHMMSS>.json` before the first
  save (in folder mode).
- The **Diagnostics** records what was discarded (the platforms and the addresses) with the guidance:
  rewrite the specialization with `repo` (`formatVersion` 5) and update it in the project. Until then, the
  "Definition" row and the MCP do not build the link for that platform; the discarded address is in the log and in the
  backup, to copy to `repo.urlTemplate`.

## Fields of v12 (container)

v12 changes the name of the canvas's top-level object: what was the **image** becomes the **container** (an area
with or without an image file). Only the vocabulary of `mapping.json` changes; the data is the same.

- The `images` collection becomes **`containers`**, and the marking swaps `imageId` for **`containerId`**. The fields of
  each container (`id`, `name`, `file`, `width`, `height`, `placement`, `markingColor`, `locked`, `source`,
  `background`) do not change.
- `file`: `string` (path in `images/`) or `null` (container without a file). `background`: `#RRGGBB` color or
  `null`.
- **Invariant `container-content`** (formerly `blank-background`): `file === null` if, and only if,
  `background !== null`. Related errors: `container-without-file` (reading the file of a container without a
  file) and `container-has-file` (an operation only for the container without a file applied to one with a file).
- Still with the old name: the `images/` folder (it holds the image files), the letter `i` in the
  `mapping://<project>/i/<code>` references (now it is the container), the `screen` key of `origins` and, in the proposal, the
  change header (`imageId`, `entity: "image"`; see [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)). The
  marking fields inside the proposal use `containerId`; the old proposal (`imageId`) is read by converting.
- **Migration v11 → v12**: on opening, the app renames only those two keys (`images` → `containers`,
  `imageId` → `containerId` in each marking) and changes `schemaVersion` to 12. Nothing is deleted. Like every
  migration, the original goes to `backups/mapping.v11.<YYYYMMDD-HHMMSS>.json` before the first save
  (in folder mode) and the migration banner appears at the top.

| Version | What changed                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v9      | No code field (`codeRef`)                                                                                                                                         |
| v10     | Container without a file (`file: null`, `background`)                                                                                                             |
| v11     | `platformRepos` keeps only the `localPath`                                                                                                                        |
| v12     | `images` → `containers`, `imageId` → `containerId` (names only)                                                                                                   |
| v13     | No annotation inheritance (`annotations[].inherit` removed); canvas marking (`containerId` null), `floating`, `containers[].parentId` and the `arrows` collection |
| v14     | `annotations[].parentRole` (the role in the owner) and `docRepos` (the local clone of the documents repositories)                                                 |
| v15     | The owner can be in the same layer for the typed annotation (no new field, data unchanged)                                                                        |
| v16     | `project.id` and the `perspectives` and `arrivals` collections (the "For everyone" perspectives and the "Came from…" marks)                                       |

## Fields of v13 (no inheritance)

v13 removes annotation inheritance from the format: the `annotations[].inherit` field ("the annotation is valid for all the
marking's descendants") no longer exists. An annotation is valid **only for its own marking**. What remains:

- The link between annotations (`parentAnnotationId`, `allowedChildren`, `requiresOwner`): it is a data relation on the
  same marking.
- Inheritance of the **lock** (`lock.inherited`: a parent's lock reaches the descendants), which is a different thing.
- **Migration v12 → v13**: on opening, the app deletes `inherit` from each annotation and changes `schemaVersion` to 13.
  No annotation is lost; it just stops being valid for the child markings. Like every migration, the original goes
  to `backups/mapping.v12.<YYYYMMDD-HHMMSS>.json` before the first save (in folder mode) and the
  migration banner appears at the top.
- The **Diagnostics** records which annotations had inheritance on (how many and on which markings), for whoever
  wants to repeat the information by hand (for example, by copying the annotation to the children).
- The same v13 also brings containment by geometry (the next section) and will be extended by the following
  phases of the stage.

## Fields of v13 (containment)

v13 adds to the format the **canvas marking** and **containment by geometry**: who contains whom is
decided by the tool, from the rectangles, and written to the JSON. Whoever reads the file groups by
`parentId`; never computes an intersection or chooses the parent.

**New fields**

| Where          | Field         | Type             | Description                                                                                                                           |
| -------------- | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `markings[]`   | `containerId` | string or `null` | `null` = **canvas marking**: belongs to no container and wraps containers and other canvas markings.                                  |
| `markings[]`   | `floating`    | boolean          | **Floating** marking (a loose note over screens): lives on the canvas, sits on top of everything and is outside the containment tree. |
| `containers[]` | `parentId`    | string or `null` | The canvas marking that wraps the container (see the rules below), or `null`. Computed by the app.                                    |

- **The marking's space.** The container marking (`containerId` filled in) has a `rect` in **pixels of the container's
  original image**, inside the image, as always. The canvas marking (`containerId: null`) has a `rect`
  in **canvas units** (the same as the containers' `placement`), integers, with `x` and `y` possibly
  **negative** and no size limit. The file's `coordinateSystem` remains `image-pixels-exif-oriented`:
  the canvas marking is the **exception**, and the image crop does not apply to it.
- **`floating`.** The floating marking always has `containerId: null` and `parentId: null`, and no other marking
  or container has a floating one as parent. It can sit on top of a screen without becoming its child.
- **`parentId` is derived.** No person or agent chooses it: the app recomputes it at the end of every operation
  that touches geometry (draw, move, resize, move or resize the image, delete, apply a
  proposal). Reading the file, migrating and opening do **not** recompute it.
- **Members are not written.** The members of a marking are the markings and containers whose `parentId` is its
  `id`; derive them by grouping by `parentId`. There is no list of children in the JSON.

**Containment rules** (all over the written rectangles, one space at a time)

1. **Inside = fully contained.** A rectangle is inside another when it is entirely within it (touching the
   edge counts). Partial overlap is no relation at all; there is no tolerance in the format (the app's interaction
   has one, see `docs/ARCHITECTURE.md`).
2. **Marking's parent** = the **smallest** marking in the **same space** (the same container, or the canvas) that
   contains it. In ties, **the current relation holds** and the array order only decides the new tie:
   - **Equal rectangles** (same space, same rectangle): if one is the parent of the other, it stays so, even if a
     reordering put it later in the array. Within each group of equal rectangles the order (from outside to
     inside) is total and cycle-free: it is the topological ordering of the current `parentId`s within the group (the parent before the
     child) and, among those that are free at the same time, the one that comes earlier in the array goes first. Whoever has no parent in the
     group (a new marking, or one that has just arrived at the rectangle) enters by array order: the earlier one is the outer one. A
     `parentId` in a cycle (invalid file) is broken at the one that comes earlier in the array.
   - **Parent candidates of the same area** (the smallest containing area has more than one marking): from each group of
     equal rectangles only the inner one counts; if the current parent (`parentId`) is one of them, it stays; otherwise the one that
     comes last wins (in array order, with the groups of equal rectangles in the order above).
   - Reordering siblings (the **Order** in Details, `move_marking`, the proposal's `position`) never changes parents, not even in the
     next settle.
3. **Container's parent** = the **smallest** **canvas** marking (non-floating) that contains its rectangle on the
   canvas (`placement` × size × scale; since that rectangle can be decimal, the comparison has a tiny rounding tolerance). A container inside a container does not exist. A tie follows rule 2: among candidates of the same area, the container's current `parentId` stays if it is one of them (from each group of equal rectangles only the inner one counts); otherwise the one that comes last wins.
4. **Space change.** A container marking whose rectangle, on the canvas, no longer fits in the container becomes
   a canvas marking (and the reverse, when it fits entirely in a container): the `containerId` changes and the `rect` is
   converted from one space to the other, without changing the size the person sees. Its descendants go along.
5. **Floating outside the tree.** The floating marking is never a parent or a child, of a marking or of a container.
6. A marking has **only one parent**; groups that cross without containing one another generate no relation.

**New invariants** (they become opening errors, see "Validity rules"; the codes appear in the list of
problems): `container-parent-missing` (nonexistent container parent), `container-parent-not-canvas` (the container's parent
is not a canvas marking, or is floating), `container-outside-parent` (the container's parent
does not contain it), `floating-in-container` (floating with a container or parent) and `parent-floating` (floating parent).
The old ones remain, now per space: `parent-other-image` (parent in another space) and `rect-outside-parent`.
The file is validated only by the **consistency** of the declared `parentId` (it exists, is in the right space and contains); the
choice of the smallest marking is not an invariant, and it is the app that redoes it on the next geometry operation.

**Repair** (`Repair and open`): a floating marking inside a container goes to the canvas with the `rect`
converted; a parent of a floating marking, or a container parent that is nonexistent, not on the canvas or that does not
contain it, becomes `null`. What the repair does not resolve keeps rejecting the file.

**Migration v12 → v13 and v13 of ME0.** The migration adds `floating: false` to each marking and
`parentId: null` to each container (besides deleting `inherit`). It **does not settle**: the markings' `parentId`s
stay as they were and the containers' stay `null` until the first geometry operation. A v13
`mapping.json` written before the new fields (without `floating` or `containers[].parentId`) opens without
migration, with those defaults. Every v12 project has markings only in containers, so no canvas marking
is born in the migration.

**Key order on write:** `parentId` comes after `placement` in the container; `floating` comes after
`locked` in the marking; `arrows` comes between `markings` and `annotations`.

**Where `floating` comes from: the notes library.** The floating marking is born from an annotation type with
`floating: true` (specialization `formatVersion` 7, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Floating type"):
when an instance of the type is added, the app writes the marking with `containerId: null`, `parentId: null` and
`floating: true`, on the canvas. The app ships a library like that embedded, the **notes** one (`libraries/notas/`, id
`notas`, version 2: layer "Notes", type `nota` with the fields `titulo` and `texto` and type `tabela` with `titulo` and `linhas`, a key-and-value list drawn by a `repeat`), and **applies it by default**:

- a **new** project (folder or on this device) is born with it, with the copy in `specs/notas/` and the entry in
  `specializations[]`;
- a project opened from a schema **older than 13** gains the library on opening, in memory and without an undo entry;
  `specs/notas/` is written along with the migration backup, on the first write;
- a project that is **already v13** without it (removed by the person, or created without) stays as it is.

It is removed like any specialization (**Specializations › Remove**, deleting or converting the notes) and
does not come back when the project is reopened. Removing (deleting or converting) does not delete markings: the note's floating marking stays on the canvas, without an annotation. Whoever reads the file does not need to know this: the note is a typed annotation
(`specId` `notas`, `typeId` `nota`) on a marking with `floating: true`.

## Fields of v13 (arrows)

v13 brings the **arrow**: a marking that **points**. Instead of covering an area, it links two markings and describes the
relation between them (a deep link, a fired event). The stroke belongs to the visual world; the relation and its data belong
to the marking, so the arrow **can have annotations per layer**, like any marking, and can exist without any.
It lives in its own collection, `arrows`, between `markings` and `annotations`.

```json
{
  "id": "5d1c…",
  "from": "3f2a…",
  "to": "9b7e…",
  "fromSide": null,
  "toSide": "left",
  "points": [{ "x": 480, "y": 120 }],
  "style": "curve",
  "name": "opens the profile",
  "locked": false
}
```

| Field      | Type                | Description                                                                                                                                                                         |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string              | Unique **among markings and arrows**: an annotation's `markingId` points to either.                                                                                                 |
| `from`     | string              | Source marking. Never another arrow or a container (to point to a screen, point to a marking of it).                                                                                |
| `to`       | string              | Destination marking, different from `from`.                                                                                                                                         |
| `fromSide` | side or `null`      | `top`, `right`, `bottom` or `left`: the side of the source where the arrow attaches. `null` = automatic (the side facing the next point).                                           |
| `toSide`   | side or `null`      | The same, at the destination.                                                                                                                                                       |
| `points`   | array of `{ x, y }` | Waypoints, **the person's only** (no agent or proposal writes them). `[]` = the default route, side to side. Space derived from the two endpoints (below).                          |
| `style`    | string              | `straight`, `curve` (the default) or `elbow`. Straight and curve use the same points; the curve is just a smoothing of the drawing.                                                 |
| `name`     | string or `null`    | Optional label over the arrow, like a marking's name.                                                                                                                               |
| `locked`   | boolean             | Locked: the route, endpoints, sides and style do not change. Selecting, renaming and annotating remain free. The lock is **the arrow's only**: it does not come from the endpoints. |

The fields `fromSide`, `toSide`, `points`, `style`, `name` and `locked` may be missing in a hand-written file: they come in with
`null`, `[]`, `curve`, `null` and `false`, and the next write brings them.

**The space of the `points` is not written: it derives from the two endpoints.**

- The two markings in the **same container** (equal and non-null `containerId`): the `points` are in **container pixels**.
  The route follows the container moved or resized on the canvas without recomputation, and survives swapping the image for one of
  the same resolution (if the resolution changes, the points are rescaled along with the markings).
- In **any other case** (different containers, one endpoint on the canvas or floating): the `points` are in
  **canvas units**.
- If an endpoint **changes space** (the marking is dropped outside the container, enters another, becomes floating, or the
  applied proposal moves it), the `points` are **deleted** and the arrow goes back to the default route. Moving an endpoint within
  its space leaves the route still: only the first and last stretches stretch.

**Anchors.** Each endpoint attaches to the **midpoint** of a side of the marking (`fromSide`/`toSide`); with the side `null`, the
side is the box's side facing the next point (the first waypoint, or the other endpoint's center; at the arrival,
the last waypoint or the source's center), chosen by the dominant axis of the vector from the center to the target (tie:
horizontal). The drawn route is departure anchor, waypoints and arrival anchor, in canvas units.

**The `points` in the elbow (`elbow`).** The elbow stroke only has horizontal and vertical stretches, leaves perpendicular to the
source's side and arrives perpendicular to the destination's side (no obstacle avoidance). There **each point of `points`
pins a middle segment** of the stroke, in stroke order, and only the coordinate perpendicular to the segment counts (the `x` of
a vertical segment, the `y` of a horizontal one; the other is ignored, and the app writes the segment's midpoint in it). Moving a
marking stretches only the first and last segments; the middle ones stay still. The `points` only apply if the count
matches the sides: odd when the first and last segments are parallel (both horizontal or both
vertical), even when they are perpendicular; otherwise, and with empty `points`, the default route applies (the shortest, with
a minimum departure and arrival stretch), which follows the markings. The elbow's automatic side looks at the center of the other
marking, never at the points. Dragging a middle segment moves it in parallel (one history entry) and double-clicking
it goes back to the default route.

**Outside the containment tree.** The arrow has no `rect`, container or parent, is not a parent or a child, no drag
carries it and `get_marking_image` does not crop it. The settle only touches it to delete the `points` of an endpoint
that changed space.

**Cascade.** Deleting a marking deletes the arrows attached to it (as source or destination) and those arrows' annotations;
deleting a container deletes the arrows of its markings. The confirmation counts the arrows, and their annotations go into the
annotation count. An arrow's lock does not prevent deleting the marking it is attached to.

**Annotations on the arrow.** `annotations[].markingId` may be an arrow's id; the link between annotations
(`parentAnnotationId`) remains within the same owner. The type's `appliesTo` in the specialization (`marking`, `arrow` or
both) says where each type applies; see [`SPEC-FORMAT.md`](SPEC-FORMAT.md).

**New invariants:** `arrow-endpoint-missing` (the source or destination is not an existing marking), `arrow-self`
(source equal to destination) and the `duplicate-id` between arrow and marking or between two arrows. An annotation of an id that is neither
a marking nor an arrow remains `missing-marking`. **Repair:** an arrow with a nonexistent endpoint or linked to itself is
removed, and its annotations go in the next round; the repeated id has no mechanical repair (the file is rejected).

**Migration v12 → v13.** The migration writes `arrows: []` and **never creates an arrow**. A v13 `mapping.json` written before
arrows (without `arrows`) opens without migration, with `[]`.

## Fields of v14 (link roles and external documents)

v14 adds two fields, tied to the features of specializations' `formatVersion` 11
([`SPEC-FORMAT.md`](SPEC-FORMAT.md): `childRoles` and `docRepos`).

### Link role (`annotations[].parentRole`)

`parentRole` sits next to `parentAnnotationId` and is **always present**: `null` or the `id` of a role
(`childRoles[].id`) of the owner's type. A role accepts several children, with no maximum.

- **Opening invariant:** a non-null `parentRole` is a non-empty string (`empty-role`) and the annotation has an owner
  (`role-without-owner`). A file that violates either one is rejected, with the message; there is no mechanical
  repair.
- **Pending items** (computed, never written; they count in the "Incomplete" badge and in the Incomplete window, and do not
  block anything): `missing-role` (the owner's type declares `childRoles` and the child has no role) and
  `unknown-role` (the child has a role that the owner does not offer, including when the owner's type does not declare
  `childRoles`). A free owner or one of an unknown type generates no role pending item.
- **Who changes the role** (each gesture is an undo entry): creating the annotation already linked and with a role;
  changing the role; changing the owner (an owner that does **not** offer the current role clears the role **in the same
  entry**; one that offers it keeps it); removing the owner (clears the role). Otherwise the role is not touched: a role
  that stopped existing because the specialization was updated becomes a pending item.

### Local clone of the documents (`docRepos`)

```json
"docRepos": { "design-docs": { "localPath": "../design-docs" } }
```

Modeled on `platformRepos`: the key is the `id` from the specialization's `docRepos` (the same id in different
specializations is the same entry) and the value has only `localPath`, relative to the project folder, a non-empty
string. The MCP server is the reader; the app uses the folder connected in the browser. The object starts as `{}`.

### Migration v13 → v14

Every annotation gets `parentRole: null` and the project gets `docRepos: {}`. Existing links stay
**without a role**: if an owner's type later gains `childRoles`, the children show `missing-role`. As in
every migration, the original goes to `backups/` before the first write and the migration banner appears at the
top. An existing value is preserved.

## Fields of v15 (link in the same layer)

v15 neither adds nor changes fields: it only **widens the owner rule** (`parentAnnotationId`), tied to specializations'
`formatVersion` 13 ([`SPEC-FORMAT.md`](SPEC-FORMAT.md): `allowedChildren` with types from the
owner's own layer). A v14 file only needs the number bumped, and a v15 file opens in an earlier app
read-only.

- **The owner is in the same marking**, always. In which layer it may be depends on who the annotation is:
  - the **free** annotation still only has an owner in **another layer**;
  - the **typed** annotation may have an owner in the **same layer** (including of the same type) when the owner's type
    accepts its type in `allowedChildren` (the specialization decides; the `{ layer }` clause of the layer itself and the
    type's own id are valid from `formatVersion` 13). An owner in another layer remains as before;
  - **no cycle**: the chain of owners never returns to an already visited annotation (an annotation is never its own
    owner nor an ancestor's).
- The role (`parentRole`) works the same: the `id` of a `childRoles` of the owner's type, also when the owner and the
  child are in the same layer (the event that owns other events in the Success and Failure roles).
- **Opening invariant:** the owner exists, is in the same marking, forms no cycle, and the **free** annotation has
  no owner in its own layer (`annotation-parent-same-layer`). In the **typed** one, an owner in the same layer whose type
  does not accept the link does **not** prevent opening: it becomes the pending item `owner-not-allowed`.

### Migration v14 → v15

Only `schemaVersion` changes to 15; no data is altered. As in every migration, the original goes to
`backups/` before the first write and the migration banner appears at the top.

## Fields of v16 (perspectives)

A **perspective** is a slice of the project: which roots appear, where they sit on the canvas and which layers stay
hidden. The content is the project's; **only the position of the roots** changes from one perspective to another. The
**Main** one is implicit (it shows everything, in the usual position) and is not in the file. `mapping.json` only stores the
**"For everyone"** perspectives; the "Only me" ones stay in the browser of whoever created them, in the same format.

```json
"project": { "id": "6f1c…", "name": "…", "createdAt": "…", "updatedAt": "…" },
"perspectives": [
  {
    "id": "P1",
    "name": "Analytics",
    "hiddenLayers": ["L3"],
    "items": [{ "root": "C2", "x": 1200, "y": 40 }]
  }
],
"arrivals": [{ "root": "M21", "from": "P1", "fromName": "Analytics" }]
```

- **`project.id`**: a UUID (non-empty string) created on migration and on project creation, which never changes. It
  keys what stays in the browser (the open perspective, the "Only me" ones). A file without it is rejected
  (`invalid-schema`); the v15 → v16 migration creates it.
- **Root**: the **container without a parent** (`parentId` null), the **canvas marking without a parent** (`containerId` and `parentId`
  null) and the **floating marking**. They are the only items that a perspective positions; what is inside a
  root follows the root.
- **`perspectives[]`**: `id` (unique among perspectives); `name` (unique among perspectives, case-insensitive
  and ignoring leading and trailing spaces); `hiddenLayers` (ids of existing layers hidden in this perspective;
  a new layer is born visible in all of them); `items` (one entry per root, without repeats).
- **`items[].x` and `items[].y`**: finite numbers, the **top-left corner of the root** in canvas units.
  It is the same as the container's `placement.x`/`placement.y` and the canvas or floating marking's `rect.x`/`rect.y`
  in Main. A root that is not in `items` does not appear in the perspective.
- **`arrivals[]`**: a "Came from…" mark of a root **created outside Main** that has arrived there. `root` is the root;
  `from` is the id of the source perspective (it may no longer exist); `fromName` is its name, stored so the mark
  survives the perspective.

### Validity rules (v16)

Each code below rejects opening (and has a mechanical repair, see "Inconsistent files"):

| Code                         | When                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `perspective-root-missing`   | `items[].root` is neither a container nor an existing marking.                         |
| `perspective-root-not-root`  | `items[].root` exists, but is not a root (it has a parent, or is a container marking). |
| `perspective-root-duplicate` | The same root appears twice in the same perspective.                                   |
| `perspective-layer-missing`  | `hiddenLayers` cites a layer that does not exist.                                      |
| `perspective-duplicate-name` | Two perspectives with the same name (case-insensitive, with `trim`).                   |
| `duplicate-id`               | Two perspectives with the same `id`.                                                   |
| `arrival-root-missing`       | `arrivals[].root` does not exist.                                                      |
| `arrival-root-not-root`      | `arrivals[].root` exists, but is not a root.                                           |
| `arrival-duplicate`          | The same root has two arrivals.                                                        |

`x` and `y` must be finite numbers and `name` and `fromName` strings (the schema); an empty or repeated name of a
perspective created in the app is refused by the model before reaching the file. Missing `perspectives` and `arrivals`
are worth `[]`.

### How a reader uses perspectives

- **Group by `parentId` as always**: containment is the project's, the same in every perspective. A perspective's position
  is **interface-only**: it does not change `parentId`, `rect`, `placement` or any annotation, and
  no perspective changes what the markings mean.
- A reader that does not draw the canvas may **ignore** `perspectives` and `arrivals`. Whoever writes the file by hand does not
  need to declare them.
- Key order: `project.id` first inside `project`; `perspectives` and `arrivals` right after `arrows`
  (before `annotations`); in each item, the keys in the order above (`id`, `name`, `hiddenLayers`, `items`;
  `root`, `x`, `y`; `root`, `from`, `fromName`).

### Migration v15 → v16

The project gains `project.id` (a new UUID; an existing `id` is preserved), `perspectives: []` and
`arrivals: []` (existing values are preserved). The migration never creates a perspective: Main keeps
showing everything, as before. As in every migration, the original goes to `backups/` before the first write and the
migration banner appears at the top. A v16 file opens in an earlier app read-only.

## Fields of v17 (reference to the whole annotation)

v17 neither adds nor changes file fields: it only admits a **new value** in `ref` fields and cells,
the fourth format `{ "annotationId" }` (see "References (`ref`)"), tied to specializations'
`formatVersion` 14 ([`SPEC-FORMAT.md`](SPEC-FORMAT.md): `accepts.annotations`). A v16 file only needs the
number bumped. An earlier app rejects the v17 file as a "newer version", instead of showing broken `ref`s.

- **Value:** `{ "annotationId" }`, without `key`, `entryId` or `rowId`.
- **Target:** a typed annotation of a type covered by `accepts.annotations`, of the same specialization as the
  source, in any marking or container, never the source annotation itself.
- **Pending items:** target deleted → `broken-ref`; type that is no longer accepted → `ref-not-accepted`.

### Migration v16 → v17

Only `schemaVersion` changes to 17; no data is altered. As in every migration, the original goes to
`backups/` before the first write and the migration banner appears at the top.

## Fields of v18 (drawing mode)

v18 adds the **drawing mode**, which chooses the mode of the specializations' `tokens` (`light`, `dark`…;
see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), `formatVersion` 15) with which the components are drawn. It does not
depend on the interface's light/dark theme.

- **`drawingMode` at the root** (string, optional): the project's mode. Absent, each specialization uses its
  **first mode**.
- **`containers[].drawingMode`** (string, optional): the mode that the container pins. Absent, the container **follows the
  project**. The canvas marking (`containerId` null) always follows the project. A marking's effective mode is
  its container's, if it pins one; otherwise the project's.
- **`null` in the container** is read as absent and **is not written**; the field only appears in the file when it has a value.
- **Name:** the same pattern as the specialization's modes (`^[a-z0-9][a-z0-9-]*$`).
- **Undeclared mode:** a mode that no specialization of the project declares in `tokens.modes` is still
  written, and the drawing falls back to that specialization's first mode; the **Diagnostics** warns. The file is not
  rejected.

- **Minimum marking size:** a marking with an annotation of a type **with a component** is valid from **1 px** per side
  (the component's `minSize`, if any, still governs gestures and the MCP); a regular marking keeps **8 px** in
  gestures and the MCP. **Reading the file** accepts any marking of 1 px or more, with or without a component: the
  `rect-too-small` invariant only applies below 1 px. No new field and no migration.

An earlier app rejects the v18 file as a "newer version", instead of ignoring the mode and drawing wrong.

### Migration v17 → v18

Only `schemaVersion` changes to 18; no data is altered (no mode is created). As in every migration, the original
goes to `backups/` before the first write and the migration banner appears at the top.

## Fields of v19 (density)

v19 adds the **container density**: how many image pixels one **component unit** is worth (1 dp on
Android, 1 pt on iOS, 1 CSS px at 1x). The component's numbers (`size`, `minSize`, sizes, `gap`, `padding`,
`font.size`…; see [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Units and density") are units; the
markings, arrows and containers remain in image pixels and canvas units. In a 3x capture (1080 px
for 360 dp) the density is 3.

- **`containers[].density`** (number, optional): from **0.5 to 8**; absent or `null` is worth **1**. It comes after
  `background` and `drawingMode`. The file only stores the field when it has a value and **`null` is not written**.
- **Invariant `container-density`:** a present `density` must be finite and from 0.5 to 8; outside that, reading
  reports the violation (the MCP refuses the value with the same code).
- **What density changes:** the component's drawing (the scene root carries `translate · scale(density)`), the
  marking's `minSize` (`minSize` × density, rounded up), the instance's initial size (`size` × density), Arrange and the
  fit to content (they measure in units and write in pixels) and the drawing proof. No marking pixel
  changes when the density changes; the specialization and the component do not change.
- **Proposal:** the container's `density` field goes in the proposal's `formatVersion` 7 (see
  [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)).

An earlier app rejects the v19 file as a "newer version", instead of discarding the density when writing.

### Migration v18 → v19

Only `schemaVersion` changes to 19; no data is altered (no density is created). As in every migration, the
original goes to `backups/` before the first write and the migration banner appears at the top.

## Fields of v20 (direction and anchor)

v20 adds the **reading direction**: `ltr` (left to right) or `rtl` (right to left). The components' engine receives it and mirrors
rows (`row`), grids, the `start` and `end` positions and
`mirror` nodes (see [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Reading direction"). The **anchor**
links a marking to another one in the same space (tooltip, badge, menu) and comes in the same version (v20); it comes after the direction, below.

- **`direction` at the root** (`"ltr"` or `"rtl"`, optional): the project's direction. Absent is worth `ltr`. It comes after
  `drawingMode`.
- **`containers[].direction`** (`"ltr"` or `"rtl"`, optional): the direction that the container pins. Absent, the container
  **follows the project**. The canvas marking (`containerId` null) and the floating one always follow the project. A marking's effective
  direction is its container's, if it pins one; otherwise the project's; otherwise `ltr`. It comes after
  `drawingMode` and before `density`.
- **`null` in the container** is read as absent and **is not written**; the field only appears in the file when it has a value.
  Any value other than `ltr`/`rtl` is a schema error (the file does not open).
- **What direction changes:** only the drawing and Arrange of components (rows and grids mirror, the first child
  of a row sits at the right, the position of a new child comes to the left of the last one). No marking pixel
  changes when the direction changes; the specialization and the component do not change.
- **Proposal:** the `direction` field of the container and of the `project` entity goes in the proposal's `formatVersion` 8 (see
  [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)).

### Anchor (`markings[].anchor`)

- **`anchor`** (object, optional): the marking declares **another marking in the same space** as its anchor. The keys:
  `to` (required: the id of the anchor marking); `side` (`top`, `bottom`, `start` or `end`: on which side of the anchor the
  marking sits, outside it); `align` (`start`, `center` or `end`: the alignment along that side); `offset`
  (`{ main, cross }`, numbers). `main` is the distance from the anchor's edge (negative overlaps); `cross` is the
  offset **along** the side and is **logical**: with `side` `top` or `bottom`, positive goes in the reading
  direction (to the right in `ltr`, to the left in `rtl`); with `start` or `end`, positive goes down. Both
  are in **container pixels** (like the `rect`; on the canvas, in its units). `start` and `end` follow the effective
  direction (see above).
- **Absent keys** (`side`, `align`, `offset`) take the defaults of the marking's component (the `anchor` key
  of the component's root, in units converted by the container's density; see [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md),
  "Anchor") and, without those, `top`, `center` and `{ main: 0, cross: 0 }`.
- **`null` and absent** are the same ("no anchor"). The key is only **written** when present and non-null: a project
  without anchors comes out the same as before.
- **Invariants** (in the same set as the other validity rules): `anchor-missing` (`to` is not an existing
  marking), `anchor-self` (the marking anchored to itself), `anchor-other-space` (the anchor is in another
  container, or one is on the canvas and the other in a container) and `anchor-cycle` (A anchored to B and B to A, directly or
  through a chain). The mechanical repair is to drop the anchor (`anchor: null`; the marking stays where it is, and in a cycle
  each of those that close it is dropped), the same as the model does when deleting the target. Only markings
  count (never a container or an arrow).
- **It is not containment.** The anchor is a relation beside the containment tree, like the arrow: `parentId`
  remains decided only by geometry (`settleHierarchy` does not read it), and the `rect` remains the truth. The
  marking **does not follow the anchor on its own**: it only snaps back through an **action** (**Snap to anchor** in the app,
  `snap_to_anchor` and `create_marking` without `rect` in the MCP).
- **Moving carries along; resizing does not.** Moving the anchor (dragging, the keyboard arrows, `update_marking` with `move` in the MCP, a
  multi-selection) moves the markings anchored to it, **even locked ones**, and their descendants, and those anchored
  to them, in a chain: the same offset, in one undo entry. Resizing the anchor moves none.
- **Deleting the anchor** sets `anchor: null` on the anchored markings (they stay where they are).
- **Leaving the target's space drops the anchor.** When the anchored marking leaves the target's space (moved out of the
  container, to another container or to the canvas), the model writes `anchor: null` on it instead of refusing the operation
  (`anchor-other-space` only applies when **writing** an anchor between different spaces); the same holds when it is the target that
  leaves the anchored markings' space. The `rect` does not change because of this.
- **Index.** `projectIndex(p)` gains `anchoredBy` (target to the anchored markings, in array order) and `anchorOf` (marking
  to the target's id).
- **Proposal:** the anchor in marking creation and change raises the proposal to `formatVersion` 9 (see
  [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md); `snap_to_anchor` alone does not raise it: it is just the Position); the review shows it as the "Anchor" field and the snap as the usual Position.

An earlier app rejects the v20 file as a "newer version", instead of discarding the direction or the anchor when writing.

### Migration v19 → v20

Only `schemaVersion` changes to 20; no data is altered (no direction or anchor is created). As in every migration, the
original goes to `backups/` before the first write and the migration banner appears at the top.

## Migration

v1 files are migrated on opening: every image gets `name: null` and every annotation gets
`inherit: false` and `parentAnnotationId: null`. v2 files get `markingColor: null` on each image.
v3 files get `specializations: []`, `spec: null` on each layer, `type: null` and
`values: null` on each annotation and a new `id` on each pair. v4 files get `locked: false` on each
image and each marking. v5 files get `revision: 0`. v6 files get `platformRepos: {}`.
v7 files get `source: null` on each image and each marking. v8 files lose the values of the
`codeRef` fields, by the type declared in the specialization copy (see "Fields of v9"). v9 files
get `background: null` on each image (see "Fields of v10"). v10 files lose the `urlTemplate` of
each `platformRepos` entry, and an entry that only had it goes away (see "Fields of v11"). v11 files swap `images` for `containers` and `imageId` for `containerId` (see "Fields of v12"). v12 files lose `inherit` from each annotation and gain `floating: false` on each marking, `parentId: null` on each container and `arrows: []` at the root (see "Fields of v13"). v13 files gain `parentRole: null` on each annotation and `docRepos: {}` at the root (see "Fields of v14"). v14 files only get the number bumped (see "Fields of v15"). v15 files gain `project.id` (a new UUID), `perspectives: []` and `arrivals: []` (see "Fields of v16"). v16 files only get the number bumped (see "Fields of v17"). v17 files only get the number bumped (see "Fields of v18"). v18 files only get the number bumped (see "Fields of v19"). v19 files only get the number bumped (see "Fields of v20"). On save, the
file becomes v20 (and, in folder mode, the original goes first to `backups/`, as in any
migration).
Files of a newer version open read-only.
