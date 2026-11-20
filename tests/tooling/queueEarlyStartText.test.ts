// @vitest-environment node
// Phase EA2 (stage #2373): the queue skill ("Stage ficha", "3. Per stage", "Parallel", "Panel") and `docs/FLOW.md` ("For the owner,
// in the three chats", "For the tester") carry the terms that `painel.py` prints for the early start. The terms come from a real
// run of the script (`show`, the `meta` notes and the graph), never from a regex over its source.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-20T20:00:00Z';
const SKILL = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const FLOW = readFileSync('docs/FLOW.md', 'utf8');
const TIMEOUT = 30_000;

type Row = Record<string, unknown>;

/** The text of a `## <title>` section (up to the next `## `). */
function section(doc: string, title: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l === `## ${title}`);
  if (start < 0) throw new Error(`no section "${title}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** The text of a `### <title>` subsection (up to the next `## ` or `### `). */
function subsection(doc: string, title: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l === `### ${title}`);
  if (start < 0) throw new Error(`no subsection "${title}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## ') || l.startsWith('### '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

let dir = '';
const run = (...args: string[]): string =>
  execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
const raw = (...args: string[]) =>
  spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
const read = (name: string): Row[] =>
  JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Row[];
const lineOf = (text: string, prefix: string): string =>
  text.split('\n').find((l) => l.startsWith(prefix)) ?? '';

function ficha(toca: string, formato: string | null): string {
  const fields = ['dep=nenhuma', 'nivel=impact: low', 'mcp=não', 'schema=não'];
  if (formato !== null) fields.push(`formato=${formato}`);
  fields.push(`toca=${toca}`, 'fases=X1:#1:high,X2:#2:medium');
  return fields.join(' | ');
}

const stage = (issue: string, toca: string, formato: string | null, ...extra: string[]) =>
  run(
    'row',
    dir,
    issue,
    `title=Stage ${issue}`,
    `plan=${ficha(toca, formato)}`,
    ...extra,
  );

// What `painel.py` prints in the three moments of an early stage: it starts, it waits for its holder, its holder is merged.
const seen = {
  vagas: '',
  agora: '',
  andamento: '',
  esperando: '',
  nenhumaSincroniza: '',
  semFormato: '',
  step: '',
  sincroniza: '',
  estado: '',
  seta: '',
  graphCedo: '',
};

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'early-text-'));
  run('init', dir);
  run('start', dir, '--paralelo', '4');
  stage(
    '#1',
    'src/a.ts',
    'não',
    'status=em andamento',
    `started=${NOW}`,
    'stage=Testador',
  );
  stage('#2', 'src/a.ts', 'não');
  stage('#4', 'src/b.ts', null);
  seen.vagas = String(read('meta')[0]?.vagas);
  const first = run('show', dir);
  seen.agora = lineOf(first, 'começar agora:');
  seen.semFormato = lineOf(first, 'fichas a refazer:');
  run('row', dir, '#2', 'status=em andamento', `started=${NOW}`, 'stage=Fases');
  seen.andamento = lineOf(run('show', dir), '  #2 ');
  run('row', dir, '#2', 'status=esperando entrega', 'child=');
  const waiting = run('show', dir);
  seen.esperando = lineOf(waiting, 'esperando merge para testar:');
  seen.nenhumaSincroniza = lineOf(waiting, 'pode sincronizar:');
  seen.step = String(read('queue').find((r) => r.issue === '#2')?.step);
  const meta = read('meta')[0] as Row;
  const nodes = meta.grafoNos as Array<Row>;
  const node = nodes.find((n) => n.issue === '#2') as Row;
  seen.estado = String(node.estado);
  seen.graphCedo = String(node.cedo);
  seen.seta = String((meta.grafoSetas as Array<Row>).find((a) => a.para === '#2')?.tipo);
  run('row', dir, '#1', 'status=concluída', 'stage=Mesclada', `ended=${NOW}`);
  seen.sincroniza = lineOf(run('show', dir), 'pode sincronizar:');
}, TIMEOUT);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const generic = (text: string): string =>
  text.replaceAll('#1', '#S').replaceAll('#2', '#E');

describe('early start text (EA2, #2373): the terms come from the real output of painel.py', () => {
  it('the script prints what the fixture needs (the terms below are not vacuous)', () => {
    expect(seen.vagas).toContain('#2 começa cedo (espera #1 para testar)');
    expect(seen.agora).toContain('começar agora: #2 (cedo: #1)');
    expect(seen.andamento).toMatch(/ · cedo: #1$/);
    expect(seen.esperando).toBe('esperando merge para testar: #2 (espera #1)');
    expect(seen.nenhumaSincroniza).toBe('pode sincronizar: nenhuma');
    expect(seen.sincroniza).toBe('pode sincronizar: #2 (#1 mesclada)');
    expect(seen.step).toBe('espera merge de #1 para testar');
    expect(seen.estado).toBe('entrega');
    expect(seen.seta).toBe('entrega');
    expect(seen.graphCedo).toBe('#1');
    expect(seen.semFormato).toContain('#4');
  });

  it('"Parallel" names the reason, the `começar agora:` item, `cedo`, the second level, the format pair and the exclusions', () => {
    const parallel = section(SKILL, 'Parallel');
    expect(parallel).toContain(
      generic(seen.vagas.match(/#2 (começa cedo \([^)]*\))/)![1]!),
    );
    expect(parallel).toContain(generic(seen.agora.match(/#2 \(cedo: [^)]*\)/)![0]));
    for (const term of [
      'esperando entrega',
      'cedo',
      'eligible holder',
      '`Testador`, `Correção` or `Fechamento`',
      'exclusive=sim',
      'via-rapida',
      'Second level',
      '`formato=`',
      'never starts early',
      'testador=nenhum',
      'schema rule',
    ]) {
      expect(parallel).toContain(term);
    }
  });

  it('"Parallel": the slot paragraph and the sync sentence cover `esperando entrega`', () => {
    const parallel = section(SKILL, 'Parallel');
    expect(parallel).toMatch(
      /A stage `esperando entrega`[^.]*takes no slot[^.]*counts as started and not merged/,
    );
    expect(parallel).toContain('the sync session `SM<k>`');
    expect(parallel).toContain('step 2b of "Per stage"');
  });

  it('"3. Per stage" has the early step: the last phase, `pode sincronizar:`, the sync session and the tester after it', () => {
    const per = section(SKILL, '3. Per stage');
    const early = per.slice(per.indexOf('2b. **Early stage: main before the tester**'));
    expect(early.length).toBeGreaterThan(0);
    for (const term of [
      `row '#n' status="esperando entrega" child=`,
      'pode sincronizar:',
      '`#S mesclada`',
      'SM<k>',
      'Sonnet',
      '`medium`',
      'no `/code-review` item',
      '`source_revision` `epic/<name>`',
      'SM<k> — main com #S (#n)',
      'docs/FLOW.md` › "For the tester" › "Main before the tester (early start)"',
      `row '#n' status="em andamento" child=<id> childAt=now`,
      "phase '#n' SM<k>=open",
      'kind=sincronização label=SM<k>',
      `row '#n' status="em andamento" cedo=`,
      "phase '#n' SM<k>=ok",
      `row '#n' cedo=`,
      'Sincronização SM<k> pronta: <PR>; conflitos: <k> (<files>|nenhum)',
      'Step 3 starts the tester only with `cedo` empty',
    ]) {
      expect(early).toContain(term);
    }
    expect(early.indexOf('2b.')).toBeLessThan(per.indexOf('3. **Tester.**'));
    expect(per.indexOf('2. **Phases**')).toBeLessThan(per.indexOf('2b.'));
    expect(per).toContain(`${seen.sincroniza.split(':')[0]}:`);
  });

  it('"3. Per stage" and "Fallback checks" put `pode sincronizar:` in the merge cycle and in the hourly check', () => {
    const per = section(SKILL, '3. Per stage');
    expect(per).toMatch(
      /do step 2b for each row of `pode sincronizar:` \(the holder that just merged/,
    );
    expect(per).toContain(
      '`pode sincronizar:` in the `show` is also an action of every check',
    );
  });

  it('"Panel" lists `esperando entrega`, `cedo=`, the `show` lines, the sync kind, the graph state and the arrow', () => {
    const panel = section(SKILL, 'Panel');
    for (const term of [
      '`esperando entrega`',
      "`cedo=` clears the early start's holders",
      '`esperando merge para testar:`',
      '`pode sincronizar:`',
      '`começa cedo (espera #S para testar)`',
      '`#E (cedo: #S)`',
      ' · cedo: #S',
      'sincronização',
      'the state `entrega`',
      'the arrow kind `entrega`',
      'cedo · espera #S para testar',
    ]) {
      expect(panel).toContain(term);
    }
    expect(panel).toContain(seen.esperando.split(' #')[0]!);
    expect(panel).toContain('#S mesclada');
  });

  it('"Stage ficha" asks for `formato=` after `schema=` and the fast-track variant writes `formato=não`', () => {
    const ficha = SKILL.slice(
      SKILL.indexOf('### Stage ficha'),
      SKILL.indexOf('## 1. Start'),
    );
    expect(ficha).toMatch(/schema=<[^>]*> \| formato=<[^>]*> \| epico=/);
    for (const family of [
      'spec',
      'component',
      'proposal',
      'comment',
      'signature',
      'icons',
    ]) {
      expect(ficha).toContain(`\`${family}\``);
    }
    expect(ficha).toContain('"não" when the issue says no format changes');
    expect(ficha).toContain('"?" when it does not say');
    expect(ficha).toContain('`schema=não`, `formato=não`, `epico=?`');
  });

  it('the `formato=` the ficha asks for is what `painel.py` reads: a written value (even `?`) is not redone, an absent one is', () => {
    expect(seen.semFormato).toContain('#4');
    expect(seen.semFormato).not.toContain('#2');
    stage('#5', 'src/c.ts', '?');
    stage('#6', 'src/d.ts', 'spec,component');
    const out = lineOf(run('show', dir), 'fichas a refazer:');
    expect(out).toContain('#4');
    expect(out).not.toContain('#5');
    expect(out).not.toContain('#6');
  });

  it('the commands the skill gives for the sync session are accepted by painel.py, and `sinal` refuses the kind', () => {
    const ok = raw('session', dir, '#2', 'sess_sync1', 'kind=sincronização', 'label=SM1');
    expect(ok.status).toBe(0);
    const phase = raw('phase', dir, '#2', 'SM1=open');
    expect(phase.status).toBe(0);
    expect(raw('phase', dir, '#2', 'SM1=ok').status).toBe(0);
    // `esperando entrega` needs `cedo`: the skill first moves the row to `em andamento`, and clears `cedo` after the sync notice.
    expect(
      raw('row', dir, '#2', 'status=em andamento', 'child=sess_sync1', `childAt=${NOW}`)
        .status,
    ).toBe(0);
    expect(raw('row', dir, '#2', 'cedo=').status).toBe(0);
    const sinal = raw('sinal', dir, 'sess_sync1', 'ci=1');
    expect(sinal.status).toBe(2);
    expect(raw('row', dir, '#2', 'cedo=#7').status).toBe(2);
  });

  it('`docs/FLOW.md` "For the owner" says a stage held only by stages in their tester starts early and waits as `esperando entrega`', () => {
    const owner = section(FLOW, 'For the owner, in the three chats');
    expect(owner).toContain(
      'Only the stage `em andamento` takes a `paralelo` slot: one that waits for the owner or for another stage frees the slot. A stage held only by stages already in their tester',
    );
    for (const term of [
      'starts early',
      '`esperando entrega` (no slot)',
      'brings `main` in',
      'before its own tester',
      '`cedo` tag',
      '`esperando merge para testar:`',
      '`pode sincronizar:`',
    ]) {
      expect(owner).toContain(term);
    }
  });

  it('`docs/FLOW.md` "For the tester" has the sync message with its fixed lines, ending with the coordinator', () => {
    const tester = section(FLOW, 'For the tester');
    const sub = subsection(FLOW, 'Main before the tester (early start)');
    expect(tester).toContain('### Main before the tester (early start)');
    const block = sub.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';
    expect(block.length).toBeGreaterThan(0);
    for (const line of [
      'Você é o agente da sincronização SM<k> — main com #S da etapa #<etapa>',
      'Branch `sync/<name>-sm<k>`',
      'Already up to date',
      'git merge origin/main',
      'never rebase',
      'keeping both deliveries',
      'product decision',
      'item 8 of "For the phase session"',
      'npm run lint && npm run typecheck && npm test && npm run build',
      'title "SM<k> — main com #S"',
      'body starting with "Parte de #<etapa>"',
      'the conflicting files and how each was resolved',
      'items 3 (context), 5 to 7 and 9 of "For the phase session"',
      'Notice: `Sincronização SM<k> pronta: <PR>; conflitos: <k> (<files>|nenhum)`',
    ]) {
      expect(block).toContain(line);
    }
    expect(block.trimEnd().split('\n').pop()).toBe(
      'Coordenador: `<id da sessão do orquestrador>`',
    );
    expect(sub).toContain('`SM<k> — main com #S (#<stage>)`');
    expect(sub).toContain('step 2b of "Per stage"');
    expect(sub).toContain("`phase '#<stage>' SM<k>=ok`");
  });
});
