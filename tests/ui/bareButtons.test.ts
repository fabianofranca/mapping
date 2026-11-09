// CR da interface (#954, item 38): nos arquivos do item, todo <button> avulso (fora de
// src/ui/controls/) leva o comentário de exceção e está na lista de docs/DESIGN-SYSTEM.md.
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

describe('botões avulsos (item 38)', () => {
  it.each(FILES)('%s: cada <button> tem o comentário de exceção ao Button', (file) => {
    const lines = readFileSync(`src/ui/${file}`, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/<button\b/.test(line)) return;
      const before = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
      expect(before, `${file}:${i + 1}`).toContain('Exceção ao Button:');
    });
  });

  it('a lista de exceções está em docs/DESIGN-SYSTEM.md', () => {
    const doc = readFileSync('docs/DESIGN-SYSTEM.md', 'utf8');
    expect(doc).toContain('Botões avulsos');
    for (const file of FILES) expect(doc).toContain(file.split('/').pop());
  });
});
