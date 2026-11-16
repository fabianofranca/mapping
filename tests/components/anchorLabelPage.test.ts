import { describe, expect, it } from 'vitest';
import { createPage, type Project, type ThreadAnchor } from '../../src/model';
import { anchorLabel } from '../../src/ui/comments/anchorLabel';
import { sampleProject } from '../model/fixtures';

const point = (pageId?: string): ThreadAnchor => ({
  kind: 'point',
  containerId: null,
  x: 10,
  y: 20,
  ...(pageId === undefined ? {} : { pageId }),
});

describe('anchorLabel of a canvas point', () => {
  it('names the page only when the project has more than one', () => {
    const single: Project = sampleProject();
    const first = single.pages[0]!;
    expect(anchorLabel(single, point(first.id))).toBe('Canvas · loose point');
    const two = createPage(single, { id: 'PG2', name: 'Checkout' });
    expect(anchorLabel(two, point('PG2'))).toBe('Canvas · Checkout · loose point');
    expect(anchorLabel(two, point())).toBe('Canvas · loose point');
  });
});
