import { dragHasFiles } from './imageIntake';

// Document guard (#972): a file dropped outside a target that handles it (panels, home screen,
// read-only canvas) would make the browser open the file in the tab and unmount the app. Cancelling the
// default action of `dragover` and `drop` with files prevents that; whoever handles the `drop` (canvas) keeps
// working, because the guard does not stop propagation. Internal drags, without a file, do not change.

const cancelFileDrag = (e: DragEvent) => {
  if (dragHasFiles(e.dataTransfer)) e.preventDefault();
};

/** Registers the guard on the document; returns whoever removes it. */
export function installFileDropGuard(doc: Document = document): () => void {
  doc.addEventListener('dragover', cancelFileDrag);
  doc.addEventListener('drop', cancelFileDrag);
  return () => {
    doc.removeEventListener('dragover', cancelFileDrag);
    doc.removeEventListener('drop', cancelFileDrag);
  };
}
