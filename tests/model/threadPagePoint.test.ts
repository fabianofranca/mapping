import { describe, expect, it } from 'vitest';
import {
  hostKey,
  hostOf,
  parseThread,
  parseThreadText,
  resolveAnchor,
  serializeThread,
  type Thread,
  type ThreadAnchor,
} from '../../src/model';
import { pagesProject } from '../store/pageHarness';
import { ANCHORS, rawThread, sampleThread } from './threadFixtures';

// Conversation on an empty canvas spot, with a page (stage #883, PG4, decision 14): the `point`
// anchor with a null `containerId` gains `pageId`, written as formatVersion 2 and only then.

const PAGE_POINT = {
  kind: 'point',
  containerId: null,
  x: 12,
  y: 34,
  pageId: 'PG2',
} as const;

const raw = (anchor: unknown, formatVersion: number) => ({
  ...rawThread(),
  formatVersion,
  anchor,
});

function errorsOf(data: unknown): readonly string[] {
  const result = parseThread(data);
  return result.ok ? [] : result.errors;
}

function written(t: Thread): { formatVersion: number; anchor: Record<string, unknown> } {
  return JSON.parse(serializeThread(t)) as {
    formatVersion: number;
    anchor: Record<string, unknown>;
  };
}

describe('writing', () => {
  it('a canvas point of page 2 serializes formatVersion 2 with pageId and round-trips', () => {
    const t = sampleThread({ anchor: PAGE_POINT });
    const out = written(t);
    expect(out.formatVersion).toBe(2);
    expect(out.anchor).toEqual({ ...PAGE_POINT });
    const back = parseThreadText(serializeThread(t));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.thread.formatVersion).toBe(2);
      expect(back.thread.anchor).toEqual(PAGE_POINT);
    }
  });

  it('a point inside a container and every other anchor kind stay formatVersion 1', () => {
    for (const anchor of ANCHORS) {
      if (anchor.kind === 'point' && anchor.containerId === null) continue;
      const out = written(sampleThread({ anchor }));
      expect(out.formatVersion).toBe(1);
      expect(out.anchor).not.toHaveProperty('pageId');
    }
  });

  it('a v1 canvas point (no pageId) is still written as formatVersion 1', () => {
    const out = written(
      sampleThread({ anchor: { kind: 'point', containerId: null, x: 0, y: 20 } }),
    );
    expect(out.formatVersion).toBe(1);
    expect(out.anchor).toEqual({ kind: 'point', containerId: null, x: 0, y: 20 });
  });
});

describe('resolving the page of a canvas point', () => {
  const p = pagesProject();

  it('a version 1 point (no pageId) goes to the first page', () => {
    const anchor: ThreadAnchor = { kind: 'point', containerId: null, x: 1, y: 2 };
    expect(hostOf(p, anchor)).toEqual({
      kind: 'point',
      containerId: null,
      x: 1,
      y: 2,
      pageId: 'PG1',
    });
  });

  it('a point with a pageId stays on that page', () => {
    expect(hostOf(p, PAGE_POINT)).toMatchObject({ kind: 'point', pageId: 'PG2' });
  });

  it('a point whose page no longer exists is an orphan (missing: page)', () => {
    const r = resolveAnchor(p, { ...PAGE_POINT, pageId: 'GONE' });
    expect(r).toMatchObject({ orphan: true, missing: 'page' });
  });

  it('the host key tells the pages apart', () => {
    const on = (pageId: string) => hostOf(p, { ...PAGE_POINT, pageId });
    const a = on('PG2');
    const b = on('PG3');
    if (!a || !b) throw new Error('no host');
    expect(hostKey(a)).not.toBe(hostKey(b));
  });
});

describe('reading', () => {
  it('reads version 2 with a canvas point and pageId', () => {
    expect(errorsOf(raw({ ...PAGE_POINT }, 2))).toEqual([]);
  });

  it('refuses formatVersion 3', () => {
    expect(errorsOf(raw({ ...PAGE_POINT }, 3))).toEqual([
      'formatVersion: must be 1 or 2',
    ]);
  });

  it('refuses a version 1 thread that carries pageId', () => {
    const [first] = errorsOf(raw({ ...PAGE_POINT }, 1));
    expect(first).toMatch(/^anchor\.pageId: /);
  });

  it('refuses a version 2 thread without pageId', () => {
    const [first] = errorsOf(raw({ kind: 'point', containerId: null, x: 1, y: 2 }, 2));
    expect(first).toMatch(/^anchor\.pageId: /);
  });

  it('refuses a version 2 thread whose point has a containerId', () => {
    const [first] = errorsOf(
      raw({ kind: 'point', containerId: 'I1', x: 1, y: 2, pageId: 'PG2' }, 2),
    );
    expect(first).toMatch(/^anchor\.containerId: /);
  });

  it('refuses a version 2 thread with another anchor kind', () => {
    const [first] = errorsOf(raw({ kind: 'marking', id: 'M1' }, 2));
    expect(first).toMatch(/^anchor\.pageId: /);
  });
});
