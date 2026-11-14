import { describe, expect, it } from 'vitest';
import {
  ITEM_CLIPBOARD_FORMAT,
  ITEM_CLIPBOARD_MIME,
  itemClipboardData,
} from '../../src/model';
import { sampleProject } from './fixtures';

const extra = { project: 'mapping', ref: 'mapping://mapping/m/x' };

describe('itemClipboardData', () => {
  const p = sampleProject();

  it('the MIME type of the own format is a valid custom web format', () => {
    expect(ITEM_CLIPBOARD_MIME).toBe('application/x-mapping-item+json');
  });

  it('marking: it, the descendants and the annotations of all', () => {
    const data = itemClipboardData(p, 'm', 'M1', extra);
    expect(data).toMatchObject({
      format: ITEM_CLIPBOARD_FORMAT,
      version: 1,
      kind: 'm',
      project: 'mapping',
      ref: 'mapping://mapping/m/x',
    });
    expect(data.item.id).toBe('M1');
    expect(data.markings.map((m) => m.id).sort()).toEqual(['M2', 'M3']);
    expect(data.annotations.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('a marking without children carries only its annotations', () => {
    const data = itemClipboardData(p, 'm', 'M4', extra);
    expect(data.markings).toEqual([]);
    expect(data.annotations.map((a) => a.id)).toEqual(['A4']);
  });

  it('image: all its markings and annotations', () => {
    const data = itemClipboardData(p, 'i', 'I1', extra);
    expect(data.item.id).toBe('I1');
    expect(data.markings.map((m) => m.id).sort()).toEqual(['M1', 'M2', 'M3']);
    expect(data.annotations.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('annotation: only it', () => {
    const data = itemClipboardData(p, 'a', 'A1', extra);
    expect(data.item.id).toBe('A1');
    expect(data.markings).toEqual([]);
    expect(data.annotations).toEqual([]);
  });

  it('a nonexistent item fails with not-found', () => {
    expect(() => itemClipboardData(p, 'm', 'nothing', extra)).toThrow();
    expect(() => itemClipboardData(p, 'i', 'nothing', extra)).toThrow();
    expect(() => itemClipboardData(p, 'a', 'nothing', extra)).toThrow();
  });

  it('is JSON-serializable (it is what goes to the clipboard)', () => {
    const data = itemClipboardData(p, 'm', 'M1', extra);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
