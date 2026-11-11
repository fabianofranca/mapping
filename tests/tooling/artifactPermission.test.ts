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

  it('permissions.allow libera o archive_session (o sucessor arquiva o coordenador anterior; FM4)', () => {
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
      permissions?: { allow?: string[] };
    };
    expect(settings.permissions?.allow).toContain(
      'mcp__claude-code-remote__archive_session',
    );
  });
});
