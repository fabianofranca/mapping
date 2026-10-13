// Fase 8.4: a lista única da tela inicial (função pura por trás de `recentProjects`).
import { describe, expect, it } from 'vitest';
import { toRecentProjects } from '../../src/app/recents';
import type { LocalProjectMeta, StoredFolder } from '../../src/storage/local';

const folder = (id: string, name: string, folderName: string, usedAt: string) =>
  ({ id, name, folderName, usedAt }) satisfies StoredFolder;
const localMeta = (id: string, name: string, updatedAt: string, openedAt?: string) =>
  ({
    id,
    name,
    updatedAt,
    unexported: false,
    ...(openedAt === undefined ? {} : { openedAt }),
  }) satisfies LocalProjectMeta;

describe('toRecentProjects', () => {
  it('junta locais e pastas, do uso mais recente ao mais antigo', () => {
    const list = toRecentProjects(
      [
        localMeta('l1', 'Antigo', '2026-01-01T00:00:00.000Z'),
        localMeta(
          'l2',
          'Reaberto',
          '2026-01-01T00:00:00.000Z',
          '2026-03-01T00:00:00.000Z',
        ),
      ],
      [folder('f1', 'Pasta', 'pasta', '2026-02-01T00:00:00.000Z')],
    );
    expect(list.map((p) => [p.kind, p.id, p.usedAt])).toEqual([
      ['local', 'l2', '2026-03-01T00:00:00.000Z'],
      ['folder', 'f1', '2026-02-01T00:00:00.000Z'],
      ['local', 'l1', '2026-01-01T00:00:00.000Z'],
    ]);
  });

  // R7: duas linhas iguais (pasta renomeada reaberta pelo seletor, zip descompactado duas
  // vezes) ficam distinguíveis pelo nome da pasta.
  it('showFolderName: pasta com outro nome, ou outra pasta com o mesmo nome de projeto', () => {
    const list = toRecentProjects(
      [localMeta('l1', 'Loja', '2026-01-01T00:00:00.000Z')],
      [
        folder('a', 'Loja', 'loja', '2026-02-01T00:00:00.000Z'),
        folder('b', 'Loja', 'loja-2', '2026-02-02T00:00:00.000Z'),
        folder('c', 'carro', 'carro', '2026-02-03T00:00:00.000Z'),
        folder('d', 'Moto', 'motos', '2026-02-04T00:00:00.000Z'),
      ],
    );
    const shown = Object.fromEntries(
      list.flatMap((p) => (p.kind === 'folder' ? [[p.id, p.showFolderName]] : [])),
    );
    // O projeto local com o mesmo nome não conta: o selo da origem já distingue.
    expect(shown).toEqual({ a: true, b: true, c: false, d: true });
  });
});
