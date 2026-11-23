// "Export image…": the PNG of a marking, or of a selection of markings on the same image, at the
// full size of the original pixels, through "Save as" or a download. A read: it never writes the
// project (it reads `store.committed`, like `copyCrop`).
import { t } from '../i18n';
import {
  exportImageName,
  imageExportTarget,
  shortCode,
  type ImageExportRefusal,
  type ImageExportTarget,
  type Project,
} from '../model';
import { cropToPng } from '../storage/imageCrop';
import { canSaveWithPicker, downloadFile, saveBlobWithPicker } from '../storage/share';
import { isItemSelected, peekSelectedItems, showToast } from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';
import { reportError } from '../utils/report';

const PNG = 'image/png';

/**
 * The markings an "Export image…" from `markingId`'s menu exports: every selected marking when
 * that one is in the selection, otherwise it alone. Selected arrows and containers have no pixels
 * of their own to crop and are ignored.
 */
export function exportMarkingIds(
  editor: Pick<EditorContextValue, 'ui'>,
  markingId: string,
): readonly string[] {
  const items = peekSelectedItems(editor.ui);
  if (!isItemSelected(items, { kind: 'marking', id: markingId })) return [markingId];
  return items.filter((i) => i.kind === 'marking').map((i) => i.id);
}

/** What "Export image…" would crop in `project` (the committed one): the target or why not. */
export function exportTargetIn(
  project: Project | null,
  markingIds: readonly string[],
): ImageExportTarget {
  return project
    ? imageExportTarget(project, markingIds)
    : { ok: false, reason: 'not-in-project' };
}

/** The i18n key of the tooltip that says why the item is disabled. */
export function exportRefusalKey(
  reason: ImageExportRefusal,
): 'export.image.differentImages' | 'export.image.noImage' | 'export.image.notInProject' {
  if (reason === 'different-images') return 'export.image.differentImages';
  return reason === 'no-image' ? 'export.image.noImage' : 'export.image.notInProject';
}

interface ExportPlan {
  readonly file: string;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly name: string;
}

function planExport(project: Project, markingIds: readonly string[]): ExportPlan | null {
  const target = imageExportTarget(project, markingIds);
  if (!target.ok) return null;
  const container = project.containers.find((c) => c.id === target.containerId);
  const first = markingIds[0];
  if (!container || container.file === null || first === undefined) return null;
  const subject =
    markingIds.length === 1
      ? ({ kind: 'one', code: shortCode(project, 'm', first) } as const)
      : ({ kind: 'many', count: markingIds.length } as const);
  return {
    file: container.file,
    rect: { ...target.rect },
    name: exportImageName(container, subject, t('export.image.selectionWord')),
  };
}

/**
 * Exports the crop of `markingIds` (all on one image with a file; the menu disables the item
 * otherwise). "Save as" opens straight from the call, before any `await` (the picker needs the
 * click's user gesture); without the picker the file is downloaded. A cancelled picker is silent.
 */
export async function exportMarkingsImage(
  editor: EditorContextValue,
  markingIds: readonly string[],
): Promise<void> {
  const { store, session, ui } = editor;
  const project = store.committed.peek();
  const plan = project ? planExport(project, markingIds) : null;
  if (!plan) return;
  const png = (async () => {
    const data = await session.readImage(plan.file);
    if (!data) throw new Error(`image file missing: ${plan.file}`);
    return cropToPng(data, plan.rect, null);
  })();
  // Handled below: without this a failure would leave the promise unhandled while "Save as" opens.
  png.catch((e: unknown) => reportError('export.image', e));
  let ok = true;
  try {
    if (canSaveWithPicker()) {
      const result = await saveBlobWithPicker(plan.name, PNG, png);
      if (result === 'cancelled') return;
      ok = result === 'saved';
    } else {
      downloadFile(new File([await png], plan.name, { type: PNG }));
    }
  } catch (e) {
    reportError('export.image', e);
    ok = false;
  }
  showToast(ui, t(ok ? 'export.image.done' : 'export.image.failed'));
}
