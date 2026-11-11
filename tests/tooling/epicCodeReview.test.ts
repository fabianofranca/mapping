// @vitest-environment node
// Fase CN1 (etapa #1525, decisões 1 a 6 e 10): o CR noturno só revisa o épico sem `/code-review high`
// do épico inteiro no fechamento, a coordenadora tem id e um jeito de ser recriada, e a mensagem do
// revisor no `docs/FLOW.md` é a cópia da guardada no agendamento. Fase CN2 (decisões 12 a 17): a lista
// sai da história da `main` (clone aprofundado), o passo 2 decide pelo commit e a busca de repetidas
// acha a rodada pelo marcador. Teste só de texto: o CI não lê o agendamento, então ele confere o lado
// do repositório (marcadores, ausência dos `<…>` e o mesmo id).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const process = readFileSync('docs/PROCESS.md', 'utf8');

const COORDINATOR = 'session_01Y37a9rGc6hS2VxVbVDhCcq';
const SCHEDULE = 'trig_01NnLQbxT56N2JciyDxdnP4j';
const OLD_SCHEDULE = 'trig_01HVM7XdLhjVuhwHSFz7AiCf';

const howItRuns = section(flow, '### Como roda');
const limitations = section(flow, '### Limitações conhecidas');
const reviewerSection = section(flow, '### Para o revisor do CR por épico');
const reviewerMessage = between(reviewerSection, '```text\n', '\n```').replace(
  '```text\n',
  '',
);

describe('CN1 — o CR noturno pula os épicos com CR no fechamento', () => {
  it('o docs/PROCESS.md diz que a revisão noturna é só para o épico sem CR no fechamento', () => {
    const item = process.split('\n').find((l) => l.startsWith('- **Revisão de código**'));
    expect(item).toBeDefined();
    expect(item).toContain('sem `/code-review high` do épico inteiro no fechamento');
    expect(item).toContain('`nenhum gatilho`');
    expect(item).toContain('2026-11-10');
  });

  it('o "Como roda" traz os ids do agendamento, da coordenadora e o do antigo, desativado', () => {
    expect(howItRuns).toContain(SCHEDULE);
    expect(howItRuns).toContain(COORDINATOR);
    expect(howItRuns).toContain(OLD_SCHEDULE);
    expect(howItRuns).toContain('CRON_TZ=America/Sao_Paulo 50 2 * * *');
  });

  it('o "Como roda" descreve o critério, o comando e as duas saídas', () => {
    expect(howItRuns).toContain(
      'node scripts/ci/riskTriggers.mjs --base <merge_commit_sha>^1',
    );
    expect(howItRuns).toContain('gatilho:');
    expect(howItRuns).toContain('nenhum gatilho');
    expect(howItRuns).toContain('CR no fechamento');
    expect(howItRuns).toContain('outra saída');
  });

  it('o "Como roda" ensina a recriar a coordenadora sem `update_trigger` trocar a sessão', () => {
    expect(howItRuns).toContain('create_session');
    expect(howItRuns).toContain('source_url');
    expect(howItRuns).toContain('create_trigger');
    expect(howItRuns).toContain('persistent_session_id');
    expect(howItRuns).toContain('enabled: false');
  });

  it('as "Limitações conhecidas" registram o épico fechado fora da fila', () => {
    const line = limitations.split('\n').find((l) => l.includes('fora da fila'));
    expect(line).toBeDefined();
    expect(line).toContain('implementar-fila');
  });

  it('o bloco do revisor usa os marcadores {nome}, {pr} e {sha}, sem os `<…>` antigos', () => {
    expect(reviewerMessage).toContain('{nome}');
    expect(reviewerMessage).toContain('{pr}');
    expect(reviewerMessage).toContain('{sha}');
    expect(reviewerMessage).toContain('Leia o CLAUDE.md antes de começar.');
    expect(reviewerMessage).not.toContain('<nome>');
    expect(reviewerMessage).not.toContain('<pr>');
    expect(reviewerMessage).not.toContain('<sha>');
    expect(reviewerMessage).not.toContain('<id da coordenadora>');
  });

  it('o passo 8 do revisor traz o mesmo id da coordenadora que o "Como roda"', () => {
    const step8 = reviewerMessage.split('\n').find((l) => l.startsWith('8. '));
    expect(step8).toBeDefined();
    expect(step8).toContain(`session_id ${COORDINATOR}`);
    expect(step8).toContain(`Coordenador: \`${COORDINATOR}\``);
    expect(howItRuns).toContain(COORDINATOR);
  });
});

describe('CN2 — o agendamento enxerga todos os épicos desde o CR base', () => {
  it('o "Como roda" lista os épicos pela história da main, com o clone aprofundado', () => {
    expect(howItRuns).toContain(
      'git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main',
    );
    expect(howItRuns).toContain('git merge-base --is-ancestor 4532e75 origin/main');
    expect(howItRuns).toContain(
      "git log --reverse --first-parent --format='%H %s' 4532e75..origin/main",
    );
  });

  it('o "Como roda" decide pelo commit e trata os seis merges sem o script', () => {
    expect(howItRuns).toContain(
      'git merge-base --is-ancestor 55b2491 <merge_commit_sha>',
    );
    expect(howItRuns).toContain('63e58b9');
    expect(howItRuns).toContain('#1381, #1343, #1418 e #1417');
    expect(howItRuns).toContain('#1373 e #1419');
  });

  it('o "Como roda" acha a issue da rodada também pelo marcador', () => {
    expect(howItRuns).toContain('in:body "cr-epic: pr=<n>"');
  });

  it('o "Como roda" não lê mais a API com limite de página nem o corte por hora', () => {
    expect(howItRuns).not.toContain('per_page=100');
    expect(howItRuns).not.toContain('merged_at');
    expect(howItRuns).not.toContain('2026-11-10T00:52:21Z');
  });

  it('as "Limitações conhecidas" registram o clone raso e o --paginate', () => {
    const line = limitations.split('\n').find((l) => l.includes('clone raso'));
    expect(line).toBeDefined();
    expect(line).toContain('--paginate');
  });

  it('o revisor aprofunda o clone antes de ler o diff', () => {
    expect(reviewerMessage).toContain(
      'git fetch -q --shallow-since=2026-11-08T00:00:00Z origin main && git diff {sha}^1 {sha}',
    );
    expect(reviewerMessage).not.toContain('git fetch origin main && git diff');
  });
});
