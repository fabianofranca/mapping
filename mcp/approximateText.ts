import type { FrameNode, SceneNode, TextMeasurer } from '../src/model';
import { familyNames, type FontBook } from './image/textMeasurer';

// What "approximate" means for the MCP's text measurements (stage #2267, decisions 3 to 5): a text is
// approximate when its family stack does not resolve to a library face, so the embedded font stood in for
// its family; the built-in drawing font (Mapping Sans and Mono, stage #2825, decision 5) is the embedded one itself. `measure_component` reads the families the engine measures; the drawing proof reads the ones
// in the drawing's scene.

/** A measurer that records the family of every text it measures, and the families recorded so far. */
export function recordingMeasurer(measure: TextMeasurer): {
  readonly measure: TextMeasurer;
  readonly families: ReadonlySet<string>;
} {
  const families = new Set<string>();
  return {
    measure: (text, font, maxWidth) => {
      families.add(font.family);
      return measure(text, font, maxWidth);
    },
    families,
  };
}

/** The `fontFamily` of the text nodes of a scene, and of their runs. */
export function sceneFamilies(root: FrameNode): Set<string> {
  const families = new Set<string>();
  const visit = (node: SceneNode): void => {
    if (node.type === 'text') {
      families.add(node.style.fontFamily);
      for (const run of node.runs ?? []) families.add(run.fontFamily);
    } else if (node.type === 'frame' || node.type === 'group') {
      node.children.forEach(visit);
    }
  };
  visit(root);
  return families;
}

/** The names of the built-in drawing font, which the server embeds and the app and the viewer register (stage #2825). */
const DRAWING_FONT = /^mapping (sans|mono)$/i;

/** The stack's first name is Mapping Sans or Mapping Mono (any case, quotes stripped): the embedded face is the font. */
export function isDrawingFont(family: string): boolean {
  const first = familyNames(family)[0];
  return first !== undefined && DRAWING_FONT.test(first);
}

/**
 * Some family of `families` is neither a library face nor the built-in drawing font; none at all (no text) is not
 * approximate. A stack that starts with another name (`sans-serif`, `Inter`) stays approximate.
 */
export function anyApproximate(fonts: FontBook, families: Iterable<string>): boolean {
  for (const family of families)
    if (!isDrawingFont(family) && !fonts.isLibraryFamily(family)) return true;
  return false;
}
