import { z } from 'zod';
import { ANCHOR_ALIGNS, ANCHOR_SIDES, READING_DIRECTIONS } from '../src/model';
import { MAX_BASE64_TEXT } from './image/formats';

// Operations of `plan_changes` (stage 3a.5). Each one becomes one or more pure operations of
// `src/model/`, applied in order (mcp/batch.ts). The names follow the model's vocabulary.

const ALIAS = /^\$[A-Za-z0-9_-]+$/;

const alias = z
  .string()
  .regex(ALIAS, 'alias: "$" followed by letters, numbers, "_" or "-"')
  .optional()
  .describe(
    'Temporary alias (e.g. "$door") to cite the created item in the following operations of this batch.',
  );

const item = (what: string) =>
  z
    .string()
    .describe(
      `${what}: reference (\`mapping://project/m/3f2a9c1e\`, \`m/3f2a9c1e\`), full id or alias \`$name\` created earlier in the batch.`,
    );

const layer = z
  .string()
  .describe('Layer: id, name, `specId/layerId` (specialization layer) or alias `$name`.');

const int = z.number().int();
const rect = z
  .object({ x: int, y: int, width: int, height: int })
  .describe(
    'Rectangle in whole pixels of the container (with a file: of the original image, with the EXIF orientation).',
  );

const name = z.string().nullable().describe('Name; empty or `null` removes the name.');

const externalSource = z
  .object({
    system: z.string().describe('Source system (free text, e.g. "figma").'),
    id: z.string().describe('Id of the element in the source system.'),
    url: z
      .string()
      .nullable()
      .optional()
      .describe('Link to the element at the source (optional).'),
  })
  .nullable()
  .describe(
    'External identity of the element, so re-exports recognize the same item (see find_by_source). `null` clears it.',
  );

const imageSource = {
  file: z
    .string()
    .optional()
    .describe(
      'Image file (PNG, JPEG or WebP) inside the roots: relative to the project folder or to a root, or absolute.',
    ),
  base64: z
    .string()
    .max(MAX_BASE64_TEXT)
    .optional()
    .describe(
      'Image content in base64 (accepts the `data:image/…;base64,` prefix), up to 16 MB of image; for larger ones, use `file`.',
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      'File name in `images/` (the extension becomes .webp if the image is optimized). Default: the name of `file` or `img-YYYYMMDD-HHMMSS`.',
    ),
};

const entries = z
  .array(
    z.object({
      key: z.string(),
      value: z.string(),
      id: z.string().optional().describe('Id of an existing pair (keeps the identity).'),
    }),
  )
  .describe(
    'Key-value pairs of the free-form annotation (they replace all of them). A pair with the same key as an existing one keeps the id, so references to it stay valid.',
  );

const values = z
  .record(z.string(), z.json())
  .describe(
    "Values of the typed annotation's fields, by `key` (see get_specialization). `null` clears. " +
      '`table` field: the list of rows, which replaces the table (`{"_id": "…"}` keeps an existing row; `"_as": "$row"` gives the row an alias). ' +
      '`ref` field: `{"annotation": <annotation>, "entry": <key or id of the pair>}` (pair of a free-form annotation), ' +
      '`{"annotation": <annotation>, "key": <table field>, "row": <id, alias or index of the row>}` or `{"annotation": <annotation>, "key": <field>}` or just `{"annotation": <annotation>}` (the whole annotation; the field needs `accepts.annotations`). ' +
      'A key that is not a field of the type fails with `unknown-field`.',
  );

const owner = item(
  'Owner annotation (same marking; another layer, or the same one for a typed annotation whose type accepts it)',
)
  .nullable()
  .optional()
  .describe(
    'Owner annotation (link, e.g. the onClick of a Button): reference, id or alias; `null` removes the link.',
  );

const arrowStyle = z.enum(['straight', 'curve', 'elbow']);

