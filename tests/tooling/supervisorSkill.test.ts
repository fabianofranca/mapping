// @vitest-environment node
// Fase FM8 (etapa #1532, decisões 19 e 20): a skill `supervisionar-fila`, o `custo.py` e a seção
// `## Supervisão da fila` do `docs/FLOW.md`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

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
    '~25%',
    '~250k',
    '150k',
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
      session('Conversa qualquer', 1, 'claude-fable-5-2'),
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
