// @vitest-environment node
// Phase 8.2 (P1): ratchet of the "shown project". The interface reads the project that is on screen
// through `review.derived.shownProject` (in the Proposed view of the review, the "how it would look"; otherwise,
// the committed one). Only the files below may read `store.committed`/`store.project` in
// `src/ui/**` and `src/app/**`, each with its reason; a new reader breaks this test, and one
// that stops reading forces the list to be shortened (`toEqual`, not `toContain`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PATTERN = /\bstore\.(committed|project)\b/;

/** Files (sorted) whose text reads `store.committed` or `store.project`. */
export function readersOf(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([, text]) => PATTERN.test(text))
    .map(([path]) => path)
    .sort();
}

/** `{ relative path → text }` of every `.ts`/`.tsx` under `dir`. */
function sources(dir: string, root = dir): Map<string, string> {
  const result = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const [k, v] of sources(path, root)) result.set(k, v);
    } else if (/\.tsx?$/.test(name)) {
      result.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
    }
  }
  return result;
}

/**
 * Who still reads the committed project (or the one with the gesture preview) directly, and why.
 * Everything that describes "what is on screen" (breadcrumb, status bar, Layers, List,
 * Incomplete, minimap, selection shortcuts, cursor) reads `shownProject`.
 */
const ALLOWLIST = [
  // The editor exists if there is an open project, not "shown".
  'src/app/Editor.tsx',
  // Edit dialogs (delete, rename) act on the real project; refused in the review.
  'src/app/EditorDialogs.tsx',
  // The project name in the bar is the real one; the proposed name appears in the review as a change.
  'src/app/EditorMainBar.tsx',
  // Outside the editor: session and recents.
  'src/app/controller.ts',
  // `mapping://` references and crops point to the real project.
  'src/app/itemClipboard.ts',
  // Requests to delete an image/marking: real project, disabled in the review.
  'src/app/useEditorDialogs.ts',
  // Image intake (drag, paste, choose): real project.
  'src/app/useImageIntake.tsx',
  // Diagnostics of the real project.
  'src/ui/DiagnosticsView.tsx',
  // "Drawing mode" field of the container (CF6): reads the applied specializations of the real project (like the ContainerDialog); disabled in the review.
  'src/ui/ContainerDrawingModeField.tsx',
  // New container: reads the applied specializations and the selection of the real project, to create in it.
  'src/ui/ContainerDialog.tsx',
  // Details in the review (phase 9.5): the panel reads the shown project; the current one is the other side
  // of an item that does not exist in the Proposed view (removed) and the source of the ghosts
  // (annotations and pairs that leave, drawn where they were).
  // Perspectives (stage #659, PE3): the list of perspectives, the arrivals and the roots of each one belong to the
  // real project; the shown project of a perspective only has its roots. Refused in the review
  // (the review opens the Main one and locks the selector).
  'src/ui/ArrivalNotice.tsx',
  'src/ui/ArrowLinksSection.tsx',
  'src/ui/CanvasContextMenu.tsx',
  'src/ui/DeletePerspectiveDialog.tsx',
  'src/ui/ManagePerspectivesDialog.tsx',
  'src/ui/NewPerspectiveDialog.tsx',
  'src/ui/PerspectiveMenuItems.tsx',
  'src/ui/PerspectivePicker.tsx',
  'src/ui/PerspectiveSendMenu.tsx',
  'src/ui/PerspectivesSection.tsx',
  'src/ui/review/ReviewPanel.tsx',
  // `CompareDialog`: the "before" image is the committed one by definition.
  'src/ui/review/ReviewCanvasControls.tsx',
  // `useReviewNames`: needs the current one and the preview (before/after names).
  'src/ui/review/useReview.ts',
];

describe('shown project: who reads store.committed/store.project in src/ui and src/app', () => {
  it('the list of readers is exactly the allowlist (a new reader is justified here or reads shownProject)', () => {
    const files = new Map([
      ...sources(join(process.cwd(), 'src', 'ui'), process.cwd()),
      ...sources(join(process.cwd(), 'src', 'app'), process.cwd()),
    ]);
    expect(readersOf(files)).toEqual([...ALLOWLIST].sort());
  });

  it('the scan catches the old pattern and lets the right one through', () => {
    const files = new Map([
      ['src/ui/Old.tsx', 'const crumbs = crumbsOf(store.committed.value, selection);'],
      ['src/app/Old.ts', 'const p = editor.store.project.peek();'],
      ['src/ui/New.tsx', 'const p = review.derived.shownProject.value;'],
      [
        'src/ui/Other.tsx',
        'const name = store.projectName.value; const s = storeFront.committed;',
      ],
    ]);
    expect(readersOf(files)).toEqual(['src/app/Old.ts', 'src/ui/Old.tsx']);
  });
});
