import type { ModelError, ModelErrorCode, ModelErrorData } from '../src/model';
import { ToolError } from './errors';
import type { Refs } from './items';

/**
 * What each rule error of `src/model/` means, so the agent can fix the operation.
 * An exhaustive `Record`: a new code in the model forces the explanation to be written here.
 */
export const MODEL_ERROR_MESSAGES: Readonly<Record<ModelErrorCode, string>> = {
  'not-found': 'item not found',
  'invalid-name': 'empty or invalid name',
  'invalid-color': 'invalid color: use #RRGGBB',
  'invalid-index': 'position outside the list',
  'last-layer': 'the project must keep at least one layer',
  'invalid-dimensions': 'invalid container dimensions (integers from 1 to 20000)',
  'invalid-placement': 'invalid container position or scale (scale > 0)',
  'image-overlap': 'the container would overlap another container on the canvas',
  'duplicate-file': 'a container with that image file already exists',
  'container-without-file':
    'the container has no image file (background color only): there is no file to replace or return',
  'container-has-file':
    'the container has an image file: only a container without a file (plain background) has an editable background color and size',
  'container-density': 'the container density must be a number from 0.5 to 8',
  'aspect-change-not-confirmed':
    'the container\'s new image has a different aspect ratio: pass confirmAspectChange: true (the markings will be rescaled and marked "needs review")',
  'image-too-small': "the container's new image is too small for the markings",
  'rect-not-integer': 'the rectangle must have whole values (container pixels)',
  'rect-too-small': 'rectangle smaller than the minimum size of a marking',
  'rect-out-of-image': 'the rectangle leaves the container',
  'rect-outside-parent': 'the rectangle leaves the parent marking',
  'invalid-space':
    'invalid space: only the canvas marking can be floating, and it has no container',
  'invalid-parent':
    'invalid parent: it must be in the same container, contain the rectangle and not be a descendant',
  'invalid-annotation-parent':
    'invalid owner: it must belong to the same marking, with no cycle, and be in another layer or, for a typed annotation, of a type that accepts this link, including in the same layer',
  'arrow-endpoint':
    'invalid arrow endpoint: it must be a marking (neither another arrow nor a container)',
  'arrow-self': 'the arrow must link two different markings',
  'invalid-arrow-route': 'invalid arrow route: points with finite x and y',
  'empty-key': 'pair with an empty key',
  'duplicate-key': 'repeated key in the annotation',
  'duplicate-id': 'repeated id',
  locked: 'locked item: it cannot be moved, resized, replaced or deleted',
  'spec-layer':
    'specialization layer: it cannot be renamed or deleted on its own (remove the specialization)',
  'typed-layer': 'a specialization layer only accepts typed annotations',
  'typed-annotation': 'typed annotation: use `values`, not `entries`',
  'not-typed': 'free-form annotation: use `entries`, not `values`',
  'unknown-type': 'annotation type does not exist in the applied specializations',
  'type-not-in-layer': 'the type does not belong to this layer',
  'type-not-applicable':
    "the type does not apply to this item (see the type's `appliesTo` in get_specialization: marking, arrow or both)",
  'owner-required': 'this type requires an owner annotation (`owner`)',
  'unknown-role': 'the owner does not offer this role',
  'role-without-owner': 'a role requires an owner annotation (`owner`)',
  'unknown-field':
    'field does not exist in the type (see the fields in get_specialization)',
  'invalid-value': 'value incompatible with the field type',
  'unknown-option': "value outside the field's options",
  'self-ref': 'the annotation cannot reference itself',
  'ref-not-accepted': 'the field does not accept that reference target',
  'spec-already-applied': 'the specialization is already applied',
  'spec-not-newer': 'the version is not greater than the applied one',
  'spec-missing-migrations':
    'the new version has breaking changes without a declared migration',
  'unknown-platform': 'platform not declared by the applied specializations',
  'unknown-doc-repo': 'documents repository not declared by the applied specializations',
  'invalid-local-path':
    'invalid localPath: a path relative to the project folder (e.g. ../..), not absolute',
  'invalid-source': 'invalid source: provide a non-empty system and id (url is optional)',
  'not-arrangeable':
    'the marking is not a container with a row or column layout and children to arrange',
  'not-fittable':
    "the marking has no axis that depends on its content (the component's sizing must be hug or an expression), or it is a component with children in the slot",
  'anchor-missing': 'the anchor points to a marking that does not exist',
  'anchor-self': 'a marking cannot be anchored to itself',
  'anchor-cycle': 'the anchor would close an anchor cycle',
  'anchor-other-space':
    'the anchor must be in the same space: the same container, or both on the canvas',
  'not-anchored': 'the marking has no anchor',
  'perspective-name-empty': 'the perspective name is empty',
  'perspective-name-taken':
    'a perspective with that name already exists (case-insensitive)',
  'not-root':
    'the item is not a root: only a container without a parent, a canvas marking without a parent or a floating one can join a perspective',
};

