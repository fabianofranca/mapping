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
    '%s with a file has the default action cancelled',
    (type) => {
      remove = installFileDropGuard();
      const event = dragEvent(type, ['Files']);
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('internal drag, without a file, is left alone', () => {
    remove = installFileDropGuard();
    const event = dragEvent('dragover', ['application/x-mapping-component']);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('once removed, it no longer cancels', () => {
    installFileDropGuard()();
    const event = dragEvent('drop', ['Files']);
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
