// M2, grupo A (scaffold, box, row, column): os valores que o Compose fixa no commit 5113b82
// (`Scaffold.kt`, `Box.kt`, `Row.kt`, `Column.kt`) contra o que a biblioteca desenha.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { findSlot, resolveSlotLayout } from '../../src/model/components/arrange';
import { defaultValues } from '../../src/model/libraryDrawing';
import { SPEC_FILE, drawIn, files, solid, text } from '../support/material3Library';

type Mode = 'light' | 'dark';
const rawSpec = JSON.parse(text(SPEC_FILE)) as {
  tokens: { values: Record<string, Record<Mode, string>> };
};
const token = (name: string, mode: Mode): string => rawSpec.tokens.values[name]![mode];

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
const fillOf = (id: string, values: Record<string, string | number>, mode: Mode) =>
  solid(drawIn(catalog, entryOf(id), values, mode).root.fills);
function slotLayoutOf(id: string, values: Record<string, string | number>) {
  const entry = entryOf(id);
  const slot = findSlot(entry.component!)!;
  return resolveSlotLayout(slot, { ...defaultValues(entry.type), ...values });
}

describe('M2 grupo A — scaffold', () => {
  it('o fundo é o papel containerColor (padrão background) nos dois modos, como o Surface do Scaffold.kt', () => {
    // Scaffold.kt linha 90: containerColor = MaterialTheme.colorScheme.background
    expect(fillOf('scaffold', {}, 'light')).toBe(token('background', 'light'));
    expect(fillOf('scaffold', {}, 'dark')).toBe(token('background', 'dark'));
    expect(fillOf('scaffold', {}, 'dark')).toBe('#141218');
    for (const mode of ['light', 'dark'] as const) {
      expect(fillOf('scaffold', { containerColor: 'surfaceContainer' }, mode)).toBe(
        token('surface-container', mode),
      );
      expect(fillOf('scaffold', { containerColor: 'onPrimary' }, mode)).toBe(
        token('on-primary', mode),
      );
    }
  });
});

describe('M2 grupo A — box', () => {
  it('o fundo (Modifier.background) segue o papel nos dois modos, none é sem fundo e o padding recua o conteúdo', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(fillOf('box', { background: 'primaryContainer' }, mode)).toBe(
        token('primary-container', mode),
      );
    }
    expect(fillOf('box', { background: 'primaryContainer' }, 'dark')).not.toBe('#EADDFF');
    expect(fillOf('box', { background: 'none' }, 'light')).toBeUndefined();
    expect(fillOf('box', {}, 'dark')).toBeUndefined();
    const drawing = drawIn(
      catalog,
      entryOf('box'),
      { padding: 16, width: 'fill', height: 'fixed' },
      'light',
    );
    const slot = drawing.root.children[0]!;
    expect(slot.transform[4]).toBe(16);
    expect(slot.transform[5]).toBe(16);
  });
});

describe.each([
  {
    id: 'row',
    main: 'horizontalArrangement',
    cross: 'verticalAlignment',
    crossCenter: 'CenterVertically',
    crossEnd: 'Bottom',
    type: 'row',
  },
  {
    id: 'column',
    main: 'verticalArrangement',
    cross: 'horizontalAlignment',
    crossCenter: 'CenterHorizontally',
    crossEnd: 'End',
    type: 'column',
  },
])('M2 grupo A — $id', ({ id, main, cross, crossCenter, crossEnd, type }) => {
  it('o fundo segue o papel nos dois modos e none é sem fundo', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(fillOf(id, { background: 'surfaceContainerHigh' }, mode)).toBe(
        token('surface-container-high', mode),
      );
    }
    expect(fillOf(id, { background: 'none' }, 'dark')).toBeUndefined();
  });

  it('a distribuição e o alinhamento escolhidos viram justify e align do layout (padrão Start/Top)', () => {
    // Row.kt/Column.kt: Arrangement.Start/Top e Alignment.Top/Start são os padrões
    expect(slotLayoutOf(id, {})).toMatchObject({
      type,
      align: 'start',
      justify: 'start',
    });
    expect(slotLayoutOf(id, { [main]: 'Center' }).justify).toBe('center');
    expect(slotLayoutOf(id, { [main]: 'SpaceBetween' }).justify).toBe('space-between');
    expect(slotLayoutOf(id, { [main]: id === 'row' ? 'End' : 'Bottom' }).justify).toBe(
      'end',
    );
    expect(slotLayoutOf(id, { [cross]: crossCenter }).align).toBe('center');
    expect(slotLayoutOf(id, { [cross]: crossEnd }).align).toBe('end');
    const spaced = slotLayoutOf(id, { spacing: 8, padding: 16 });
    expect(spaced.gap).toBe(8);
    expect(spaced.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
  });
});