/** Hint about the next step for the model errors that have one. */
export const MODEL_ERROR_HINTS: Readonly<Partial<Record<ModelErrorCode, string>>> = {
  'type-not-applicable':
    'choose a type whose `appliesTo` includes this item (marking or arrow) or use a free-form annotation in a layer without a specialization',
  'rect-too-small':
    "increase the `rect`'s `width` and `height` to at least the minimum (each side, in container pixels; on the canvas, in canvas units)",
  'not-fittable':
    'only a component marking with `sizing` `hug` or by expression (see `get_component`) and with no markings in the slot fits its content; the others do not need `fit_marking`',
  'not-anchored':
    'the marking needs an anchor: write `anchor` with `update_marking` (or `create_marking`) before `snap_to_anchor`',
  'anchor-missing':
    '`anchor.to` must be a marking that exists (a reference, an id or the alias of a marking in the batch)',
  'anchor-other-space':
    'the anchor and the marking must be in the same space (the same container, or both on the canvas): move one of them first, with `update_marking` and `container`',
  'anchor-cycle':
    'the anchor already depends on this marking (directly or indirectly): anchor to another marking or remove the anchor on the other side with `anchor: null`',
  'container-density':
    'from 0.5 to 8; 3 for a 1080 px capture of a 360 dp phone (image pixels per component unit); `null` goes back to 1',
  'image-overlap':
    "change the container's `x`, `y` or `scale` (or its size) so it does not cover the other one, or move the other container first",
};

function isSize(value: unknown): value is { width: number; height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === 'number' && typeof height === 'number';
}

/** `received 5×3 px; minimum 8×8 px` from the `data` of a `rect-too-small`; `null` if it is missing. */
export function rectTooSmallDetail(data: ModelErrorData | undefined): string | null {
  if (!data || !isSize(data.received) || !isSize(data.min)) return null;
  const { received, min } = data;
  const origin = data.source === 'component' ? ' (from the component)' : '';
  return `received ${received.width}×${received.height} px; minimum ${min.width}×${min.height} px${origin}`;
}

/** Text after the first `: ` of the message (`code: text`); the text may have `: ` inside it. */
function messageDetail(error: ModelError): string | undefined {
  const at = error.message.indexOf(': ');
  return at < 0 ? undefined : error.message.slice(at + 2);
}

/** The detail that the `data` of some model errors gives (the rest use the message text). */
function specificDetail(error: ModelError, refs?: Refs): string | undefined {
  switch (error.code) {
    case 'rect-too-small':
      return rectTooSmallDetail(error.data) ?? undefined;
    case 'container-density': {
      const received = error.data?.density;
      return `received ${typeof received === 'number' ? received : '?'}; from 0.5 to 8`;
    }
    case 'image-overlap': {
      const id = error.data?.containerId;
      return typeof id === 'string'
        ? `overlaps the container ${refs ? refs.ref('i', id) : id}`
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Detail and hint of a model error. The `data` becomes text here (the model only keeps facts); the id
 * of the other container becomes a reference when there are `refs`. Without `data`, the detail is the message text.
 */
export function describeModelError(
  error: ModelError,
  refs?: Refs,
): { detail?: string; hint?: string } {
  const hint = MODEL_ERROR_HINTS[error.code];
  let detail = specificDetail(error, refs);
  detail ??= messageDetail(error);
  return { ...(detail ? { detail } : {}), ...(hint ? { hint } : {}) };
}

/** Model rule error in a read tool → `ToolError` with the explanation and the detail. */
export function modelToolError(error: ModelError, refs?: Refs): ToolError {
  return new ToolError(error.code, MODEL_ERROR_MESSAGES[error.code], {
    ...describeModelError(error, refs),
  });
}
