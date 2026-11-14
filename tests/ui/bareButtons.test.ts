// Interface CR (#954, item 38): in the files of the item, every loose <button> (outside
// src/ui/controls/) carries the exception comment and is in the list of docs/DESIGN-SYSTEM.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = [
  'StatusBar.tsx',
  'ReferencedBy.tsx',
  'PerspectivePicker.tsx',
  'ZoomField.tsx',
  'TypedFields.tsx',
  'TypedForm.tsx',
  'TableField.tsx',
  'RefCell.tsx',
  'catalog/CatalogView.tsx',
  'review/ChangeMark.tsx',
  'review/ReviewBar.tsx',
];

describe('loose buttons (item 38)', () => {
  it.each(FILES)('%s: every <button> has the exception comment to Button', (file) => {
    const lines = readFileSync(`src/ui/${file}`, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/<button\b/.test(line)) return;
      const before = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
      expect(before, `${file}:${i + 1}`).toContain('Exception to Button:');
    });
  });

  it('the list of exceptions is in docs/DESIGN-SYSTEM.md', () => {
    const doc = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
    // pt-BR kept: heading of the Portuguese section of docs/DESIGN-SYSTEM.md
    expect(doc).toContain('Botões avulsos');
    for (const file of FILES) expect(doc).toContain(file.split('/').pop());
  });
});
