// @vitest-environment node
// Phase FM8 (stage #1532, decisions 19 and 20): the `supervisionar-fila` skill, `custo.py` and the
// `## Queue supervision` section of `docs/FLOW.md`.
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

/** The "- …" items of the type A list, up to the first blank line after it. */
function typeAItems(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('**Type A**'));
  if (start < 0) throw new Error('type A list not found');
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith('- ')) items.push(l);
    else if (items.length > 0 && l.trim() === '') break;
  }
  return items;
}

describe('skill supervisionar-fila (decision 19)', () => {
  it('has the frontmatter with name and description', () => {
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
  ])('cites %s', (text) => {
    expect(SKILL).toContain(text);
  });

  it('no longer has the ~150k criterion nor the ~25% and ~250k limits (decision 7)', () => {
    expect(SKILL).not.toContain('~150k');
    expect(SKILL).not.toContain('~25%');
    expect(SKILL).not.toContain('~250k');
  });

  it('the description says what the resume with no arguments does, in up to ~500 characters', () => {
    const d = SKILL.match(
      /^---\nname: supervisionar-fila\ndescription: (.+)\n---\n/,
    )![1]!;
    expect(d.length).toBeLessThanOrEqual(500);
    expect(d).toContain('with no arguments');
    expect(d).toContain('switch');
    expect(d).toContain('~50%');
    expect(d).toContain('Supervisão da fila');
    expect(d).toContain('database');
  });

  it('## Arguments shows the form with no arguments and lists the arguments that still apply (decision 1)', () => {
    const s = section(SKILL, '## Arguments');
    expect(s).toContain('/supervisionar-fila` with no arguments');
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
    expect(s).toContain('`roles` prevails');
  });

  it('## Role and limits: the last item reads the `esta sessão:` line of roles --sessao (decision 3)', () => {
    const items = section(SKILL, '## Role and limits')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    const last = items[items.length - 1]!;
    expect(last).toContain('esta sessão:');
    expect(last).toContain('roles --sessao');
    expect(last).toContain('https://claude.ai/code/<current supervisor');
    expect(last).toContain(
      'este chat é o coordenador; abra uma sessão nova para a supervisão',
    );
  });

  it('## Requests to the coordinator: the reading of each turn is that of decision 13', () => {
    const s = section(SKILL, '## Requests to the coordinator');
    const reading = s.split('\n').find((l) => l.startsWith('- **Reading:**'))!;
    expect(reading).toContain('ArtifactData');
    expect(reading).toContain('datasets');
    expect(reading).toContain('out_dir');
    expect(reading).toContain('requests --desde');
    expect(reading).toContain('roles --sessao');
  });

  it('## Reading the sources: the meta never enters the context and the panel is found by the pinned one (decisions 2 and 13)', () => {
    const s = section(SKILL, '## Reading the sources');
    expect(s).not.toContain('small JSON');
    expect(s).toContain('never');
    expect(s).toContain('Mapping Fila');
    expect(s).toContain('Fila de desenvolvimento');
    expect(s).toContain('limit: 50');
    expect(s).toContain("predecessor's `get_session`");
  });

  it('## Session switch: size, baseline, reminder, switch on return and the five states (decisions 3 and 6 to 8)', () => {
    const s = section(SKILL, '## Session switch');
    for (const state of ['registrada', 'sucessora', 'antiga', 'coordenador', 'nova']) {
      expect(s).toContain(`\`${state}`);
    }
    // Finding CL1.5: the script as the instruction and `used_tokens` only as a prohibition.
    expect(
      scriptMeasureProblems(between(s, '**Size and baseline.**', '**Switch on return')),
    ).toEqual([]);
    expect(s).toContain("at the end of this session's first turn");
    expect(s).toContain('120 thousand');
    expect(s).toContain('2× the baseline');
    expect(s).toContain('Contexto: <n> mil, mais de 2× a base (<b> mil).');
    expect(s).toContain('more than 1 h');
    expect(s).toContain('claude-opus-5-5');
    expect(s).toContain('above ~50%');
    expect(s).toContain('The switch has no handoff turn');
    expect(s).toContain(
      "/supervisionar-fila retomar anterior=<this session's id> painel=<url>",
    );
    expect(s).toContain('archive_session');
    expect(s).toContain('delete_trigger');
    expect(s).toContain('Supervisão acima de 50% e sem vaga na linhagem');
    expect(s).toContain('kind=supervisor');
  });

  it('## Handoff: collection, four types, if_version and migration (decisions 9 and 10)', () => {
    const s = section(SKILL, '## Handoff');
    expect(s).toContain('`passagem`');
    for (const tipo of ['decisao', 'issue', 'agendamento', 'licao']) {
      expect(s).toContain(`\`${tipo}\``);
    }
    expect(s).toContain('ArtifactData');
    expect(s).toContain('if_version');
    expect(s).toContain('artifact-design');
    expect(s).toContain('migra');
    expect(s).toContain('capabilities: {db: {}}');
    expect(s).toContain('in the same turn');
    expect(s).toContain('delete');
    expect(SKILL.indexOf('## Handoff')).toBeGreaterThan(
      SKILL.indexOf('## Session switch'),
    );
  });

  it('review: migration on the first resume, watch schedules, new session and full read', () => {
    const switching = section(SKILL, '## Session switch');
    const handoff = section(SKILL, '## Handoff');
    // the first resume after the merge still reads the Markdown and migrates after the registration
    expect(switching).toContain('still the old Markdown');
    // only the schedules tied to the predecessor's session are recreated; the watch ones stay
    expect(switching).toContain('persistent_session_id');
    expect(switching).toContain('create_new_session_on_fire');
    // the new session writes the minimum before the registration and does not duplicate the artifact
    expect(handoff).toContain('Artifact` `list`');
    expect(handoff).toContain('before the registration');
    // the migration has a durable marker: the empty collection alone is not enough
    expect(handoff).toContain('the artifact is still the Markdown');
    // a new document has no if_version, and the read follows the cursor
    expect(handoff).toContain('a new document');
    expect(handoff).toContain('next_cursor');
    // the notification with no lineage slot goes only once
    expect(switching).toContain('only once');
  });

  it('## Subagents: the briefing asks for the return in up to 10 lines (decision 13)', () => {
    const s = section(SKILL, '## Subagents');
    expect(s).toContain('up to 10 lines');
  });

  it('## Watching a condition: describes the real observer, changed only by the owner on the screen (stage #1694)', () => {
    const s = section(SKILL, '## Watching a condition');
    for (const text of [
      'Mapping - Workflow Insights',
      'trig_01YXXNz6596nCkk9vsyrvPgp',
      'CRON_TZ=America/Sao_Paulo 0 12 * * *',
      '12:00 Brasilia time',
      'created_via: http_api',
      'https://claude.ai/code/routines/trig_01YXXNz6596nCkk9vsyrvPgp',
      'get_trigger',
      '#1644',
      'observador-da-fila',
      'create_new_session_on_fire',
    ]) {
      expect(s, text).toContain(text);
    }
    // the old schedule and the scheduled prompt's keys (the prompt's source is get_trigger)
    expect(s).not.toContain('every 6 h');
    for (const key of ['testador-acima-teto', 'fase-acima-teto', 'supervisor-trocas']) {
      expect(s, key).not.toContain(key);
    }
    // the schedule that no longer exists appears nowhere in the skill
    expect(SKILL).not.toContain('trig_01WCuidEK7f4DFiyDB69XNG6');
  });

  it('the type A list is equal, item by item, to that of "Supervisor requests" in implementar-fila', () => {
    const queue = typeAItems(section(QUEUE, '## Supervisor requests'));
    expect(queue.length).toBeGreaterThanOrEqual(5);
    expect(typeAItems(SKILL)).toEqual(queue);
  });

  it('points to the Reading CI of FLOW.md without repeating the definition', () => {
    expect(SKILL).toContain('Reading CI');
    expect(SKILL).not.toContain('`check`, `e2e`');
  });

  it('transcripts only by a Sonnet subagent and no periodic checks', () => {
    expect(SKILL).toMatch(/transcripts?[^.]*Sonnet subagent/i);
    expect(SKILL).toContain('no periodic checks');
  });

  it('does not repeat FLOW.md nor PROCESS.md: points to them', () => {
    expect(SKILL).toContain('docs/FLOW.md');
    expect(SKILL).toContain('docs/PROCESS.md');
  });
});

