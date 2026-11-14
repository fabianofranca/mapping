import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectFolder } from '../../mcp/createProject';
import { Roots } from '../../mcp/paths';

describe('create_project: first layer', () => {
  it('is named "Layer 1" by default, like the app in en-US', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mapping-layer-'));
    await createProjectFolder(new Roots([root], root), { path: 'p', name: 'P' });
    const saved = JSON.parse(readFileSync(join(root, 'p', 'mapping.json'), 'utf8'));
    expect(saved.layers[0].name).toBe('Layer 1');
  });

  it('firstLayerName overrides it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mapping-layer-'));
    await createProjectFolder(new Roots([root], root), {
      path: 'p',
      name: 'P',
      firstLayerName: 'Screens',
    });
    const saved = JSON.parse(readFileSync(join(root, 'p', 'mapping.json'), 'utf8'));
    expect(saved.layers[0].name).toBe('Screens');
  });
});
