// @vitest-environment node
// Fase AF1 (etapa #1602, decisões 1 a 4 e 11): a autorização do dono é perguntada no chat da fase,
// com o aviso ao coordenador antes da pergunta, e todo aviso ao coordenador vai pelo `send_message`
// do `claude-code-remote`. Teste só de texto (leitura do `docs/FLOW.md`).
// Fase AF2 (decisões 4 a 9 e 14): o coordenador não repassa autorização, confere a pergunta da fase
// parada contra a lista fechada e o painel separa "esperando o dono no chat da fase" de "esperando
// o coordenador" (texto do skill `implementar-fila` e saída do `painel.py show`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const fase = section(flow, '## Para a sessão da fase');
const item6 = between(fase, '\n6. ', '\n7. ');
const item7 = between(fase, '\n7. ', '\n8. ');
const item8 = between(fase, '\n8. ', '\n9. ');

/** Texto de `start` (inclusive) até o fim de `text`; falta de âncora lança erro. */
function tail(text: string, start: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`âncora não achada: ${start}`);
  return text.slice(from);
}

const autorizacaoDoDono = (): string => tail(item8, '   - **Autorização do dono:**');

describe('AF1 — autorização do dono no chat da fase (#1602)', () => {
  it('a primeira linha do bloco abre a exceção do item 8', () => {
    const primeira = between(fase, 'Você é o agente da fase', '\n');
    expect(primeira).toContain('salvo a autorização do item 8');
  });

  it('o item 8 é uma lista com "Decisão de produto" e "Autorização do dono"', () => {
    expect(item8).toContain('\n   - **Decisão de produto:**');
    expect(item8).toContain('\n   - **Autorização do dono:**');
  });

  it('a lista fechada cobre os três casos e manda o resto ao sub-item "Decisão de produto"', () => {
    const autorizacao = autorizacaoDoDono();
    expect(autorizacao).toMatch(/chama o dono/);
    expect(autorizacao).toContain('distBudget.mjs');
    expect(autorizacao).toContain('.github/workflows/');
    expect(autorizacao).toContain('.claude/settings.json');
    expect(autorizacao).toContain('exceção a uma guarda');
    expect(autorizacao).toMatch(/lista é fechada/);
    expect(autorizacao).toMatch(/subagente parado/);
    expect(autorizacao).toContain('como seguir');
    expect(autorizacao).toContain('"Decisão de produto"');
  });

  it('a ordem: link do chat, PushNotification, aviso "Esperando o dono:" e só então o AskUserQuestion', () => {
    const autorizacao = autorizacaoDoDono();
    const link = autorizacao.indexOf('https://claude.ai/code/<id desta sessão>');
    const push = autorizacao.indexOf('`PushNotification`');
    const aviso = autorizacao.indexOf('Esperando o dono:');
    const pergunta = autorizacao.indexOf('`AskUserQuestion`');
    expect(link).toBeGreaterThanOrEqual(0);
    expect(push).toBeGreaterThan(link);
    expect(aviso).toBeGreaterThan(push);
    expect(pergunta).toBeGreaterThan(aviso);
    expect(autorizacao).toContain('send_message');
    // A mensagem da fase não tem passo de "conferência do modelo": o link não pode depender dele.
    expect(autorizacao).toContain('`get_session` sem `session_id`');
    expect(autorizacao).not.toContain('conferência do modelo');
  });

  it('opção recomendada, resposta ao coordenador e recusa de "o dono aprovou" repassado', () => {
    const autorizacao = autorizacaoDoDono();
    expect(autorizacao).toMatch(/opção recomendada/);
    expect(autorizacao).toContain('O dono respondeu:');
    expect(autorizacao).toMatch(/nunca aceita/);
    expect(autorizacao).toMatch(/o dono aprovou/);
    expect(autorizacao).toContain('agendamento');
  });

  it('item 7: sub-item "Canal" com o send_message do claude-code-remote e o status delivered', () => {
    expect(item7).toContain('\n   - **Canal:**');
    const canal = tail(item7, '   - **Canal:**');
    expect(canal).toContain('claude-code-remote');
    expect(canal).toContain('`send_message`');
    expect(canal).toContain('`session_id`');
    expect(canal).toContain('`status: delivered`');
    expect(canal).toContain('repete uma vez');
    expect(canal).toContain('nunca pelo `SendMessage`');
    expect(canal).toMatch(/itens 6 a 9/);
  });

  it('item 7: as mensagens de espera trocam "chama o dono" por "Esperando o dono" e "O dono respondeu"', () => {
    const lista = between(item7, '(as mensagens de espera', ')');
    expect(lista).toContain('Esperando o dono');
    expect(lista).toContain('O dono respondeu');
    expect(lista).not.toContain('"chama o dono"');
  });

  it('item 6: o teto aponta para o item 8 e não manda mais os números ao coordenador', () => {
    const teto = tail(item6, '   - **Teto do `dist/index.html`:**');
    expect(teto).toContain('item 8 (Autorização do dono)');
    expect(teto).not.toContain('mande os números e o motivo ao coordenador');
  });

  it('"Orquestrador — passo a passo": os limites não repassam autorização e leem a pergunta da fase parada', () => {
    const orq = section(flow, '## Orquestrador — passo a passo');
    const limites = tail(orq, '**Limites:**');
    expect(limites).toMatch(/não repassa a resposta/);
    expect(limites).toContain('autorização do dono');
    expect(limites).toContain('`AskUserQuestion`');
    expect(limites).toContain('`list_events`');
    expect(limites).toContain('"Decisão de produto"');
  });

  it('a numeração 1 a 9 e o 10 condicional não mudam', () => {
    for (let n = 1; n <= 9; n++) expect(fase).toContain(`\n${n}. `);
    expect(fase).toContain('10. Revisão de código');
  });
});

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('AF2 — painel.py: esperando o dono no chat da fase (#1602, decisão 7)', () => {
  let dir = '';
  const run = (now: string, ...args: string[]): string =>
    execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-dono-'));
    run('2026-11-11T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function esperaODono(): void {
    run(
      '2026-11-11T10:00:00Z',
      'row',
      dir,
      '#10',
      'status=esperando dono',
      'child=session_a',
      'childAt=now',
      'wait=dono no chat da fase: teto',
    );
  }

  it('a linha esperando dono com filha sai na linha nova e não em "esperando o coordenador"', () => {
    esperaODono();
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toContain(
      'esperando o dono no chat da fase: #10 (dono no chat da fase: teto)',
    );
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
    expect(out).not.toMatch(/esperando o coordenador:[^\n]*#10/);
  });

  it('a linha nova vem logo antes de "esperando o coordenador:"', () => {
    esperaODono();
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    const dono = out.indexOf('esperando o dono no chat da fase:');
    const coordenador = out.indexOf('esperando o coordenador:');
    expect(dono).toBeGreaterThanOrEqual(0);
    expect(coordenador).toBeGreaterThan(dono);
    expect(out.slice(dono, coordenador).trim().split('\n')).toHaveLength(1);
  });

  it('não é atrasada depois de 40 min', () => {
    esperaODono();
    const out = run('2026-11-11T10:40:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
    expect(out).toContain('esperando o dono no chat da fase: #10');
  });

  it('sem ela, a linha diz nenhuma', () => {
    expect(run('2026-11-11T10:05:00Z', 'show', dir)).toContain(
      'esperando o dono no chat da fase: nenhuma',
    );
  });

  it('linha com child e wait em andamento continua em "esperando o coordenador"', () => {
    run(
      '2026-11-11T10:00:00Z',
      'row',
      dir,
      '#11',
      'status=em andamento',
      'child=session_b',
      'childAt=now',
      'wait=CI travado',
    );
    const out = run('2026-11-11T10:05:00Z', 'show', dir);
    expect(out).toMatch(/esperando o coordenador: #11 \(CI travado\)/);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
  });

  it('"em andamento", wait= e childAt=now tiram a linha das duas listas', () => {
    esperaODono();
    run(
      '2026-11-11T10:10:00Z',
      'row',
      dir,
      '#10',
      'status=em andamento',
      'wait=',
      'childAt=now',
    );
    const out = run('2026-11-11T10:15:00Z', 'show', dir);
    expect(out).toContain('esperando o dono no chat da fase: nenhuma');
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('o import leva child, wait e sessions da fase que espera o dono (achado da revisão)', () => {
    esperaODono();
    run(
      '2026-11-11T10:01:00Z',
      'session',
      dir,
      '#10',
      'session_a',
      'kind=fase',
      'label=AF2',
    );
    const nova = mkdtempSync(path.join(tmpdir(), 'painel-dono-nova-'));
    try {
      run('2026-11-11T10:02:00Z', 'init', nova);
      run('2026-11-11T10:02:00Z', 'import', nova, dir);
      const out = run('2026-11-11T10:05:00Z', 'show', nova);
      expect(out).toContain(
        'esperando o dono no chat da fase: #10 (dono no chat da fase: teto)',
      );
      const linha = run('2026-11-11T10:05:00Z', 'show', nova, '#10');
      expect(linha).toContain('child: session_a');
      expect(linha).toContain('session_a');
      expect(linha).toMatch(/sessions:[^\n]*session_a/);
    } finally {
      rmSync(nova, { recursive: true, force: true });
    }
  });

  it('a docstring do topo cita a linha nova', () => {
    const fonte = readFileSync(SCRIPT, 'utf8');
    expect(between(fonte, '"""', '"""\nimport')).toContain(
      'esperando o dono no chat da fase',
    );
  });
});

describe('AF2 — skill implementar-fila: o coordenador não repassa autorização (#1602, decisões 4 a 9)', () => {
  const fases = (): string => between(skill, '2. **Fases**', '3. **Testador.**');
  const donoParagrafo = (): string =>
    between(
      tail(fases(), '**Filha que espera o dono**'),
      '**Filha que espera o dono**',
      '\n\n',
    );
  const coordenadorParagrafo = (): string =>
    between(fases(), '**Filha que espera o coordenador**', '\n\n');
  const reserva = (): string =>
    between(skill, '**Conferências de reserva:**', '**CI vermelho');

  it('"Filha que espera o coordenador" não lista mais o "chama o dono" do teto', () => {
    expect(coordenadorParagrafo()).toContain('CI travado');
    expect(coordenadorParagrafo()).not.toContain('chama o dono');
    expect(coordenadorParagrafo()).not.toContain('do teto');
  });

  it('"Filha que espera o dono": a lista fechada, o painel e a regra 1 fora dela', () => {
    expect(donoParagrafo()).toContain('Esperando o dono');
    for (const caso of ['chama o dono', 'edição de CI', 'exceção a uma guarda']) {
      expect(donoParagrafo()).toContain(caso);
    }
    expect(donoParagrafo()).toContain('status="esperando dono"');
    expect(donoParagrafo()).toContain('dono no chat da fase');
    expect(donoParagrafo()).toContain('wait=');
    expect(donoParagrafo()).toContain('step=');
    expect(donoParagrafo()).toMatch(/sem `PushNotification`/);
    expect(donoParagrafo()).toContain('`send_message`');
    expect(donoParagrafo()).toContain('priority: "now"');
    expect(donoParagrafo()).toMatch(/regra 1/);
  });

  it('"Filha que espera o dono": O dono respondeu e o aviso final voltam a "em andamento"', () => {
    expect(donoParagrafo()).toContain('O dono respondeu');
    expect(donoParagrafo()).toContain('aviso final');
    expect(donoParagrafo()).toContain('status="em andamento" wait= childAt=now');
  });

  it('"Filha que espera o dono": o coordenador não repassa autorização nem a resposta do dono', () => {
    expect(donoParagrafo()).toMatch(/não repassa autorização/);
    expect(donoParagrafo()).toMatch(/o dono aprovou/);
    expect(donoParagrafo()).toMatch(/chat da fila/);
    expect(donoParagrafo()).toContain('É autorização do dono');
    expect(donoParagrafo()).toContain('link do chat da fase');
  });

  it('"Conferências de reserva": atrasada em blocked lê o AskUserQuestion pendente', () => {
    const blocked = reserva().indexOf('`blocked`');
    const falhou = reserva().indexOf('falhou, parou pedindo permissão ou morreu');
    expect(blocked).toBeGreaterThanOrEqual(0);
    expect(falhou).toBeGreaterThan(blocked);
    const caso = reserva().slice(blocked, falhou);
    expect(caso).toContain('`AskUserQuestion`');
    expect(caso).toContain('`list_events`');
    expect(caso).toContain('kinds: ["assistant"]');
    expect(caso).toContain('"pedido de permissão"');
    expect(caso).toMatch(/regra 1/);
    expect(caso).toContain('PushNotification');
    expect(caso).toMatch(/linha com `wait` não se relê/);
  });

  it('"Conferências de reserva": o pedido de permissão ainda recria a sessão', () => {
    const recria = between(reserva(), 'falhou, parou pedindo permissão ou morreu', '\n');
    expect(recria).toContain('pedido de permissão');
    expect(recria).toContain('crie a sessão de novo');
  });

  it('passo 7: a regra com saída "#N mesclada" cai no mesmo ciclo, depois da conferência do skill', () => {
    const entre = between(skill, '7. **Entre etapas:**', '**Arquivar as sessões**');
    const skillNovo = entre.indexOf('o skill mudou na `main`');
    const regra = entre.indexOf('#N mesclada');
    expect(skillNovo).toBeGreaterThanOrEqual(0);
    expect(regra).toBeGreaterThan(skillNovo);
    expect(entre).toContain('rule end');
    expect(entre).toMatch(/mesmo ciclo/);
  });

  it('"Drenar" e "Fim" contam a etapa esperando dono com filha como etapa que ainda trabalha', () => {
    const drenar = between(skill, '- **Drenar**', '- **Issue que deixou de ser');
    expect(drenar).toContain('esperando dono');
    expect(drenar).toContain('`child`');
    const fim = section(skill, '## Fim');
    const primeira = fim.split('\n').find((l) => l.startsWith('Quando nenhuma etapa'))!;
    expect(primeira).toContain('esperando dono');
    expect(primeira).toContain('`child`');
  });

  it('"Painel": o show cita "esperando o dono no chat da fase"', () => {
    const painel = section(skill, '## Painel');
    const comandos = painel
      .split('\n')
      .find((l) => l.startsWith('painel.py show <pasta>  '))!;
    expect(comandos).toContain('esperando o dono no chat da fase');
    const paragrafo = between(painel, 'O `show` traz, depois de `atual:`', '\n\n');
    expect(paragrafo).toContain('esperando o dono no chat da fase:');
  });
});