// The arrow's route (`points`) is never written by the server: the field exists only so the operation
// can refuse it with a clear error (without it, zod would silently discard it).
const noPoints = z
  .unknown()
  .optional()
  .describe(
    'Do not use: the route belongs to the person (refused with `invalid-arguments`).',
  );

/**
 * The anchor of a marking (schema v20): `to` is the target marking (reference, id or alias); an absent
 * `side`, `align` or `offset` takes the component's defaults (`anchor` at its root; without them, `top`,
 * `center` and 0).
 */
const anchorShape = z
  .object({
    to: item('Anchor target marking (in the same space)'),
    side: z
      .enum(ANCHOR_SIDES)
      .optional()
      .describe(
        "Side of the target where the marking sits: `top`, `bottom`, `start` or `end` (the last two follow the reading direction: in `rtl`, `start` is the right side). Absent: the component's `anchor.side`, otherwise `top`.",
      ),
    align: z
      .enum(ANCHOR_ALIGNS)
      .optional()
      .describe(
        "Alignment along that side: `start`, `center` or `end`. Absent: the component's `anchor.align`, otherwise `center`.",
      ),
    offset: z
      .object({ main: z.number().finite(), cross: z.number().finite() })
      .optional()
      .describe(
        "Offset in container pixels (on the canvas, canvas units): `main` is the distance from the target's edge (negative overlaps) and `cross` moves along the side. Absent: the component's `anchor.offset` (in units × `density`), otherwise 0.",
      ),
  })
  .describe(
    "Anchor: the marking sits against another one in the same space (`to`). It only links the two (the component's drawing reads the target's side and position through `$anchor.*`); `snap_to_anchor` actually snaps it. Moving the target takes the anchored marking along; resizing the target does not.",
  );

const drawingModeField = z
  .string()
  .nullable()
  .optional()
  .describe(
    "Drawing mode (`[a-z0-9][a-z0-9-]*`, e.g. `dark`): picks the values of the specializations' `tokens`. `null` goes back to following the project's; absent does not change.",
  );

/** `ltr`/`rtl`, `null` (removes) or absent (does not change): the field shared by the container and the project. */
const readingDirectionField = z.enum(READING_DIRECTIONS).nullable().optional();

const directionField = readingDirectionField.describe(
  "`direction`: reading direction that pins the container (`ltr`, `rtl`; `null` follows the project; absent does not change). In `rtl`, the component's rows, grids and `start`/`end` positions are mirrored.",
);

const densityField = z
  .number()
  .nullable()
  .optional()
  .describe(
    "Density: how many image pixels one component unit is worth (dp, pt, px at 1x), from 0.5 to 8; 3 for a 1080 px capture of a 360 dp phone (image width ÷ width of the finished size). The component's `size` and `minSize` are in units and the `rect` in pixels (`rect` = units × `density`). `null` goes back to 1 (in `update_container`); absent does not change.",
  );

/** Fields of `update_container` (and of the old `update_image`). */
const updateContainerFields = {
  name: name.optional(),
  source: externalSource.optional(),
  x: z.number().optional().describe('Position on the canvas (canvas units).'),
  y: z.number().optional(),
  scale: z
    .number()
    .optional()
    .describe('Canvas units per container pixel (displayed size).'),
  markingColor: z
    .string()
    .nullable()
    .optional()
    .describe('Border color of the markings (#RRGGBB) or `null` (theme color).'),
  locked: z.boolean().optional().describe('Lock or unlock the container.'),
  drawingMode: drawingModeField,
  direction: directionField,
  density: densityField,
  markingsLocked: z
    .boolean()
    .optional()
    .describe("Lock (or unlock) all the container's markings."),
  background: z
    .string()
    .optional()
    .describe(
      'Only on a container without a file (plain background): new background color `#RRGGBB`. On a container with a file it fails with `container-has-file`.',
    ),
  width: int
    .min(1)
    .max(20000)
    .optional()
    .describe(
      'Only on a container without a file (plain background): new width in pixels (the markings must stay inside). On a container with a file it fails with `container-has-file`.',
    ),
  height: int
    .min(1)
    .max(20000)
    .optional()
    .describe(
      'Only on a container without a file (plain background): new height in pixels (the markings must stay inside). On a container with a file it fails with `container-has-file`.',
    ),
};

