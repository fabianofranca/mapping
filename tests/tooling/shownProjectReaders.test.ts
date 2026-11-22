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
  // "Container classes" of the container (CX3): reads the applied specializations and the real project's density to show the computed classes (like the drawing mode field); disabled in the review.
  'src/ui/ContainerClassField.tsx',
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
  // Pages (stage #883, PG2): the page list, the root counts and the page actions belong to the real
  // project (the shown project is cut by the open page and the page actions are refused in the review);
  // the status bar names the open page, and `pageNavigation` resolves items on any page.
  'src/ui/DeletePageDialog.tsx',
  'src/ui/ManagePagesDialog.tsx',
  'src/ui/MovePageControl.tsx',
  'src/ui/MovePageMenuItems.tsx',
  'src/ui/MovePageRefusedDialog.tsx',
  // "Go to the marking" of the refusal (stage #2177, PF2): which end of an anchor stays comes from the real project.
  'src/ui/movePage.ts',
  'src/ui/pageNavigation.ts',
  // Following a reference to another page (stage #883, PG3): the page of the target comes from the real project, not the one cut by the open page.
  'src/ui/useFollowRef.ts',
  // The reference preview shows the real project (PG3): the item lives on a page the open one cuts away.
  'src/ui/RefPreviewWindow.tsx',
  'src/ui/review/ReviewPanel.tsx',
  // Citations in a review (stage #1881, decision 15): the `@` list and "Cite in the conversation" only offer what exists in the committed project (`CiteMenuItems.tsx` reads it through `useCitationContext({ base: true })`).
  'src/ui/comments/citationContext.ts',
  // `CompareDialog`: the "before" image is the committed one by definition.
  'src/ui/review/ReviewCanvasControls.tsx',
  // `useReviewNames`: needs the current one and the preview (before/after names).
  'src/ui/review/useReview.ts',
  // `useAddComponent`: the slot of the new child comes from the drawings of the project that gets written; the shown
  // project of a perspective or of the Proposed view is clipped, so it would leave out the children of the slots.
  'src/ui/useAddComponent.ts',
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
