import { afterEach, describe, expect, it } from 'vitest';
import { installFileDropGuard } from '../../src/app/fileDropGuard';

function dragEvent(type: 'dragover' | 'drop', types: string[]): DragEvent {
  const event = new Event(type, { cancelable: true, bubbles: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { types } });
  return event;
}

let remove: (() => void) | null = null;
afterEach(() => remove?.());

describe('fileDropGuard (#972)', () => {
  it.each(['dragover', 'drop'] as const)(
    '%s com arquivo tem a ação padrão cancelada',
    (type) => {
      remove = installFileDropGuard();
      const event = dragEvent(type, ['Files']);
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('arrasto interno, sem arquivo, não é tocado', () => {
    remove = installFileDropGuard();
    const event = dragEvent('dragover', ['application/x-mapping-component']);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('depois de removido não cancela mais', () => {
    installFileDropGuard()();
    const event = dragEvent('drop', ['Files']);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
