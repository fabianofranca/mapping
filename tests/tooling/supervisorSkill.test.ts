// @vitest-environment node
// Fase FM8 (etapa #1532, decisões 19 e 20): a skill `supervisionar-fila`, o `custo.py` e a seção
// `## Supervisão da fila` do `docs/FLOW.md`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scriptMeasureProblems } from '../support/contextMeasure';
import { between, section } from '../support/textSlice';

const DIR = '.claude/skills/supervisionar-fila';
const SKILL = readFileSync(`${DIR}/SKILL.md`, 'utf8');
const QUEUE = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const FLOW = readFileSync('docs/FLOW.md', 'utf8');

/** Os itens "- …" da lista do tipo A, até a primeira linha em branco depois dela. */
function typeAItems(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('**Tipo A**'));
  if (start < 0) throw new Error('lista do tipo A não achada');
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('- ')) items.push(l);
    else if (items.length > 0 && l.trim() === '') break;
  }
  return items;
}

describe('skill supervisionar-fila (decisão 19)', () => {
  it('tem o frontmatter com name e description', () => {
    const m = SKILL.match(/^---\nname: supervisionar-fila\ndescription: (.+)\n---\n/);
    expect(m).not.toBeNull();
    expect(m![1]!.length).toBeGreaterThan(40);
  });

  it.each([
    'claude-opus-5-5',
    'effort: high',
    'effort_level',
    '~50%',
    '~500k',
    'used_tokens',
    '2× a base',
    '--sessao',
    'requests --desde',
    'Estado da execução',
    'pinned',
    'passagem',
    'Supervisor <n>',
    'retomar anterior=',
    'Supervisão da fila',
    'painel.py requests',
    'roles',
    'costs',
    'varredura desde=',
    'create_new_session_on_fire',
    'SUP-<n>',
  ])('cita %s', (text) => {
    expect(SKILL).toContain(text);
  });

  it('não tem mais o critério dos ~150k nem os limites de ~25% e ~250k (decisão 7)', () => {
    expect(SKILL).not.toContain('~150k');
    expect(SKILL).not.toContain('~25%');
    expect(SKILL).not.toContain('~250k');
  });

  it('o description diz o que a retomada sem argumentos faz, em até ~500 caracteres', () => {
    const d = SKILL.match(
      /^---\nname: supervisionar-fila\ndescription: (.+)\n---\n/,
    )![1]!;
    expect(d.length).toBeLessThanOrEqual(500);
    expect(d).toContain('sem argumentos');
    expect(d).toContain('troca');
    expect(d).toContain('~50%');
    expect(d).toContain('Supervisão da fila');
    expect(d).toContain('database');
  });

  it('## Argumentos mostra a forma sem argumentos e lista os argumentos que seguem valendo (decisão 1)', () => {
    const s = section(SKILL, '## Argumentos');
    expect(s).toContain('/supervisionar-fila` sem argumentos');
    expect(s).toContain(
      '/supervisionar-fila [retomar] [anterior=<id>] [painel=<url>] [custo] [varredura desde=<ISO>]',
    );
    for (const arg of [
      'retomar',
      'anterior=<id>',
      'painel=<url>',
      'custo',
      'varredura desde=<ISO>',
    ]) {
      expect(s).toContain(`- \`${arg}`);
    }
    expect(s).toContain('o `roles`');
  });

  it('## Papel e limites: o último item lê a linha `esta sessão:` do roles --sessao (decisão 3)', () => {
    const items = section(SKILL, '## Papel e limites')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    const last = items[items.length - 1]!;
    expect(last).toContain('esta sessão:');
    expect(last).toContain('roles --sessao');
    expect(last).toContain('https://claude.ai/code/<id');
    expect(last).toContain(
      'este chat é o coordenador; abra uma sessão nova para a supervisão',
    );
  });

  it('## Pedidos ao coordenador: a leitura de cada turno é a da decisão 13', () => {
    const s = section(SKILL, '## Pedidos ao coordenador');
    const leitura = s.split('\n').find((l) => l.startsWith('- **Leitura:**'))!;
    expect(leitura).toContain('ArtifactData');
    expect(leitura).toContain('datasets');
    expect(leitura).toContain('out_dir');
    expect(leitura).toContain('requests --desde');
    expect(leitura).toContain('roles --sessao');
  });

  it('## Leitura das fontes: o meta nunca entra no contexto e o painel se acha pelo fixado (decisões 2 e 13)', () => {
    const s = section(SKILL, '## Leitura das fontes');
    expect(s).not.toContain('JSON pequeno');
    expect(s).toContain('nunca');
    expect(s).toContain('Mapping Fila');
    expect(s).toContain('Fila de desenvolvimento');
    expect(s).toContain('limit: 50');
    expect(s).toContain('`get_session` do antecessor');
  });

  it('## Troca de sessão: tamanho, base, lembrete, troca no retorno e os cinco estados (decisões 3 e 6 a 8)', () => {
    const s = section(SKILL, '## Troca de sessão');
    for (const state of ['registrada', 'sucessora', 'antiga', 'coordenador', 'nova']) {
      expect(s).toContain(`\`${state}`);
    }
    // Achado CL1.5: o script como instrução e o `used_tokens` só como proibição.
    expect(
      scriptMeasureProblems(between(s, '**Tamanho e base.**', '**Troca no retorno')),
    ).toEqual([]);
    expect(s).toContain('no fim do primeiro turno');
    expect(s).toContain('120 mil');
    expect(s).toContain('2× a base');
    expect(s).toContain('Contexto: <n> mil, mais de 2× a base (<b> mil).');
    expect(s).toContain('mais de 1 h');
    expect(s).toContain('claude-opus-5-5');
    expect(s).toContain('acima de ~50%');
    expect(s).toContain('A troca não tem turno de passagem');
    expect(s).toContain(
      '/supervisionar-fila retomar anterior=<id desta sessão> painel=<url>',
    );
    expect(s).toContain('archive_session');
    expect(s).toContain('delete_trigger');
    expect(s).toContain('Supervisão acima de 50% e sem vaga na linhagem');
    expect(s).toContain('kind=supervisor');
  });

  it('## Passagem: coleção, quatro tipos, if_version e migração (decisões 9 e 10)', () => {
    const s = section(SKILL, '## Passagem');
    expect(s).toContain('`passagem`');
    for (const tipo of ['decisao', 'issue', 'agendamento', 'licao']) {
      expect(s).toContain(`\`${tipo}\``);
    }
    expect(s).toContain('ArtifactData');
    expect(s).toContain('if_version');
    expect(s).toContain('artifact-design');
    expect(s).toContain('migra');
    expect(s).toContain('capabilities: {db: {}}');
    expect(s).toContain('no mesmo turno');
    expect(s).toContain('delete');
    expect(SKILL.indexOf('## Passagem')).toBeGreaterThan(
      SKILL.indexOf('## Troca de sessão'),
    );
  });

  it('revisão: migração na primeira retomada, agendamentos de vigia, nova e leitura completa', () => {
    const troca = section(SKILL, '## Troca de sessão');
    const passagem = section(SKILL, '## Passagem');
    // a primeira retomada depois do merge ainda lê o Markdown e migra depois do registro
    expect(troca).toContain('ainda é o Markdown');
    // só os agendamentos presos à sessão do antecessor são recriados; os de vigia ficam
    expect(troca).toContain('persistent_session_id');
    expect(troca).toContain('create_new_session_on_fire');
    // a nova escreve o mínimo antes do registro e não duplica o artefato
    expect(passagem).toContain('Artifact` `list`');
    expect(passagem).toContain('antes do registro');
    // a migração tem um marcador durável: a coleção vazia sozinha não basta
    expect(passagem).toContain('o artefato ainda é o Markdown');
    // documento novo não tem if_version, e a leitura segue o cursor
    expect(passagem).toContain('documento novo');
    expect(passagem).toContain('next_cursor');
    // a notificação sem vaga na linhagem vai uma vez só
    expect(troca).toContain('uma só vez');
  });

  it('## Subagentes: o briefing pede o retorno em até 10 linhas (decisão 13)', () => {
    const s = section(SKILL, '## Subagentes');
    expect(s).toContain('até 10 linhas');
  });

  it('## Vigiar uma condição: descreve o observador real, mudado só pelo dono na tela (etapa #1694)', () => {
    const s = section(SKILL, '## Vigiar uma condição');
    for (const text of [
      'Mapping - Workflow Insights',
      'trig_01YXXNz6596nCkk9vsyrvPgp',
      'CRON_TZ=America/Sao_Paulo 0 12 * * *',
      '12:00 de Brasília',
      'created_via: http_api',
      'https://claude.ai/code/routines/trig_01YXXNz6596nCkk9vsyrvPgp',
      'get_trigger',
      '#1644',
      'observador-da-fila',
      'create_new_session_on_fire',
    ]) {
      expect(s, text).toContain(text);
    }
    // o horário antigo e as chaves do prompt agendado (a fonte do prompt é o get_trigger)
    expect(s).not.toContain('a cada 6 h');
    for (const key of ['testador-acima-teto', 'fase-acima-teto', 'supervisor-trocas']) {
      expect(s, key).not.toContain(key);
    }
    // o agendamento que não existe mais não aparece em lugar nenhum da skill
    expect(SKILL).not.toContain('trig_01WCuidEK7f4DFiyDB69XNG6');
  });

  it('a lista do tipo A é igual, item por item, à de "Pedidos do supervisor" do implementar-fila', () => {
    const queue = typeAItems(section(QUEUE, '## Pedidos do supervisor'));
    expect(queue.length).toBeGreaterThanOrEqual(5);
    expect(typeAItems(SKILL)).toEqual(queue);
  });

  it('aponta para a Leitura do CI do FLOW.md sem repetir a definição', () => {
    expect(SKILL).toContain('Leitura do CI');
    expect(SKILL).not.toContain('`check`, `e2e`');
  });

  it('transcripts só por subagente Sonnet e sem conferências periódicas', () => {
    expect(SKILL).toMatch(/transcripts?[^.]*subagente Sonnet/i);
    expect(SKILL).toContain('sem conferências periódicas');
  });

  it('não repete o FLOW.md nem o PROCESS.md: aponta para eles', () => {
    expect(SKILL).toContain('docs/FLOW.md');
    expect(SKILL).toContain('docs/PROCESS.md');
  });
});

