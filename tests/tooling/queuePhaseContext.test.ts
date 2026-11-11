// @vitest-environment node
// Fase CX1 (etapa #1638): teto de contexto da sessão da fase. Teste só de texto (leitura dos
// arquivos do fluxo de entrega): a fase confere o próprio contexto a 300 mil, passa a vez por uma
// passagem na sub-issue, o coordenador (ou o orquestrador de uma etapa só) cria a sucessora e
// arquiva a anterior, e a terceira sessão não troca.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

const phase = section(flow, '## Para a sessão da fase');
const item3 = between(phase, '3. Subagentes e esforço', '4. Todo briefing');
const ancora = item3.indexOf('   - **Teto de contexto da fase:**');
if (ancora < 0)
  throw new Error('âncora não achada: sub-item "Teto de contexto da fase" do item 3');
const teto = item3.slice(ancora);
const porEtapa = section(skill, '## 3. Por etapa');
const troca = between(
  porEtapa,
  '**Fase que passa a vez por contexto**',
  '**PR que espera o coordenador:**',
);

describe('CX1 — "Para a sessão da fase" do docs/FLOW.md, sub-item do item 3', () => {
  it('o sub-item fica debaixo do item 3, sem mudar a primeira linha nem a numeração', () => {
    expect(item3.split('\n')[0]).toMatch(
      /^3\. Subagentes e esforço: <da sub-issue, ex\.: /,
    );
    expect(item3).toContain('~200k');
    expect(phase).toContain('\n4. Todo briefing');
    expect(phase).toContain('\n9. Defeito achado no caminho');
  });

  it('o teto é 300 mil, lidos do get_session sem session_id (context_usage.used_tokens)', () => {
    expect(teto).toContain('300 mil');
    expect(teto).toContain('300.000');
    expect(teto).toContain('`get_session` sem `session_id`');
    expect(teto).toContain('`external_metadata.context_usage.used_tokens`');
  });

  it('a conferência é antes de tarefa nova de subagente e antes dos gates do item 5', () => {
    expect(teto).toMatch(/antes de mandar uma tarefa nova a um subagente/);
    expect(teto).toMatch(/antes de rodar os gates do item 5/);
  });

  it('depois do PR aberto não há troca: a fase termina na mesma sessão', () => {
    expect(teto).toMatch(/Depois que o PR da fase está aberto[^.]*não há troca/);
    expect(teto).toContain('termina na mesma sessão');
  });

  it('a passagem: espera os subagentes, WIP com push, comentário na sub-issue, sem PR', () => {
    expect(teto).toContain('espera os subagentes em curso');
    expect(teto).toContain('`WIP <código>: passagem por contexto`');
    expect(teto).toContain('`git push -u origin <branch>`');
    expect(teto).toMatch(/Não abre PR/);
    expect(teto).toContain('`Passagem da fase <código> (contexto <n> mil):`');
    for (const campo of [
      'o branch e o commit',
      'os checkboxes feitos e os que faltam',
      'os testes vistos falhando antes do código',
      'as decisões tomadas fora da sub-issue',
      'os defeitos pendentes',
      'o próximo passo',
    ]) {
      expect(teto).toContain(campo);
    }
  });

  it('a mensagem ao coordenador vai pelo Canal do item 7, e a fase termina o turno', () => {
    expect(teto).toContain(
      '`Troca de sessão da fase <código>: contexto <n> mil; passagem em <link do comentário>.`',
    );
    expect(teto).toContain('pelo Canal do item 7');
    expect(teto).toContain('Termina o turno');
  });

  it('a sucessora lê a passagem no item 1 e continua no branch que já existe', () => {
    expect(teto).toContain('`Retomada por contexto (<k> de 3)`');
    expect(teto).toContain('no item 1 (');
    expect(teto).toContain('`git switch <branch>`');
    expect(teto).toMatch(/continua no branch que já existe/);
    expect(teto).toMatch(/não o recria/);
  });

  it('no máximo 2 trocas: a terceira sessão não troca e avisa "passou de 300 mil na terceira sessão"', () => {
    expect(teto).toContain('2 trocas');
    expect(teto).toContain('3 sessões');
    expect(teto).toContain('passou de 300 mil na terceira sessão');
  });

  it('vale também para a fase de correção e não cita send_later, ci-rerun.yml nem distBudget.mjs', () => {
    expect(teto).toContain('fase de correção');
    expect(teto).not.toContain('send_later');
    expect(teto).not.toContain('ci-rerun.yml');
    expect(teto).not.toContain('distBudget.mjs');
  });
});

