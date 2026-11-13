import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { files } from '../support/material3Library';

// Achado R9.22 da #1355 (correção CL1): o roteiro dizia "1 aviso" e `children[1]`, mas o pacote
// Material 3 já traz os avisos `parâmetro fora da ficha` e o nó `rótulo` é `children[4].children[2]`.
// O teste monta o pacote real com o `family` inválido e amarra o texto do roteiro ao resultado.

const BUTTON = 'components/button.json';
const FAMILY = '"Segoe UI, Roboto';

const withFamily = (): typeof files =>
  files.map((f) => {
    if (f.path !== BUTTON || f.text === undefined) return f;
    const json = JSON.parse(f.text) as {
      template: {
        children: { children: { name: string; font: Record<string, unknown> }[] }[];
      };
    };
    const label = json.template.children[4]?.children[2];
    if (label?.name !== 'rótulo')
      throw new Error('nó rótulo não está em children[4].children[2]');
    label.font.family = FAMILY;
    return { ...f, text: JSON.stringify(json, null, 2) };
  });

const row = readFileSync('docs/TESTING.md', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('| R9.22 |'));

describe('R9.22 do roteiro bate com o validador do pacote Material 3', () => {
  const base = validateLibrary({ files });
  const altered = validateLibrary({ files: withFamily() });
  const novos = altered.warnings.filter(
    (w) => w.file === BUTTON && w.path.endsWith('font.family'),
  );

  it('o aviso novo é o único do button.json e cita o caminho e o valor', () => {
    expect(altered.errors).toEqual([]);
    expect(novos.map((w) => w.path)).toEqual([
      'template.children[4].children[2].font.family',
    ]);
    expect(novos[0]?.message).toContain(FAMILY);
    expect(altered.warnings.length).toBe(base.warnings.length + 1);
  });

  it('o roteiro diz "os avisos de sempre mais 1", sem número fixo, e o caminho certo', () => {
    expect(row).toBeDefined();
    expect(row).not.toMatch(/1 aviso/);
    expect(row).not.toMatch(/um item em `warnings`/);
    expect(row).toContain('template.children[4].children[2]');
    expect(row).not.toContain('`children[1]` do quadro');
    expect(row).toContain('parâmetro fora da ficha');
  });
});
