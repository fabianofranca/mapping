import type { Spec } from './spec';
import type { AnchorAlign, AnchorSide, ExternalSource, JsonValue, Rect } from './types';

// The plugin contract of the file formats (`fileFormats`, `formatVersion` 20; stage #1923,
// decisions 9, 11 to 14 and 16): what a format plugin receives (`FormatInput`, built by
// `formatInput.ts`), what it may return (`FormatResult`, checked by `formatResult.ts`) and the
// limits of a call. The constants and types are shared with the MCP executor and, later, with the
// app's (#2035). Pure: no browser APIs, so it runs in Node too.

/** The only plugin contract that exists (`fileFormats[].contract`, `FormatInput.contract`). */
export const FORMAT_PLUGIN_CONTRACT = 1;

/**
 * The limits of a call (decision 16), in the units of the name: milliseconds, bytes, characters or
 * a count. The executor enforces the first six and the size of the input and the output; the
 * result check (`checkFormatResult`) enforces the last three.
 */
export const FORMAT_PLUGIN_LIMITS = {
  /** Time of one call. */
  timeoutMs: 5000,
  /** Memory of the QuickJS runtime. */
  memoryBytes: 64 * 1024 * 1024,
  /** Stack of the QuickJS runtime. */
  stackBytes: 1024 * 1024,
  /** Size of the plugin file (UTF-8). */
  pluginBytes: 1024 * 1024,
  /** Size of the text `parse` reads. */
  parseTextBytes: 4 * 1024 * 1024,
  /** Size of the text `generate` returns. */
  generatedTextBytes: 4 * 1024 * 1024,
  /** Size of the serialized projection (the input). */
  projectionBytes: 16 * 1024 * 1024,
  /** Operations in a `parse` result. */
  operations: 5000,
  /** Warnings kept from a `parse` result; the rest is cut, with one warning saying so. */
  warnings: 100,
  /** Characters of a warning; the rest is cut. */
  warningChars: 500,
} as const;

export type FormatPluginLimit = keyof typeof FORMAT_PLUGIN_LIMITS;

/** A plugin file larger than this is refused (level 1 of the library validator). */
export const MAX_PLUGIN_BYTES = FORMAT_PLUGIN_LIMITS.pluginBytes;

// -------------------------------------------------------------------------------- the executor

/** The two functions a plugin may define. */
export type FormatFunction = 'generate' | 'parse';

/** The codes of a failed call (the error codes of #1923, decision 9). */
export type FormatFailureCode =
  'plugin-failed' | 'plugin-timeout' | 'plugin-limit' | 'plugin-output-invalid';

/**
 * A failed call: the code, the plugin's own message and, for an error thrown by the plugin's
 * code, the `line` and `column` in the plugin's text (1-based).
 */
export interface FormatFailure {
  readonly code: FormatFailureCode;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  /**
   * `load` when the plugin's text itself failed (it threw while loading, or went past a limit then), `call` when
   * its function failed. The format checks tell the two apart; an executor that cannot says nothing.
   * `sandbox` when the sandbox that runs the plugin could not start (a page whose CSP or Trusted Types refuse its
   * frame or its Worker, stage #2059): the plugin never ran. The app words it as any other failure; the viewer
   * reports it as `sandbox-unavailable`.
   */
  readonly phase?: 'load' | 'call' | 'sandbox';
}

/** What a call gives back: the JSON value the function returned, or the typed failure. */
export type FormatOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: FormatFailure };

/**
 * Runs `fn` of the plugin in `source` with `args` (`[projection]` for `generate`, `[text,
 * projection]` for `parse`). The executor of the app (`src/app/formatRunner.ts`, a sandboxed
 * iframe with a Worker) and the MCP's (`mcp/pluginRunner.ts`, QuickJS) are both of this shape.
 * Never rejects: every failure is an outcome.
 */
export type FormatRunner = (
  source: string,
  fn: FormatFunction,
  args: readonly unknown[],
  context?: FormatCallContext,
) => Promise<FormatOutcome>;

/** Where a call comes from, so an executor can word its messages ("the plugin of data-model/csv …"); it may ignore it. */
export interface FormatCallContext {
  /** `<specId>/<formatId>`. */
  readonly format: string;
  /** The plugin's path in the package. */
  readonly pluginPath: string;
}

// ---------------------------------------------------------------------------------- the input

/** Top-level keys of the projection, in the order they are written (decision 13). */
export const FORMAT_INPUT_KEYS = [
  'contract',
  'format',
  'specialization',
  'project',
  'target',
  'containers',
  'markings',
  'annotations',
  'arrows',
] as const;

/** The format a call is about. `ref` is `<specId>/<formatId>`. */
export interface FormatInputFormat {
  readonly ref: string;
  readonly id: string;
  readonly specId: string;
  readonly name: string;
  readonly extension: string;
  readonly scope: 'project' | 'container';
}