describe('docs/FLOW.md: ## Queue supervision', () => {
  it('has the section and cites /supervisionar-fila', () => {
    const s = section(FLOW, '## Queue supervision');
    expect(s).toContain('/supervisionar-fila');
  });

  it('opens and resumes with no arguments, switches on return after more than 1 h and only switches by itself above ~50% (decisions 6 and 7)', () => {
    const s = section(FLOW, '## Queue supervision');
    expect(s).toContain('/supervisionar-fila` with no arguments');
    expect(s).toContain('more than 1 h');
    expect(s).toContain('~50%');
    expect(s).toContain('Supervisão da fila');
    expect(s).toContain('database');
    expect(s).not.toContain('~25%');
  });
});

describe('passagem/index.html: the page of the "Supervisão da fila" artifact (decision 9)', () => {
  const PAGE_PATH = `${DIR}/passagem/index.html`;
  const page = existsSync(PAGE_PATH) ? readFileSync(PAGE_PATH, 'utf8') : '';

  it('exists and has the artifact title', () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
    expect(page).toContain('<title>Supervisão da fila</title>');
  });

  it('opens the database and reads the passagem collection in real time', () => {
    expect(page).toMatch(/claude\.use\(\s*['"]db['"]\s*\)/);
    expect(page).toContain('passagem');
    expect(page).toContain('onSnapshot');
  });

  it('shows the four rule types and only reads', () => {
    for (const tipo of ['decisao', 'issue', 'agendamento', 'licao']) {
      expect(page).toContain(tipo);
    }
    for (const w of ['.set(', '.update(', '.delete(', '.add('])
      expect(page).not.toContain(w);
  });

  it('waits for window.claude until the deadline and shows documents of unknown type', () => {
    expect(page).toContain('setTimeout(tentar');
    expect(page).toContain('Other rules');
  });

  it('has a dark theme and uses no innerHTML, fetch nor external script', () => {
    expect(page).toContain('prefers-color-scheme: dark');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<script src');
  });
});

describe('custo.py (decision 19)', () => {
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

  it('aggregates the JSONL into the baseline groups, with sessions, US$, median and % per model', () => {
    const rows = [
      session('Testador — #1532, bloco 1 de 5', 4, 'claude-sonnet-5-5'),
      session('Testador — #1532, bloco 2 de 5', 6, 'claude-sonnet-5-5'),
      session('Testador — reteste #1532', 2, 'claude-sonnet-5-5'),
      session('FM3 — Cost and effort (#1537)', 2, 'claude-sonnet-5-5'),
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

  it('accepts the get_session without the ccr envelope and ignores an empty line', () => {
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

  it('a session with no cost stays out of the sums and wrong-type fields do not break the script', () => {
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

  it('a usage error or a non-JSON line exits with 2', () => {
    const none = spawnSync('python3', ['-I', `${DIR}/custo.py`], { encoding: 'utf8' });
    expect(none.status).toBe(2);
    const file = path.join(tmp, 'ruim.jsonl');
    writeFileSync(file, 'this is not json\n');
    const bad = spawnSync('python3', ['-I', `${DIR}/custo.py`, file], {
      encoding: 'utf8',
    });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('line 1');
  });
});
