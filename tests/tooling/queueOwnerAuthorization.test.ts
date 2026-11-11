// @vitest-environment node
// Fase AF1 (etapa #1602, decisões 1 a 4 e 11): a autorização do dono é perguntada no chat da fase,
// com o aviso ao coordenador antes da pergunta, e todo aviso ao coordenador vai pelo `send_message`
// do `claude-code-remote`. Teste só de texto (leitura do `docs/FLOW.md`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
