// @vitest-environment node
// Etapa #1390, fase DS2: o fechamento grava no artefato do DS, e sem esta regra o classificador
// do modo Auto nega o `Artifact` e a fila para. Que ela não suma numa limpeza.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('.claude/settings.json', () => {
  it('permissions.allow libera a ferramenta Artifact', () => {
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
      permissions?: { allow?: string[] };
    };
    expect(settings.permissions?.allow).toContain('Artifact');
  });
});
