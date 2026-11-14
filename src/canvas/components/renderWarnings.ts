/**
 * Warnings from drawing a scene (`renderScene`): each one carries a code and, if needed,
 * parameters. The text is never born here: whoever shows the warning translates it (the app by
 * `t()`, the viewer by the labels it passes to the `ScreenRenderer`).
 */
export type RenderWarningCode =
  /** Shadow on a group with no children or shape. */
  | 'empty-group-shadow'
  /** Inner shadow: it does not exist in canvas 2D. */
  | 'inner-shadow'
  /** Text, path or image with a shadow list or `spread`: only the first one counts. */
  | 'extra-shadows'
  /** Node the drawing does not know (`params.type`): only the box. */
  | 'unknown-node'
  /** Image without pixels (no embedded `src` or `url`): placeholder. */
  | 'image-without-pixels'
  /** Embedded image that could not be decoded. */
  | 'image-decode-failed'
  /** Stroke with several fills: only the first one counts. */
  | 'stroke-extra-paints'
  /** Inside or outside stroke on a path or line: centered. */
  | 'stroke-align-centered'
  /** Stroke with a radial gradient: the first color. */
  | 'stroke-radial-first-color'
  /** Stroke with an image: gray. */
  | 'stroke-image-gray';

export interface RenderWarning {
  readonly code: RenderWarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** All the codes (the interface checks that each one has text in both languages). */
export const RENDER_WARNING_CODES: readonly RenderWarningCode[] = [
  'empty-group-shadow',
  'inner-shadow',
  'extra-shadows',
  'unknown-node',
  'image-without-pixels',
  'image-decode-failed',
  'stroke-extra-paints',
  'stroke-align-centered',
  'stroke-radial-first-color',
  'stroke-image-gray',
];
