import { describe, expect, it } from 'vitest';
import { createPage, deletePage, type Change, type Project } from '../../src/model';
import { Refs } from '../../mcp/items';
import type { LoadedProject } from '../../mcp/projects';
import { ProposalLabels } from '../../mcp/proposalViews';
import { sampleProject } from '../model/fixtures';

const refsOf = (project: Project): Refs =>
  new Refs({ project, location: { name: 'store' } } as unknown as LoadedProject);

const change = (entityId: string): Change => ({ entity: 'page', entityId }) as Change;

describe('the label of a page change', () => {
  it('prints the page name: the proposed one for a created page, the current one for a removed page', () => {
    const current = createPage(sampleProject(), { id: 'PG2', name: 'Checkout' });
    const proposed = deletePage(createPage(current, { id: 'PG3', name: 'Cart' }), 'PG2', {
      discard: true,
    });
    const labels = ProposalLabels.ofRefs(refsOf(proposed), refsOf(current));
    expect(labels.target(change('PG3'))).toBe('page "Cart"');
    expect(labels.target(change('PG2'))).toBe('page "Checkout"');
    expect(labels.target(change('PGX'))).toBe('page "PGX"');
  });
});
