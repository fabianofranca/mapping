import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { AnnotationIssue } from '../../src/model/issues';
import { locale } from '../../src/store/settings';
import { arrangeMarking } from '../../src/ui/arrange';
import type { EditorContextValue } from '../../src/ui/EditorContext';
import { libraryHarness } from './libraryHarness';

// V.1: "Nothing to arrange" never shows while the component still "does not fit".

beforeEach(() => {
  locale.value = 'en-US';
});

describe('Arrange notice on a component that does not fit', () => {
  async function arranged(overflow: boolean) {
    const harness = await libraryHarness();
    const added = harness.actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: 'material3',
      typeId: 'm3-button',
    });
    if (!added.ok) throw new Error(added.error);
    const markingId = added.value;
    const annotation = harness
      .project()
      .annotations.find((a) => a.markingId === markingId)!;
    const issues = new Map<string, readonly AnnotationIssue[]>(
      overflow ? [[annotation.id, [{ code: 'component-overflow' }]]] : [],
    );
    const editor = {
      ...harness.context,
      derived: { ...harness.context.derived, issues: signal(issues) },
    } as unknown as EditorContextValue;
    arrangeMarking(editor, markingId);
    return harness.ui.toast.value;
  }

  it('nothing changes and it does not fit: says so instead of "Nothing to arrange"', async () => {
    const toast = await arranged(true);
    expect(toast).toBe(t('arrange.stillOverflow'));
    expect(toast).not.toBe(t('arrange.nothing'));
  });

  it('nothing changes and it fits: "Nothing to arrange"', async () => {
    expect(await arranged(false)).toBe(t('arrange.nothing'));
  });
});