export interface FormatInputContainer {
  readonly ref: string;
  readonly code: string;
  readonly name: string | null;
  /** Name of the container's page, or `null` when it has none. */
  readonly page: string | null;
  readonly width: number;
  readonly height: number;
  /** `#RRGGBB` of a background-only container; `null` when the container has an image. */
  readonly background: string | null;
  readonly source: ExternalSource | null;
}

/** The slot of its mother a child sits in, as `get_marking` reports it. */
export interface FormatInputSlot {
  readonly id: string;
  readonly name: string;
}

export interface FormatInputAnchor {
  /** Reference of the target marking. */
  readonly to: string;
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main: number; readonly cross: number };
}

export interface FormatInputMarking {
  readonly ref: string;
  readonly code: string;
  /** Reference of the container; `null` for a marking of the canvas. */
  readonly container: string | null;
  /** Reference of the nearest ancestor that is also in the projection, or `null`. */
  readonly parent: string | null;
  readonly rect: Rect;
  readonly name: string | null;
  readonly slot: FormatInputSlot | null;
  readonly anchor: FormatInputAnchor | null;
  readonly source: ExternalSource | null;
}

/** A row of a `table` field: its reference and the values of its columns. */
export interface FormatInputRow {
  readonly ref: string;
  readonly values: { readonly [column: string]: JsonValue };
}

export interface FormatInputAnnotation {
  readonly ref: string;
  readonly code: string;
  /** Reference of the marking or arrow that holds the annotation. */
  readonly host: string;
  /** Id of the type, in the format's specialization. */
  readonly type: string;
  /** Id of the type's layer, in the format's specialization. */
  readonly layer: string;
  readonly name: string | null;
  /** Reference of the owner annotation, or `null`. */
  readonly owner: string | null;
  readonly role: string | null;
  /** The fields that are not tables; a `ref` field holds the target's reference or `null`. */
  readonly values: { readonly [field: string]: JsonValue };
  /** Each `table` field, by key. */
  readonly rows: { readonly [field: string]: readonly FormatInputRow[] };
}

export interface FormatInputArrow {
  readonly ref: string;
  readonly code: string;
  readonly from: string;
  readonly to: string;
  readonly name: string | null;
}

/** The projection `generate(input)` and `parse(text, input)` receive (contract 1). */
export interface FormatInput {
  readonly contract: typeof FORMAT_PLUGIN_CONTRACT;
  readonly format: FormatInputFormat;
  /** The format's specialization, as the project's copy stores it. */
  readonly specialization: Spec;
  readonly project: { readonly name: string };
  /** Scope `container`: the container the call is about; `null` with scope `project`. */
  readonly target: { readonly container: string } | null;
  readonly containers: readonly FormatInputContainer[];
  readonly markings: readonly FormatInputMarking[];
  readonly annotations: readonly FormatInputAnnotation[];
  readonly arrows: readonly FormatInputArrow[];
}

// --------------------------------------------------------------------------------- the result

/**
 * The operations a `parse` result may carry (decision 9): a fixed subset of the batch operations,
 * without deleting, without images and without layers or specializations.
 */
export const FORMAT_RESULT_OPERATIONS = [
  'add_container',
  'create_marking',
  'update_marking',
  'create_annotation',
  'update_annotation',
  'create_arrow',
] as const;

export type FormatResultOperationName = (typeof FORMAT_RESULT_OPERATIONS)[number];

/**
 * The keys of each allowed operation (decision 14): those of the MCP operation of the same name,
 * minus what brings an image (`file`, `base64`, `fileName`), the legacy keys (`image`, `parent`,
 * `inherit`) and the route of an arrow (`points`, which belongs to the person). `op` is always
 * there.
 */
export const FORMAT_OPERATION_KEYS: Readonly<
  Record<FormatResultOperationName, readonly string[]>
> = {
  add_container: [
    'as',
    'name',
    'width',
    'height',
    'background',
    'source',
    'drawingMode',
    'direction',
    'density',
    'center',
    'beside',
    'page',
  ],
  create_marking: [
    'as',
    'annotationAs',
    'container',
    'near',
    'inside',
    'slot',
    'page',
    'rect',
    'name',
    'source',
    'anchor',
    'annotation',
  ],
  update_marking: [
    'marking',
    'name',
    'source',
    'anchor',
    'rect',
    'container',
    'floating',
    'move',
    'locked',
    'confirmReview',
  ],
  create_annotation: [
    'as',
    'marking',
    'type',
    'layer',
    'name',
    'entries',
    'values',
    'owner',
    'role',
  ],
  update_annotation: ['annotation', 'name', 'entries', 'values', 'owner', 'role'],
  create_arrow: ['as', 'from', 'to', 'style', 'name'],
};

/** An operation of a result: its name and the keys of `FORMAT_OPERATION_KEYS`. */
export interface FormatOperation {
  readonly op: FormatResultOperationName;
  readonly [key: string]: unknown;
}

/** What `parse` returns. */
export interface FormatResult {
  readonly operations: readonly FormatOperation[];
  readonly warnings?: readonly string[];
}