describe('CX1 — "Orquestrador — passo a passo" do docs/FLOW.md, parágrafo "Limites"', () => {
  const passo = section(flow, '## Orquestrador — passo a passo');
  const limites = passo.slice(passo.indexOf('**Limites:**'));

  it('o orquestrador responde ao pedido de troca criando a sucessora e arquivando a anterior', () => {
    expect(limites).toContain('Troca de sessão da fase <código>');
    expect(limites).toContain('sucessora');
    expect(limites).toContain('Retomada por contexto (<k> de 3)');
    expect(limites).toContain('arquiva a anterior');
    expect(limites).toContain('Teto de contexto da fase');
  });
});

describe('CX1 — skill implementar-fila, "3. Por etapa"', () => {
  it('o parágrafo vem no passo 2, depois de "Filha que espera o dono"', () => {
    const dono = porEtapa.indexOf('**Filha que espera o dono**');
    const contexto = porEtapa.indexOf('**Fase que passa a vez por contexto**');
    expect(dono).toBeGreaterThan(0);
    expect(contexto).toBeGreaterThan(dono);
  });

  it('o coordenador cria a sucessora com o mesmo model, effort e source_revision', () => {
    expect(troca).toContain('quem cria a sucessora é o coordenador');
    expect(troca).toContain('`create_session`');
    expect(troca).toMatch(/mesmo `model`, `effort` e `source_revision`/);
    expect(troca).toContain(' · retomada <k>');
  });

  it('a mensagem leva a linha de retomada, com o branch que já existe', () => {
    expect(troca).toContain(
      'Retomada por contexto (<k> de 3): a sessão anterior (<id>) passou a vez com <n> mil; a passagem está em <link>.',
    );
    expect(troca).toContain('Continue no branch <branch>, que já existe');
    expect(troca).toContain('não o recrie da origin/epic/<nome>');
    expect(troca).toContain('não refaça o que a passagem dá como feito');
  });

  it('o painel recebe o child=, o session com o mesmo label e o log, num apply só', () => {
    expect(troca).toContain("row '#n' child=<novo> childAt=now");
    expect(troca).toContain("session <pasta> '#n' <novo> kind=fase label=<código>");
    expect(troca).toContain('<código>: troca por contexto (<n> mil) → <id novo>');
    expect(troca).toContain('`apply`');
  });

  it('a anterior é arquivada no mesmo ciclo, pelo subagente do ciclo, com o custo antes', () => {
    expect(troca).toContain('subagente do ciclo');
    expect(troca).toContain('`painel.py cost`');
    expect(troca).toContain('"Arquivar as sessões" › "Custo"');
    expect(troca).toContain('`archive_session`');
  });

  it('no máximo 2 trocas: a sessão 3 de 3 não troca e o log registra o caso', () => {
    expect(troca).toContain('No máximo 2 trocas por fase (3 sessões)');
    expect(troca).toContain('a sessão `3 de 3` não troca');
    expect(troca).toContain('passou de 300 mil na terceira sessão');
    expect(troca).toContain('<código>: passou de 300 mil na terceira sessão');
    expect(troca).toContain('o log registra o caso');
  });

  it('"O que não se arquiva" tem a exceção da filha que passou a vez por contexto', () => {
    const arquivar = between(
      section(skill, '## 3. Por etapa'),
      '- **O que não se arquiva:**',
      '- **Registro:**',
    );
    expect(arquivar).toContain('passou a vez por contexto');
    expect(arquivar).toMatch(/se arquiva/);
  });
});