describe('docs/FLOW.md: ## Supervisão da fila', () => {
  it('tem a seção e cita /supervisionar-fila', () => {
    const s = section(FLOW, '## Supervisão da fila');
    expect(s).toContain('/supervisionar-fila');
  });

  it('abre e retoma sem argumentos, troca ao voltar depois de mais de 1 h e só troca sozinha acima de ~50% (decisões 6 e 7)', () => {
    const s = section(FLOW, '## Supervisão da fila');
    expect(s).toContain('/supervisionar-fila` sem argumentos');
    expect(s).toContain('mais de 1 h');
    expect(s).toContain('~50%');
    expect(s).toContain('Supervisão da fila');
    expect(s).toContain('database');
    expect(s).not.toContain('~25%');
  });
});

describe('passagem/index.html: a página do artefato "Supervisão da fila" (decisão 9)', () => {
  const PAGE_PATH = `${DIR}/passagem/index.html`;
  const page = existsSync(PAGE_PATH) ? readFileSync(PAGE_PATH, 'utf8') : '';

  it('existe e tem o título do artefato', () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
    expect(page).toContain('<title>Supervisão da fila</title>');
  });

  it('abre a database e lê a coleção passagem em tempo real', () => {
    expect(page).toMatch(/claude\.use\(\s*['"]db['"]\s*\)/);
    expect(page).toContain('passagem');
    expect(page).toContain('onSnapshot');
  });

  it('mostra os quatro tipos de regra e só lê', () => {
    for (const tipo of ['decisao', 'issue', 'agendamento', 'licao']) {
      expect(page).toContain(tipo);
    }
    for (const w of ['.set(', '.update(', '.delete(', '.add('])
      expect(page).not.toContain(w);
  });

  it('espera o window.claude até o prazo e mostra os documentos de tipo desconhecido', () => {
    expect(page).toContain('setTimeout(tentar');
    expect(page).toContain('Outras regras');
  });

  it('tem tema escuro e não usa innerHTML, fetch nem script externo', () => {
    expect(page).toContain('prefers-color-scheme: dark');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<script src');
  });
});

describe('custo.py (decisão 19)', () => {
  let tmp = '';
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'custo-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function session(title: string, usd: number, model: string): string {
    return JSON.stringify({
      ccr: {
        id: `session_${title.length}_${usd}`,
        title,
        session_context: { model },
        external_metadata: { usage: { cost_usd: usd } },
      },
    });
  }

  it('agrega o JSONL nos grupos da linha de base, com sessões, US$, mediana e % por modelo', () => {
    const rows = [
      session('Testador — #1532, bloco 1 de 5', 4, 'claude-sonnet-5-5'),
      session('Testador — #1532, bloco 2 de 5', 6, 'claude-sonnet-5-5'),
      session('Testador — reteste #1532', 2, 'claude-sonnet-5-5'),
      session('FM3 — Custo e esforço (#1537)', 2, 'claude-sonnet-5-5'),
      session('FM4 — Troca do coordenador (#1538)', 4, 'claude-sonnet-5-5'),
      session('FM4-C — Correção (#1538)', 1, 'claude-sonnet-5-5'),
      session('FM9 — Fechamento (#1550)', 1, 'claude-sonnet-5-5'),
      session('Fila — coordenador 3', 16, 'claude-opus-5-5'),
      session('Detalhamento — #1533', 4, 'claude-opus-5-5'),
      session('Supervisor 2', 10, 'claude-opus-5-5'),
      session('CR — coordenador (não arquivar)', 1, 'claude-fable-5-2'),
    ];
    const file = path.join(tmp, 's.jsonl');
    writeFileSync(file, rows.join('\n') + '\n');
    const r = spawnSync('python3', ['-I', `${DIR}/custo.py`, file], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = r.stdout;
    expect(out).toContain('Testador: 2 sessões, US$ 10.00, mediana US$ 5.00');
    expect(out).toContain('Fase: 2 sessões, US$ 6.00, mediana US$ 3.00');
    expect(out).toContain('Coordenador: 1 sessões, US$ 16.00, mediana US$ 16.00');
    expect(out).toContain('Detalhamento: 1 sessões, US$ 4.00, mediana US$ 4.00');
    expect(out).toContain('Supervisão: 1 sessões, US$ 10.00, mediana US$ 10.00');
    expect(out).toContain('Reteste: 1 sessões, US$ 2.00, mediana US$ 2.00');
    expect(out).toContain('Correção: 1 sessões, US$ 1.00, mediana US$ 1.00');
    expect(out).toContain('Fechamento: 1 sessões, US$ 1.00, mediana US$ 1.00');
    expect(out).toContain('Outras: 1 sessões, US$ 1.00, mediana US$ 1.00');
    expect(out).toContain('total: 11 sessões, US$ 51.00');
    expect(out).toContain('claude-sonnet-5-5: 39.2%');
    expect(out).toContain('claude-opus-5-5: 58.8%');
    expect(out).toContain('claude-fable-5-2: 2.0%');
  });

  it('aceita o get_session sem o envelope ccr e ignora linha vazia', () => {
    const file = path.join(tmp, 's.jsonl');
    writeFileSync(
      file,
      JSON.stringify({
        title: 'Supervisor 1',
        session_context: { model: 'claude-opus-5-5' },
        external_metadata: { usage: { cost_usd: 3 } },
      }) + '\n\n',
    );
    const r = spawnSync('python3', ['-I', `${DIR}/custo.py`, file], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Supervisão: 1 sessões, US$ 3.00');
  });

  it('sessão sem custo não entra nas contas e campos de tipo errado não derrubam o script', () => {
    const file = path.join(tmp, 's.jsonl');
    writeFileSync(
      file,
      [
        session('Supervisor 1', 3, 'claude-opus-5-5'),
        JSON.stringify({ ccr: { title: 'Supervisor 2', external_metadata: null } }),
        JSON.stringify({ ccr: { title: 7, external_metadata: { usage: 'x' } } }),
      ].join('\n') + '\n',
    );
    const r = spawnSync('python3', ['-I', `${DIR}/custo.py`, file], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('total: 1 sessões, US$ 3.00');
    expect(r.stdout).toContain('sem custo (fora das contas): 2 sessões');
    expect(r.stdout).toContain('Supervisão: 1 sessões, US$ 3.00, mediana US$ 3.00');
  });

  it('erro de uso ou linha que não é JSON sai com 2', () => {
    const none = spawnSync('python3', ['-I', `${DIR}/custo.py`], { encoding: 'utf8' });
    expect(none.status).toBe(2);
    const file = path.join(tmp, 'ruim.jsonl');
    writeFileSync(file, 'isto não é json\n');
    const bad = spawnSync('python3', ['-I', `${DIR}/custo.py`, file], {
      encoding: 'utf8',
    });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('linha 1');
  });
});
