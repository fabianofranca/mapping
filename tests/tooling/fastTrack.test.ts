// @vitest-environment node
// Fase VR2 (etapa #1864, decisões 1 a 15): o skill `via-rapida` e a exceção "salvo a via rápida" no
// `CLAUDE.md`, no `docs/PROCESS.md`, no `docs/FLOW.md` e no `supervisionar-fila`. Testes de texto: cada
// âncora que falta lança erro (`tests/support/textSlice.ts`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const read = (path: string): string => readFileSync(path, 'utf8');
const SKILL = read('.claude/skills/via-rapida/SKILL.md');
const FLOW = read('docs/FLOW.md');
const PROCESS = read('docs/PROCESS.md');
const CLAUDE = read('CLAUDE.md');
const SUPERVISOR = read('.claude/skills/supervisionar-fila/SKILL.md');
const DETALHAR = read('.claude/skills/detalhar-backlog/SKILL.md');

describe('skill via-rapida', () => {
  it('tem o frontmatter com name e os gatilhos de uso na description', () => {
    const m = SKILL.match(/^---\nname: via-rapida\ndescription: (.+)\n---\n/);
    expect(m).not.toBeNull();
    for (const trigger of ['via rápida', 'ajuste pequeno de processo', '/via-rapida']) {
      expect(m![1], trigger).toContain(trigger);
    }
  });

  it('decisão 1: argumentos, Sonnet no modo Auto com effort high, confere o modelo e edita direto', () => {
    expect(SKILL).toContain('/via-rapida #<n> [mesclar=auto]');
    for (const s of [
      'Sonnet',
      'modo **Auto**',
      'effort: high',
      'session_context.model',
    ]) {
      expect(SKILL, s).toContain(s);
    }
    expect(SKILL).toContain('sem subagente de edição');
    expect(SKILL).toContain('só o põe no comando se o dono o escreveu no pedido');
  });

  it('decisão 2: roadmap ou bug direto a in-progress, nunca por ready, com o comentário `Via rápida:`', () => {
    const s = section(SKILL, '## Rótulo e comentário');
    for (const t of [
      'in-progress',
      '`Via rápida:`',
      'lista completa de rótulos',
      'nunca passa por `ready`',
      'painel.py toca',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decisão 3: merge com o "pode mesclar" do dono, e `mesclar=auto` só escrito por ele', () => {
    const s = section(SKILL, '## Merge');
    for (const t of [
      'PushNotification',
      'AskUserQuestion',
      'Mesclar (Recomendado)',
      'Ainda não',
      'merge_method: merge',
      '`mesclar=auto`',
      'nunca se acrescenta sozinho',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decisão 4: o que cabe (spec-author e o index.html do painel fora, 80 linhas) e a recusa', () => {
    const s = section(SKILL, '## O que cabe');
    for (const t of [
      '`.claude/skills/**`',
      '`docs/PROCESS.md`',
      '`docs/FLOW.md`',
      '`docs/TESTING-NUVEM.md`',
      '`CLAUDE.md`',
      '`.github/**`',
      '`scripts/ci/**`',
      '`tests/tooling/**`',
      '`.claude/skills/spec-author/`',
      '`.claude/skills/implementar-fila/painel/index.html`',
      '`isReleaseInput`',
      '`git diff --numstat origin/main...HEAD`',
      '80 linhas',
      '`Via rápida recusada: <critério>`',
      'feche o PR do épico sem mesclar',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decisão 5: conferência de conflito pelo painel.py conflito, sem gravar no painel', () => {
    const s = section(SKILL, '## Conflito com a fila');
    for (const t of [
      'painel.py conflito',
      '--pasta',
      '--com',
      '`Via rápida: espera #',
      'não segura o merge',
      'traga a `main` no épico antes do fechamento (merge, nunca rebase)',
      'nunca grava no painel',
      'Leitura das fontes',
      'comentário `Via rápida:`',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decisão 6: passo a passo do épico, com changelog, registro do DS, PR com `Closes #` e a Espera do CI', () => {
    const s = section(SKILL, '## Passo a passo');
    for (const t of [
      'git switch -C epic/<nome> origin/main',
      '`changelog/<nome>.md`',
      '`docs/design-system/<nome>.md`',
      'teste de texto',
      'npm run lint && npm run typecheck && npm test && npm run build',
      'Closes #<n>',
      'Espera do CI',
      'Leitura do CI',
      '`git mv`',
      'Origem: via rápida #<n>',
      '`Impacto: <nível> — <porquê>`',
      'pergunte ao dono',
    ]) {
      expect(s, t).toContain(t);
    }
    expect(SKILL).toContain('docs/FLOW.md');
  });

  it('decisão 7: a autorização do dono pergunta no chat da via rápida, nunca repassada', () => {
    const s = section(SKILL, '## Autorização do dono');
    for (const t of [
      '.github/workflows/',
      'item 8',
      'PushNotification',
      'AskUserQuestion',
      'repassado',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decisão 8: a revisão sai do riskTriggers.mjs (high com gatilho, medium sem)', () => {
    const s = section(SKILL, '## Revisão');
    for (const t of [
      'node scripts/ci/riskTriggers.mjs --base origin/main',
      '`gatilho:`',
      '`/code-review high <base>..HEAD`',
      '`git merge-base origin/main HEAD`',
      '`nenhum gatilho`',
      '`/code-review medium`',
      'sem `--comment` nem `--fix`',
      'item 10',
    ]) {
      expect(s, t).toContain(t);
    }
  });
});

describe('regras da via rápida nos documentos do fluxo (decisões 11 a 14)', () => {
  it('docs/FLOW.md, "Para o dono, nos três chats": o parágrafo da via rápida', () => {
    const s = section(FLOW, '## Para o dono, nos três chats');
    for (const t of [
      '/via-rapida #<n>',
      '`in-progress`',
      'pode mesclar',
      '`mesclar=auto`',
      'supervisão',
      '.claude/skills/via-rapida/SKILL.md',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('CLAUDE.md: a exceção no resumo do fluxo, e o arquivo segue com até 15000 caracteres', () => {
    const s = section(CLAUDE, '## Fluxo de trabalho (resumo)');
    expect(s).toContain('salvo a via rápida');
    expect(s).toContain('.claude/skills/via-rapida/SKILL.md');
    expect(CLAUDE.length).toBeLessThanOrEqual(15000);
  });

  it('docs/PROCESS.md: a exceção em Rótulos e em Etapas, o bullet **Via rápida** e o teto de 25000 bytes', () => {
    const fluxo = section(PROCESS, '## Fluxo de trabalho');
    const rotulos = fluxo.split('\n').find((l) => l.startsWith('  - **Rótulos:**'))!;
    expect(rotulos).toContain('salvo a via rápida');
    expect(section(PROCESS, '## Etapas')).toContain('salvo a via rápida');
    const lines = fluxo.split('\n');
    const epic = lines.findIndex((l) =>
      l.startsWith('- **Tudo chega à `main` por um épico.**'),
    );
    const fast = lines.findIndex((l) => l.startsWith('- **Via rápida'));
    expect(epic).toBeGreaterThanOrEqual(0);
    expect(fast).toBe(epic + 1);
    expect(lines[fast]).toContain('.claude/skills/via-rapida/SKILL.md');
    expect(Buffer.byteLength(PROCESS)).toBeLessThanOrEqual(25000);
  });

  it('docs/PROCESS.md: os dois cortes do "Evidência de bug" que repetem o docs/FLOW.md', () => {
    expect(PROCESS).not.toContain('- **O `evidencias`** só recebe imagens');
    expect(PROCESS).not.toContain('Push recusado porque o branch andou');
    expect(FLOW).toContain('## Evidência de bug');
  });

  it('supervisionar-fila: o primeiro item de "Papel e limites" cita a sessão da via rápida', () => {
    const items = section(SUPERVISOR, '## Papel e limites')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(items[0]).toContain('a sessão da via rápida');
    expect(items[items.length - 1]).toContain('esta sessão:');
  });

  it('detalhar-backlog: "Esforço do detalhamento" cita o skill via-rapida entre os gatilhos', () => {
    const s = section(DETALHAR, '## Esforço do detalhamento');
    expect(s).toContain('`via-rapida`');
  });
});
