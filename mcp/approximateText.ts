import type { FrameNode, SceneNode, TextMeasurer } from '../src/model';
import type { FontBook } from './image/textMeasurer';

// What "approximate" means for the MCP's text measurements (stage #2267, decisions 3 to 5): a text is
// approximate when its family stack does not resolve to a library face, so the embedded font stood in for
// its family. `measure_component` reads the families the engine measures; the drawing proof reads the ones
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

/** Some family of `families` does not resolve to a library face; none at all (no text) is not approximate. */
export function anyApproximate(fonts: FontBook, families: Iterable<string>): boolean {
  for (const family of families) if (!fonts.isLibraryFamily(family)) return true;
  return false;
}