/** Fields of `replace_container` (and of the old `replace_image`): the new image file. */
const replaceContainerFields = {
  ...imageSource,
  source: externalSource
    .optional()
    .describe('New source of the container; if omitted, the current source is kept.'),
  confirmAspectChange: z
    .boolean()
    .optional()
    .describe(
      'Required if the aspect ratio changes: the markings are rescaled and marked "needs review".',
    ),
};

export const operationSchema = z.discriminatedUnion('op', [
  // Project
  z.object({
    op: z.literal('update_project'),
    drawingMode: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Drawing mode of the project (`[a-z0-9][a-z0-9-]*`, e.g. `dark`): picks the values of the specializations' `tokens` (it is not the app's light/dark theme). `null` removes it (goes back to the first mode of each specialization); absent does not change.",
      ),
    direction: readingDirectionField.describe(
      "Reading direction of the project (`ltr`, `rtl`): in `rtl`, the components' rows, grids, `start`/`end` positions and `mirror` icons are mirrored, in the containers that do not pin their own. `null` removes it (goes back to `ltr`); absent does not change.",
    ),
  }),
  // Repositories per platform
  z.object({
    op: z.literal('set_platform_repo'),
    platform: z
      .string()
      .describe(
        'Id of a platform declared by the applied specializations (see `platforms` in get_project).',
      ),
    localPath: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Root of the local clone of the platform's repository, relative to the project folder (e.g. `../../..`). `null` or empty removes the setting. The repository address comes from the specialization (`platforms[].repo`), not from the project: `urlTemplate` here fails with `unknown-field`.",
      ),
    urlTemplate: z.unknown().optional().describe('No longer exists: see `localPath`.'),
  }),
  z.object({
    op: z.literal('remove_platform_repo'),
    platform: z.string().describe('Platform whose repository setting is removed.'),
  }),
  // Document repositories (local clone, modeled on the platform ones)
  z.object({
    op: z.literal('set_doc_repo'),
    repo: z
      .string()
      .describe(
        'Id of a document repository (`docRepos`) declared by the applied specializations (see `docRepos` in get_project).',
      ),
    localPath: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Root of the local clone of the document repository, relative to the project folder (e.g. `../../design-docs`). get_component reads the type's `.md` through it. `null` or empty removes the setting. The repository address comes from the specialization (`docRepos[].url`), not from the project.",
      ),
  }),
  z.object({
    op: z.literal('remove_doc_repo'),
    repo: z.string().describe('Document repository whose local clone is removed.'),
  }),
  // Layers
  z.object({
    op: z.literal('create_layer'),
    as: alias,
    name: z.string(),
    color: z
      .string()
      .optional()
      .describe('#RRGGBB; default: the next free color of the palette.'),
  }),
  z.object({
    op: z.literal('update_layer'),
    layer,
    name: z.string().optional().describe('Only free-form layers can be renamed.'),
    color: z.string().optional().describe('#RRGGBB'),
  }),
  z.object({
    op: z.literal('move_layer'),
    layer,
    index: int.min(0).describe('New position (0 = first).'),
  }),
  z.object({
    op: z.literal('delete_layer'),
    layer: layer.describe(
      'Free-form layer to delete (with its annotations and the ones linked to them).',
    ),
  }),
  // Specializations
  z.object({
    op: z.literal('apply_specialization'),
    file: z
      .string()
      .describe('Specialization file (JSON) inside the roots; the copy goes to specs/.'),
  }),
  z.object({
    op: z.literal('update_specialization'),
    file: z
      .string()
      .describe('New (greater) version of an already applied specialization.'),
  }),
  z.object({
    op: z.literal('remove_specialization'),
    specId: z.string(),
    mode: z
      .enum(['delete', 'convert'])
      .describe(
        '`delete` deletes its layers and annotations; `convert` turns them into free-form ones.',
      ),
  }),
  // Containers
  z.object({
    op: z.literal('add_container'),
    as: alias,
    ...imageSource,
    drawingMode: drawingModeField,
    direction: directionField,
    density: densityField,
    name: z
      .string()
      .optional()
      .describe(
        'Name of the container (default: the file name, or no name on a background-only container; the app shows "Container").',
      ),
    width: int
      .min(1)
      .max(20000)
      .optional()
      .describe(
        'Background-only container: width in pixels (1 to 20000; e.g. 390 on a phone). With `file`/`base64` the width comes from the file and `width` does not apply.',
      ),
    height: int
      .min(1)
      .max(20000)
      .optional()
      .describe(
        'Background-only container: height in pixels (1 to 20000; e.g. 844 on a phone). With `file`/`base64` the height comes from the file and `height` does not apply.',
      ),
    background: z
      .string()
      .optional()
      .describe(
        'Background-only container: color `#RRGGBB`. With `file`/`base64` the container has the image as its content and `background` does not apply.',
      ),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Canvas point near which the container is placed (default: to the right of the other containers).',
      ),
    beside: item('Reference container')
      .optional()
      .describe(
        'Reference container (reference, id or alias `$name`): the new one is created to its right, with the top aligned and the SAME scale (use it for content outside the image, next to the screen). Occupied spot: goes to the nearest free space. Do not combine with `center`.',
      ),
  }),
  z.object({
    // Old, accepted with a warning: use `add_container` with `file`.
    op: z.literal('add_image'),
    as: alias,
    ...imageSource,
    name: z
      .string()
      .optional()
      .describe("Old: use `add_container` with `file`. Name (default: the file's)."),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Canvas point near which the container is placed (default: to the right of the others).',
      ),
  }),
  z.object({
    // Old, accepted with a warning: use `add_container` with `width`, `height` and `background`.
    op: z.literal('add_blank_image'),
    as: alias,
    name: z
      .string()
      .optional()
      .describe('Old: use `add_container`. Name of the container (default: no name).'),
    width: int
      .min(1)
      .max(20000)
      .describe('Width of the container in pixels (1 to 20000; e.g. 390 on a phone).'),
    height: int
      .min(1)
      .max(20000)
      .describe('Height of the container in pixels (1 to 20000; e.g. 844 on a phone).'),
    background: z.string().describe('Background color `#RRGGBB`.'),
    source: externalSource.optional(),
    center: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe(
        'Canvas point near which the container is placed (default: to the right of the others).',
      ),
  }),
  z.object({
    op: z.literal('update_container'),
    container: item('Container'),
    ...updateContainerFields,
  }),
  z.object({
    // Old, accepted with a warning: use `update_container` (the `image` argument became `container`).
    op: z.literal('update_image'),
    image: item('Container'),
    ...updateContainerFields,
  }),
  z.object({
    op: z.literal('replace_container'),
    container: item('Container'),
    ...replaceContainerFields,
  }),
  z.object({
    // Old, accepted with a warning: use `replace_container`.
    op: z.literal('replace_image'),
    image: item('Container'),
    ...replaceContainerFields,
  }),
  z.object({ op: z.literal('delete_container'), container: item('Container') }),
  // Old, accepted with a warning: use `delete_container`.
  z.object({ op: z.literal('delete_image'), image: item('Container') }),
  // Markings
  z.object({
    op: z.literal('create_marking'),
    as: alias,
    annotationAs: alias.describe(
      'Temporary alias (e.g. "$button") to cite the annotation created by `annotation` in the following operations.',
    ),
    container: item('Container')
      .optional()
      .describe(
        'Container where the marking is created. Omitted (and without the old `image`): canvas marking, with `rect` in canvas units.',
      ),
    image: item('Container')
      .optional()
      .describe('Old: use `container`. Accepted with a warning.'),
    near: item('Container or marking')
      .optional()
      .describe(
        'Only for a floating annotation type: the marking is created in a free spot on the margin of this container or marking, stacked from top to bottom (reference, id or alias). It positions it, and the `rect`, if given, supplies only the size (x and y are ignored). For a non-floating type or marking, it is ignored with a warning.',
      ),
    inside: item('Component with a slot')
      .optional()
      .describe(
        "Places the child in this component's slot, after the last child (reference, id or alias of a marking in the batch or in the project); the parent still comes from the geometry. Requires `annotation` of a type with a component and a target that draws a component with a slot (`invalid-parent` if it does not, or if `container` is another one). With `rect`, the `rect` supplies only the size (x and y are ignored). Full slot: the child stays attached to the component, with an `ignored-argument` warning. Does not apply with `near`.",
      ),
    rect: rect
      .optional()
      .describe(
        "Rectangle in container pixels (without `container`: canvas units, possibly negative). Required, unless `annotation` is of a type with a component: then, if omitted, the marking is created at the component's initial size (in the center of the container; inside the slot with `inside`). The minimum of each side is 8 px on a plain marking and 1 px on a marking with an annotation of a type with a component (if the component declares `minSize`, that minimum applies); below it, it fails with `rect-too-small`.",
      ),
    name: name.optional(),
    source: externalSource.optional(),
    anchor: anchorShape
      .optional()
      .describe(
        "Anchor (see `anchor` in `update_marking`). With `annotation` of a type with a component and without `rect`, the marking is created at the measured size already snapped to the anchor (the side, alignment and offset that `anchor` does not specify come from the `anchor` at the component's root); with `rect`, the `rect` rules and the anchor is only stored. Does not apply with `near` or `inside`.",
      ),
    parent: item('Parent marking')
      .nullable()
      .optional()
      .describe(
        'Old: accepted with a warning and ignored. The parent comes from the geometry (the innermost marking that contains the rectangle).',
      ),
    annotation: z
      .object({
        type: z
          .string()
          .describe(
            'Type of the typed annotation: `specId/typeId`, `typeId` or the type name.',
          ),
        layer: layer
          .optional()
          .describe(
            "Layer (must be the type's; default: the type's layer in the specialization).",
          ),
        name: name.optional(),
        values: values.optional(),
      })
      .optional()
      .describe(
        "Creates, together with the marking, a typed annotation (an instance of the type). When the type has a component, the fields start with the component's `preview` (like the app's palette) and `values` overrides only the fields given, also after `apply_specialization` or `update_specialization` in the same batch (the batch already sees the components of the new version). If the type declares a component and the batch cannot find it, the step warns (`ignored-argument`) that the annotation was created without the preview and without the minimum size.",
      ),
  }),
  z.object({
    op: z.literal('import_measured'),
    container: item('Container').describe(
      "Container where the markings are created (reference, id or alias `$name`). The tree's rectangles are in its pixels, after `scale` and `offset`.",
    ),
    system: z
      .string()
      .describe(
        'The `system` of a `kind: "measured"` origin declared by an applied specialization (`origins`): the `sources` of the types with that `system` say how to match each node and each field.',
      ),
    tree: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'The measured tree inline: `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }` (root node). Use `tree` OR `file`, never both.',
      ),
    file: z
      .string()
      .optional()
      .describe(
        'A `.json` with the measured tree inside the roots (relative to the project folder or to a root, or absolute). Use `file` OR `tree`.',
      ),
    offset: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe('Offset in container px, added after the scale (default 0, 0).'),
    scale: z
      .number()
      .positive()
      .optional()
      .describe('Multiplier of the measured rectangles (default 1; 2 for a 2× capture).'),
  }),
  z.object({
    op: z.literal('wrap_items'),
    as: alias,
    items: z
      .array(item('Marking or container'))
      .min(1)
      .describe(
        "Markings and containers to wrap (reference, id or alias; the same as the app's Wrap). Notes (floating) and arrows are ignored with a warning; if nothing goes in, the operation fails with `invalid-parent`.",
      ),
    name: name
      .optional()
      .describe(
        'Name of the new marking (as in `create_marking`); without a name, it is created without one.',
      ),
    source: externalSource.optional(),
  }),
  z.object({
    op: z.literal('move_marking'),
    marking: item('Marking'),
    index: int
      .min(0)
      .describe(
        'New position among its siblings (same container and same parent): 0 = the first, drawn at the bottom; the last one is on top. The siblings are the ones in the batch state at that point, after the previous operations (an earlier `update_marking` can remove or add siblings); if the marking is already at that position, nothing changes and the summary says so.',
      ),
  }),
  z.object({
    op: z.literal('fit_marking'),
    marking: item('Marking').describe(
      "The marking of a component whose `sizing` depends on its content (`hug` or an expression on an axis; see `get_component`) and that has no markings in the slot. Each such axis becomes the measured size with the annotation's values at that point of the batch (rounded up to an integer, between the `minSize` and the root's limits; the `fill` axis, the absent one and the one stretched by the parent's `stretch` do not change; it never exceeds the image); the top-left corner stays. Call it after changing a value that alters the content (text, a field that turns a part on or off), in the same batch or the same proposal: editing the value alone does not change the rectangle. The summary gives the rectangle before and after (or says that nothing changed). It fails with `not-fittable` (no axis depends on the content) and `locked` (locked geometry that would change).",
    ),
  }),
  z.object({
    op: z.literal('snap_to_anchor'),
    marking: item('Marking').describe(
      "A marking with `anchor` (see `update_marking`). It is snapped to the anchor: the rectangle comes from the `side`, the `align` and the `offset` (what the anchor does not specify comes from the `anchor` at the component's root; its `offset` is in units × `density`), with the size the marking already has (use `fit_marking` first so the size follows the content). Clamped inside the container, with a warning when that was needed. Call it after changing the marking's size or anchoring it: nothing snaps by itself (only moving the anchor takes the anchored markings along). When it snaps, the marking's children and the markings anchored to it (with their children and anchored ones) move by the same offset. The summary gives the rectangle before and after (or says that nothing changed). It fails with `not-anchored` (no anchor) and `locked` (locked geometry that would change).",
    ),
  }),
  z.object({
    op: z.literal('update_marking'),
    marking: item('Marking'),
    name: name.optional(),
    source: externalSource.optional(),
    anchor: anchorShape
      .nullable()
      .optional()
      .describe(
        'Stores the anchor (without moving the marking: use `snap_to_anchor` to snap it), or `null` to remove it. Absent does not change. Errors: `anchor-missing` (the target does not exist), `anchor-self`, `anchor-other-space` (the target must be in the same container, or both on the canvas) and `anchor-cycle`. With a `rect`/`container` in the same step, the anchor applies after it. Deleting the target removes the anchor from the anchored markings.',
      ),
    rect: rect
      .optional()
      .describe(
        "New rectangle (the children do not move and must stay inside; the minimum of each side is 8 px, or 1 px on a marking that draws a component, which also respects its `minSize`). Without `container`, it applies in the marking's current space; with `container`, in the pixels of the new container (on the canvas, in canvas units).",
      ),
    container: item('New container')
      .nullable()
      .optional()
      .describe(
        "Changes the marking's space: the new container, or `null` for the canvas. Requires `rect` in its pixels (on the canvas, in canvas units). The parent and the space of the others come from the geometry (a canvas rectangle that fits entirely inside a container becomes that container's). A floating marking only lives on the canvas. Locked geometry fails with `locked`.",
      ),
    floating: z
      .boolean()
      .optional()
      .describe(
        '`true` makes the marking floating (a comment over the canvas): it leaves the container and moves to the canvas, with the `rect` converted. `false` stops it being floating (the container that fully contains it receives it). Requires unlocked geometry.',
      ),
    move: z
      .object({ dx: int, dy: int })
      .optional()
      .describe('Moves the marking with its children (in container pixels).'),
    parent: item('Parent marking')
      .nullable()
      .optional()
      .describe(
        'Old: accepted with a warning and ignored. The parent comes from the geometry (move or resize to change it).',
      ),
    locked: z.boolean().optional(),
    confirmReview: z
      .boolean()
      .optional()
      .describe('`true` confirms the position of a marking that "needs review".'),
  }),
  z.object({ op: z.literal('delete_marking'), marking: item('Marking') }),
  // Arrows (ME4): a marking that points; the route (`points`) always belongs to the person.
  z.object({
    op: z.literal('create_arrow'),
    as: alias,
    from: item('Source marking'),
    to: item('Destination marking'),
    style: arrowStyle
      .optional()
      .describe('Stroke: `straight`, `curve` (default) or `elbow`.'),
    name: name.optional(),
    points: noPoints,
  }),
  z.object({
    op: z.literal('update_arrow'),
    arrow: item('Arrow'),
    name: name.optional(),
    style: arrowStyle.optional(),
    locked: z.boolean().optional(),
    points: noPoints,
  }),
  z.object({ op: z.literal('delete_arrow'), arrow: item('Arrow') }),
  // Annotations
  z.object({
    op: z.literal('create_annotation'),
    as: alias,
    marking: item('Marking'),
    type: z
      .string()
      .optional()
      .describe(
        "Type of the typed annotation: `specId/typeId`, `typeId` or the type name. Omitted: free-form annotation (key-value pairs). On a marking that already exists, the fields start with only the type's `default`s (without the component's `preview`, which is sample text); `values` overrides the ones given.",
      ),
    layer: layer
      .optional()
      .describe(
        "Layer. Required for a free-form annotation; for a typed one, default: the type's layer.",
      ),
    name: name.optional(),
    entries: entries.optional(),
    values: values.optional(),
    owner,
    role: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Role (id of a `childRoles` of the owner\'s type) in which the annotation links to the `owner`. Requires `owner` (`role-without-owner`) and a role that the owner offers (`unknown-role`). Without `role` on an owner that has roles, the batch is valid and the plan returns `missing-role` in `issues`. Changing the `owner` (or `owner: null`) clears the role that the new owner does not offer, and the plan warns with `role-cleared` in `warnings` and `; role "…" cleared` in the summary. See `childRoles` in get_specialization.',
      ),
    inherit: z
      .boolean()
      .optional()
      .describe(
        'Old, ignored (annotation inheritance left the format in v13): accepted with a warning for one version.',
      ),
  }),
  z.object({
    op: z.literal('update_annotation'),
    annotation: item('Annotation'),
    name: name.optional(),
    entries: entries.optional(),
    values: values
      .optional()
      .describe('Only the fields given change (see `values` in create_annotation).'),
    owner,
    role: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Changes the role in the owner (`null` clears). It is checked against the owner already with the new `owner`, if it comes in the same step. Without `role` in the step, an `owner` change that clears the role warns with `role-cleared` in `warnings`. See `role` in create_annotation.',
      ),
    inherit: z.boolean().optional().describe('Old, ignored (see create_annotation).'),
  }),
  z.object({
    op: z.literal('delete_annotation'),
    annotation: item('Annotation').describe(
      'Annotation to delete (with the ones linked to it).',
    ),
  }),
]);

export type Operation = z.infer<typeof operationSchema>;
export type OperationName = Operation['op'];
