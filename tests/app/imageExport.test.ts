import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportMarkingIds, exportMarkingsImage } from '../../src/app/imageExport';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { selectItems } from '../../src/store/ui';
import { reportedErrors } from '../../src/utils/report';
import { createHarness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

const share = vi.hoisted(() => ({
  canSaveWithPicker: vi.fn(() => true),
  saveBlobWithPicker: vi.fn(),
  downloadFile: vi.fn(),
}));
vi.mock('../../src/storage/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/storage/share')>()),
  ...share,
}));
const crop = vi.hoisted(() => ({ cropToPng: vi.fn() }));
vi.mock('../../src/storage/imageCrop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/storage/imageCrop')>()),
  ...crop,
}));

// pt-BR kept: shared fixture data asserted by tests/model (sampleProject: 'images/lateral.jpg')

const source = new Blob(['source'], { type: 'image/jpeg' });
const png = new Blob(['png'], { type: 'image/png' });

function setup() {
  const harness = createHarness(sampleProject());
  const readImage = vi
    .spyOn(harness.context.session, 'readImage')
    .mockResolvedValue(source);
  return { harness, readImage };
}

beforeEach(() => {
  locale.value = 'en-US';
  share.canSaveWithPicker.mockReturnValue(true);
  share.saveBlobWithPicker.mockImplementation(
    async (_name: string, _mime: string, data: Promise<Blob>) => {
      await data;
      return 'saved';
    },
  );
  crop.cropToPng.mockResolvedValue(png);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('exportMarkingIds', () => {
  it('uses the whole selection of markings when the target is in it', () => {
    const { harness } = setup();
    selectItems(harness.ui, [
      { kind: 'marking', id: 'M1' },
      { kind: 'image', id: 'I1' },
      { kind: 'marking', id: 'M2' },
    ]);
    expect(exportMarkingIds(harness.context, 'M2')).toEqual(['M1', 'M2']);
  });

  it('uses the target alone when it is outside the selection', () => {
    const { harness } = setup();
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    expect(exportMarkingIds(harness.context, 'M3')).toEqual(['M3']);
  });
});

describe('exportMarkingsImage', () => {
  it('opens "Save as" before any await, with the marking name and the full-size crop', async () => {
    const { harness, readImage } = setup();
    const done = exportMarkingsImage(harness.context, ['M2']);
    // Synchronous: the picker needs the user gesture.
    expect(share.saveBlobWithPicker).toHaveBeenCalledTimes(1);
    expect(share.saveBlobWithPicker.mock.calls[0]?.slice(0, 2)).toEqual([
      'lateral-m2.png',
      'image/png',
    ]);
    await done;
    expect(readImage).toHaveBeenCalledWith('images/lateral.jpg');
    expect(crop.cropToPng).toHaveBeenCalledWith(
      source,
      { x: 1200, y: 1200, width: 400, height: 200 },
      null,
    );
    expect(harness.ui.toast.value).toBe(t('export.image.done'));
    expect(share.downloadFile).not.toHaveBeenCalled();
  });

  it('names a selection with the word and the count and crops the bounding box', async () => {
    const { harness } = setup();
    await exportMarkingsImage(harness.context, ['M2', 'M3']);
    expect(share.saveBlobWithPicker.mock.calls[0]?.[0]).toBe(
      `lateral-${t('export.image.selectionWord')}-2.png`,
    );
    expect(crop.cropToPng.mock.calls[0]?.[1]).toEqual({
      x: 1200,
      y: 1200,
      width: 400,
      height: 200,
    });
  });

  it('a cancelled picker shows no toast', async () => {
    const { harness } = setup();
    share.saveBlobWithPicker.mockResolvedValue('cancelled');
    await exportMarkingsImage(harness.context, ['M2']);
    expect(harness.ui.toast.value).toBeNull();
  });

  it('a failed save shows the failure toast', async () => {
    const { harness } = setup();
    share.saveBlobWithPicker.mockResolvedValue('failed');
    await exportMarkingsImage(harness.context, ['M2']);
    expect(harness.ui.toast.value).toBe(t('export.image.failed'));
  });

  it('without the picker, downloads a file with the same name', async () => {
    const { harness } = setup();
    share.canSaveWithPicker.mockReturnValue(false);
    await exportMarkingsImage(harness.context, ['M2']);
    expect(share.saveBlobWithPicker).not.toHaveBeenCalled();
    expect(share.downloadFile).toHaveBeenCalledTimes(1);
    const file = share.downloadFile.mock.calls[0]?.[0] as File;
    expect(file.name).toBe('lateral-m2.png');
    expect(file.type).toBe('image/png');
    expect(harness.ui.toast.value).toBe(t('export.image.done'));
  });

  it('a missing image file fails, with the error in Diagnostics', async () => {
    const { harness, readImage } = setup();
    share.canSaveWithPicker.mockReturnValue(false);
    readImage.mockResolvedValue(null);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await exportMarkingsImage(harness.context, ['M2']);
    expect(share.downloadFile).not.toHaveBeenCalled();
    expect(harness.ui.toast.value).toBe(t('export.image.failed'));
    expect(reportedErrors.value.some((e) => e.context === 'export.image')).toBe(true);
    errorLog.mockRestore();
  });

  it('does nothing for markings that cannot be exported (different images)', async () => {
    const { harness } = setup();
    await exportMarkingsImage(harness.context, ['M1', 'M4']);
    expect(share.saveBlobWithPicker).not.toHaveBeenCalled();
    expect(share.downloadFile).not.toHaveBeenCalled();
  });

  it('exports with a locked marking (export is a read)', async () => {
    const { harness } = setup();
    harness.actions.setMarkingLocked('M2', true);
    await exportMarkingsImage(harness.context, ['M2']);
    expect(crop.cropToPng).toHaveBeenCalledTimes(1);
  });
});
