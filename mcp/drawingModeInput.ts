import {
  DRAWING_NAME_PATTERN,
  declaredDrawingAxes,
  effectiveDrawingMode,
  fail,
  selectionFromString,
  type DrawingModeMap,
  type Project,
} from '../src/model';
import { ToolError } from './errors';

// The drawing mode as the MCP takes it (stage #1900, NV3, decisions 16 and 17): a map axis -> entry, the
// legacy string (the entry set on every declared axis that has it) or, where it can be removed, `null`.

/** What a tool argument carries for the drawing mode. */
export type DrawingModeInput = string | Readonly<Record<string, string>>;

type Axes = ReadonlyMap<string, readonly string[]>;

/** The declared axes as the tools show them: axis -> entries, in declaration order. */
export function axesJson(axes: Axes): Record<string, string[]> {
  return Object.fromEntries([...axes].map(([axis, entries]) => [axis, [...entries]]));
}

/** The axes the project's applied specializations declare, as a JSON object. */
export function drawingAxesJson(p: Project): Record<string, string[]> {
  return axesJson(declaredDrawingAxes(p));
}

function notDeclared(what: string, value: unknown, axes: Axes): ToolError {
  return new ToolError(
    'invalid-arguments',
    `drawing mode not declared by any applied specialization: ${what}`,
    { drawingMode: value, drawingAxes: axesJson(axes) },
  );
}

/**
 * The map a stored drawing mode takes from the tool input: a map as it is (the model checks the names), a
 * string as that entry on every declared axis that has it, `null` as `null`. A string no axis declares is
 * `invalid-arguments` with the declared axes in the details; a name outside the pattern is `invalid-name`.
 */
export function drawingModeMap(
  p: Project,
  input: DrawingModeInput | null,
): DrawingModeMap | null {
  if (input === null) return null;
  if (typeof input !== 'string') return input;
  if (!DRAWING_NAME_PATTERN.test(input)) return fail('invalid-name');
  const axes = declaredDrawingAxes(p);
  const selection = selectionFromString(axes, input);
  if (selection === null) throw notDeclared(input, input, axes);
  return selection;
}

/**
 * The map to pin in a drawing (`render_*`): a string as in `drawingModeMap`; a map must list declared axes
 * and entries (each one an entry of its axis), otherwise `invalid-arguments` with the declared axes.
 */
export function drawingModeToPin(p: Project, input: DrawingModeInput): DrawingModeMap {
  if (typeof input === 'string') return drawingModeMap(p, input) as DrawingModeMap;
  const axes = declaredDrawingAxes(p);
  for (const [axis, entry] of Object.entries(input)) {
    if (axes.get(axis)?.includes(entry) !== true) {
      throw notDeclared(`${axis}: ${entry}`, input, axes);
    }
  }
  return input;
}

/**
 * The mode that applies in a space, with EVERY declared axis: the container's, else the project's, else the
 * first entry of the axis (an entry its axis does not declare draws with the default, and shows as it).
 */
export function effectiveModeMap(
  p: Project,
  containerId: string | null,
): Record<string, string> {
  const pinned = effectiveDrawingMode(p, containerId);
  return Object.fromEntries(
    [...declaredDrawingAxes(p)].flatMap(([axis, entries]) => {
      const wanted = pinned?.[axis];
      const entry =
        wanted !== undefined && entries.includes(wanted) ? wanted : entries[0];
      return entry === undefined ? [] : [[axis, entry]];
    }),
  );
}
