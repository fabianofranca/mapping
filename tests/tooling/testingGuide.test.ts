// @vitest-environment node
// Phase 8.6: the tester guide (`docs/TESTING.md`) speaks to whoever tests by hand; what only
// the tester agent needs lives in appendix A, and the live tester prompt is `docs/TESTING-NUVEM.md`.
// These tests read the documents and fail if the old pattern comes back (findings G1 to G16 of
// the technical review of 2026-10-12, section 6).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../mcp/args';
import { enUS } from '../../src/i18n/en-US';
import { ptBR } from '../../src/i18n/pt-BR';
import { GUIDE_MESSAGES } from '../../scripts/guide/messages';

const read = (path: string): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : '';

/** Replaces the content of fenced code blocks with empty lines (keeps the numbering). */
function stripFences(md: string): string {
  let inFence = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

/** Splits appendix A (from the "## Appendix A" heading to the next "## " heading) from the rest. */
function splitAppendixA(md: string): { body: string; appendixA: string } {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^## Appendix A\b/.test(l));
  if (start < 0) return { body: md, appendixA: '' };
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return {
    body: [...lines.slice(0, start), ...lines.slice(end)].join('\n'),
    appendixA: lines.slice(start, end).join('\n'),
  };
}

/** The old agent's name, assembled in parts so the test itself does not cite it. */
const OLD_AGENT = new RegExp(`\\b${'Cow'}${'ork'}\\b`);

/** Patterns that only fit in appendix A: tester-agent labels and DOM/automation terms. */
const AGENT_ONLY: readonly RegExp[] = [
  /\bAgent\b/,
  /tester agent/i,
  OLD_AGENT,
  /aria-label/,
  /`title`/,
  /keydown/,
  /localStorage/,
  /<select\b/,
  /<input\b/,
  /querySelector/,
  /DataTransfer/,
  /headless/i,
  /Set-Clipboard/,
];

/** Lines (outside code blocks) with something that only the tester agent uses. */
function agentLeaks(text: string): string[] {
  return stripFences(text)
    .split('\n')
    .filter((line) => AGENT_ONLY.some((re) => re.test(line)));
}

/** List items (outside code blocks) longer than `max` characters. */
function longBullets(md: string, max = 600): string[] {
  return stripFences(md)
    .split('\n')
    .filter((line) => /^\s*(?:[-*]|\d+\.)\s/.test(line) && line.trim().length > max);
}

/** Step codes whose table row (cells without the code) goes over `max` characters (the limit went from 1,200 to 1,300 with the "or `tool`" notes in the [person] steps, and to 1,700 with the dark theme in R23.12). With compact tables (`proseWrap: "never"` in `.prettierrc.json`) the measure is content only; before, it also counted the alignment spaces. */
function longSteps(md: string, max = 1700): string[] {
  const out: string[] = [];
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?((?:R\d+\.\d+|A\d+)[a-z]?)(?:\*\*)?[^|]*\|(.*)$/.exec(line);
    if (!m) continue;
    const size = m[2]!
      .split('|')
      .map((c) => c.trim())
      .join('').length;
    if (size > max) out.push(`${m[1]!} (${size})`);
  }
  return out;
}

/** Action (first cell after the code) of each step of the table, by code. */
function stepActions(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?((?:R\d+\.\d+|A\d+)[a-z]?)(?:\*\*)?\s*\|([^|]*)\|/.exec(
      line,
    );
    if (m && !out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/**
 * Steps whose Action asks Claude Code for something without the [person] mark in the same
 * sentence (M4 of the second reading): the mark of another action of the step, such as the
 * Open folder of R5.2, does not count.
 */
function claudeCodeWithoutPerson(md: string): string[] {
  return [...stepActions(md)]
    .filter(([, action]) => {
      const ask = action.split(/(?<=\.["”]?)\s+/).find((s) => s.includes('Claude Code'));
      return ask !== undefined && !ask.includes('[person]');
    })
    .map(([code]) => code);
}

/**
 * Steps of the main scripts (codes R<n>.<m>; RP and the on-demand scripts do not count) whose
 * table row says "without a substitute" (the mark of a step the agent does not do alone).
 */
function stepsWithoutSubstitute(md: string, allowed: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?\s*\|/.exec(line);
    if (m && /without a substitute/i.test(line) && !allowed.includes(m[1]!))
      out.push(m[1]!);
  }
  return out;
}

/**
 * Exceptions accepted by the owner: steps of the main scripts that stay without a substitute for
 * the agent. Empty: R0.5 and R6.2 left the main scripts (RF and RA, on demand).
 * To add one, write here why and take the decision to the owner (docs/PROCESS.md, Workflow).
 */
const NO_SUBSTITUTE_EXCEPTIONS: readonly string[] = [];

/** Text of a "## <prefix>…" section up to the next "## ". */
function section(md: string, prefix: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${prefix}`));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
}

/** First ```json block of an excerpt, without the fences. */
function firstJsonBlock(md: string): string {
  const m = /```json\n([\s\S]*?)\n\s*```/.exec(md);
  return m ? m[1]! : '';
}

describe('guide rules: the functions catch the old pattern and let the right prose through', () => {
  it('catches "Agent:" and DOM terms outside appendix A', () => {
    const old = [
      "- **Tooltips:** Agent: check the element's `title` attribute (or the `aria-label`).",
      '- **Agent: wait for the field to appear before typing.** Fire the same `keydown` by script.',
      '| R1.20 | … Agent without `Ctrl+=`: see the conventions. | … |',
      'Tester agent: the initial prompt of your session is in …',
    ].join('\n');
    expect(agentLeaks(splitAppendixA(old).body)).toHaveLength(4);
  });

  it('lets "Claude Code:", the prompt pointer and the screenshot HTML in a code block through', () => {
    const fine = [
      'Whoever tests through an agent with computer control starts with `docs/TESTING-NUVEM.md` and appendix A.',
      '| R5.7 | Ask Claude Code: "Re-export…" | **Claude Code:** says nothing changed. |',
      '- An agent proposal shows up in **Proposals**; "New note for the agent".',
      '```html',
      '<p>Name<br /><input style="width: 340px" /></p>',
      '```',
      '## Appendix A — For the tester agent',
      '- Check the tooltip through the `title` attribute (or the `aria-label`); synthetic `keydown` for the zoom.',
      '## Appendix B — Disk operations by system',
    ].join('\n');
    const { body, appendixA } = splitAppendixA(fine);
    expect(agentLeaks(body)).toEqual([]);
    expect(agentLeaks(appendixA).length).toBeGreaterThan(0);
  });

  it('catches "Ask Claude Code" without [person] and lets the marked one through', () => {
    const md = [
      '| R5.1 | **[person]** In Claude Code, ask for the list. | ok |',
      '| R5.2 | Ask Claude Code: "Create". Open the folder (**[person]**). | ok |',
      '| R3.6 | **With Claude Code** (section 6) **[person]**. Ask: the plan. | ok |',
      '| R5.3 | In the Tree, accept. | **Claude Code:** nothing. |',
      '| R5.4a | Ask Claude Code: "Read…" | ok |',
    ].join('\n');
    expect(claudeCodeWithoutPerson(md)).toEqual(['R5.2', 'R5.4a']);
  });

  it('catches "without a substitute" in a main step and lets the listed exception and the on-demand script through', () => {
    const md = [
      '| R0.5 | Download (**[person]**, without a substitute). | ok |',
      '| R6.2 | **[person]**, the whole step, without a substitute. | ok |',
      '| R1.1 | Open the folder (**[person]** or `select_folder`). | ok |',
      '| RP.1 | Install (without a substitute). | ok |',
    ].join('\n');
    expect(stepsWithoutSubstitute(md, [])).toEqual(['R0.5', 'R6.2']);
    expect(stepsWithoutSubstitute(md, ['R6.2'])).toEqual(['R0.5']);
  });

  it('catches the giant [person] bullet and the 2,200-character R5.4 step', () => {
    expect(longBullets(`- **[person]**: ${'x'.repeat(1400)}`)).toHaveLength(1);
    expect(longBullets(`- short\n1. also short`)).toEqual([]);
    expect(longSteps(`| R5.4 | ${'a'.repeat(1100)} | ${'b'.repeat(1100)} |`)).toEqual([
      'R5.4 (2200)',
    ]);
    expect(longSteps(`| R5.4a | ${'a'.repeat(500)} | ${'b'.repeat(500)} |`)).toEqual([]);
  });
});

describe('docs/TESTING.md (guide for whoever tests by hand)', () => {
  const guide = read('docs/TESTING.md');
  const { body, appendixA } = splitAppendixA(guide);

  it('nothing of the tester agent outside appendix A (G1, G4)', () => {
    expect(appendixA).not.toBe('');
    expect(agentLeaks(body)).toEqual([]);
  });

  it('no bullet above 600 characters nor step above 1,700 (G2, G7)', () => {
    expect(longBullets(guide)).toEqual([]);
    expect(longSteps(guide)).toEqual([]);
  });

  it('has Start here, Interface map, Advanced manual testing and the two appendices (G3, G8)', () => {
    const headings = guide.split('\n').filter((l) => l.startsWith('## '));
    for (const h of [
      /^## Start here/,
      /^## 5\. Interface map/,
      /^## 9\. Advanced manual testing/,
      /^## Appendix A\b/,
      /^## Appendix B\b/,
    ]) {
      expect(
        headings.some((l) => h.test(l)),
        String(h),
      ).toBe(true);
    }
    expect(guide.indexOf('## Start here')).toBeLessThan(guide.indexOf('## 1. '));
  });

  it('the text follows the execution order: R5 after R7 and before R8 (G8)', () => {
    const at = (code: string): number => guide.indexOf(`### ${code} `);
    expect(at('R7')).toBeGreaterThan(at('R6'));
    expect(at('R5')).toBeGreaterThan(at('R7'));
    expect(at('R8')).toBeGreaterThan(at('R5'));
  });

  it('MCP: sha256, Check the folder now and no pinned Release (G10)', () => {
    expect(guide).toContain('sha256');
    expect(guide).toContain('**Check the folder now**');
    expect(guide).not.toMatch(/mcp-v0\.\d/);
  });

  it('no step of the main scripts is left without a substitute, outside the exceptions (R0 to R10)', () => {
    expect(stepsWithoutSubstitute(guide, NO_SUBSTITUTE_EXCEPTIONS)).toEqual([]);
  });

  it('RP is in the on-demand scripts, with an entry criterion, and R0.5 and R6.2 moved to RF and RA', () => {
    const onDemand = guide.indexOf('### On-demand scripts (manual)');
    expect(onDemand).toBeGreaterThan(guide.indexOf('### R9 '));
    expect(guide.indexOf('#### RP — Installed app (PWA)')).toBeGreaterThan(onDemand);
    expect(guide).toContain('Entry criterion');
    const actions = stepActions(guide);
    expect(actions.has('R0.5')).toBe(false);
    expect(actions.has('R6.2')).toBe(false);
    expect(guide.indexOf('#### RF — ')).toBeGreaterThan(onDemand);
    expect(guide.indexOf('#### RA — ')).toBeGreaterThan(onDemand);
    expect(guide.indexOf('#### RB — ')).toBeGreaterThan(onDemand);
    expect(guide.indexOf('#### RT — Folder on an Android tablet')).toBeGreaterThan(
      guide.indexOf('#### RB — '),
    );
  });

  it('RT (folder on an Android tablet) is manual, has steps RT.1 to RT.5 and is in Start here', () => {
    const rt = guide.slice(guide.indexOf('#### RT — '), guide.indexOf('## 9. '));
    for (const step of ['RT.1', 'RT.2', 'RT.3', 'RT.4', 'RT.5']) {
      expect(rt).toContain(`| ${step} |`);
    }
    expect(rt).toContain('does not run in the cloud');
    expect(rt).toContain('folder:');
    expect(guide).toMatch(/\| on demand \| RT — Folder on an Android tablet/);
    expect(guide).toContain('today RP, RF, RA, RB and RT');
  });

  it('every step that asks Claude Code for something has [person] in the Action (M4)', () => {
    expect(stepActions(guide).get('R3.6')).toContain('[person]');
    expect(claudeCodeWithoutPerson(guide)).toEqual([]);
  });

  it('section 6: the .mcp.json has the design/mapeamentos and assets roots, in the server format (M3)', () => {
    const six = section(guide, '6. ');
    expect(six).toContain('assets/');
    const config = JSON.parse(firstJsonBlock(six)) as {
      mcpServers: { mapping: { command: string; args: string[] } };
    };
    const [script, ...args] = config.mcpServers.mapping.args;
    expect(script).toBe('tools/mapping-mcp.js');
    expect(parseArgs(args).roots).toEqual(['design/mapeamentos', 'assets']);
  });

  it('R5: the screenshots go to assets/ and create_project names the root (M3)', () => {
    const r5 = guide.slice(guide.indexOf('### R5 '), guide.indexOf('### R8 '));
    expect(r5).toMatch(/`login\.png`[^\n]*`assets\/`/);
    expect(stepActions(guide).get('R5.2')).toMatch(
      /create_project[^"]*design\/mapeamentos|design\/mapeamentos[^"]*create_project/,
    );
  });

  it('templates with Summary, Notes and the severity scale (G15)', () => {
    for (const s of [
      '## Summary',
      '## Notes (no severity)',
      'Working folder',
      'DPR',
      "Browser's prior state",
      'Time per script',
      'Does it prevent use with people?',
      '## Sessions',
    ]) {
      expect(guide, s).toContain(s);
    }
    for (const level of ['blocks', 'high', 'medium', 'low']) {
      expect(guide, level).toMatch(new RegExp(`^- \\*\\*${level}\\*\\*`, 'm'));
    }
  });
});

describe('docs/TESTING-NUVEM.md (modes, scripts and report flow)', () => {
  const prompt = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');

  it('directed mode with the three targets, the message with a sub-issue and the default visual pass (G12, G13)', () => {
    expect(prompt).toMatch(/findings of a previous report/);
    expect(prompt).toMatch(/list of scripts or steps/);
    expect(prompt).toMatch(/phases of a stage/);
    expect(prompt).toContain('Relato na sub-issue #');
    expect(`${prompt}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`).toContain(
      'Exit the review?',
    );
    expect(prompt).not.toMatch(/mcp-v0\.\d/);
  });

  it('is non-interactive, uses the stdio client and marks what only the owner does', () => {
    expect(existsSync('scripts/testing/mcp-stdio-client.mjs')).toBe(true);
    for (const text of [prompt, guide]) {
      expect(text).toContain('scripts/testing/mcp-stdio-client.mjs');
    }
    expect(prompt).toContain('not executed (needs the owner)');
    expect(`${prompt}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`).toContain(
      'pending decision',
    );
    expect(read('docs/PROCESS.md')).toContain('pending a decision');
  });

  it('the report is a comment on the sub-issue, in parts above 65 thousand characters, with no branch nor PR', () => {
    expect(prompt).toContain('add_issue_comment');
    expect(prompt).toContain('comment on the sub-issue');
    expect(prompt).toContain('65 thousand');
    expect(prompt).toContain('Part i of n');
    expect(prompt).toContain('send_message');
    expect(prompt).toContain('do not edit anything in the repository');
    expect(prompt).not.toContain('docs/history');
    expect(prompt).not.toContain('teste/<alvo>');
    expect(prompt).not.toContain('test/<target>');
  });

  it('the guide does not cite the old prompt, the dialog-pilot nor reports in docs/history', () => {
    for (const text of [prompt, guide]) {
      expect(text).not.toMatch(/dialog-pilot/);
      expect(text).not.toContain('docs/history');
      expect(text).not.toMatch(/relato-20\d\d/);
      expect(text).not.toMatch(/report-20\d\d/);
      expect(text).not.toMatch(/browser extension/);
    }
    expect(existsSync(`docs/TESTING-${'COW'}${'ORK'}.md`)).toBe(false);
  });

  it('no live test doc, README or CLAUDE.md talks about the old agent', () => {
    for (const path of [
      'docs/TESTING.md',
      'docs/TESTING-NUVEM.md',
      'README.md',
      'CLAUDE.md',
    ]) {
      expect(read(path), path).not.toMatch(OLD_AGENT);
    }
  });

  it('README.md and CLAUDE.md point to the guide and to the cloud prompt (G16)', () => {
    for (const path of ['README.md', 'CLAUDE.md']) {
      const text = read(path);
      expect(text, path).toContain('docs/TESTING.md');
      expect(text, path).toContain('docs/TESTING-NUVEM.md');
    }
  });
  // Remote images stage (RI4): R15 runs on its own, with a local server that the shell starts.
  describe('R15 — Remote images', () => {
    const guide = read('docs/TESTING.md');
    const r15 = guide.slice(guide.indexOf('### R15 '), guide.indexOf('### R16 '));

    it('is in the "Start here" table, among the main scripts, after R14', () => {
      expect(guide).toMatch(/^\| 17 +\| R15 — Remote images/m);
      expect(guide.indexOf('### R15 ')).toBeGreaterThan(guide.indexOf('### R14 '));
      expect(guide.indexOf('### R15 ')).toBeLessThan(guide.indexOf('### R16 '));
      expect(guide).toMatch(/^- R15 uses the folder of its own `remotas`/m);
    });

    it('has steps R15.1 to R15.12, in order, and none depends on the owner', () => {
      const codes = [...stepActions(r15).keys()];
      expect(codes).toEqual(Array.from({ length: 12 }, (_, i) => `R15.${i + 1}`));
      expect(/without a substitute/i.test(r15)).toBe(false);
    });

    it('the local network and the no-CORS case use a Node server on the Chrome computer, without a CORS header', () => {
      expect(r15).toContain('scripts/image-server.mjs');
      expect(r15).toContain('iniciar-servidor.cmd');
      expect(r15).toContain('**on the same computer as Chrome**');
      expect(r15).toMatch(/GET \/foto\.png origin=none/);
      expect(r15).toContain('http://127.0.0.1:8765/parar');
      expect(r15).toContain('servidor.log');
      expect(r15).toContain('does not send `Access-Control-Allow-Origin`');
      expect(r15).toContain(`**${enUS['privacy.noCors']}**`);
      expect(r15).toContain(`**${enUS['privacy.localNetwork']}**`);
    });

    it('http: goes through the same local server, with the http and local-network switches', () => {
      expect(r15).toContain('http://127.0.0.1:8765/foto.png');
      expect(r15).toContain(`**${enUS['privacy.http']}**`);
      expect(r15).toContain(`**${enUS['privacy.anyOrigin']}**`);
    });

    it('uses the test image from public/, served by Pages, and it exists', () => {
      expect(r15).toContain('test-images/foto.png');
      const png = readFileSync('public/test-images/foto.png');
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(96);
      expect(png.readUInt32BE(20)).toBe(96);
    });

    it('the texts cited are the interface ones (en-US)', () => {
      for (const key of [
        'imageConsent.allow',
        'imageConsent.dismiss',
        'privacy.http',
        'privacy.localNetwork',
        'privacy.noCors',
        'privacy.anyOrigin',
        'diagnostics.imageReason.invalid',
        'diagnostics.imageReason.blocked-consent',
        'diagnostics.imageReason.failed',
      ] as const) {
        expect(r15, key).toContain(enUS[key]);
      }
    });
  });
  // Material 3 library stage (MD1): R16 runs on its own, through the MCP client over stdio and Playwright.
  describe('R16 — Variants in code', () => {
    const guide = read('docs/TESTING.md');
    const r16 = guide.slice(guide.indexOf('### R16 '), guide.indexOf('### R17 '));

    it('is in the "Start here" table, after R15 and before R17', () => {
      expect(guide).toMatch(/^\| 18 +\| R16 — Variants in code/m);
      expect(guide.indexOf('### R16 ')).toBeGreaterThan(guide.indexOf('### R15 '));
      expect(guide.indexOf('### R16 ')).toBeLessThan(guide.indexOf('### R17 '));
      expect(guide).toMatch(/^- R16 uses the folder of its own `variantes`/m);
    });

    it('has steps R16.1 to R16.10, in order, and none depends on the owner', () => {
      const codes = [...stepActions(r16).keys()];
      expect(codes).toEqual(Array.from({ length: 10 }, (_, i) => `R16.${i + 1}`));
      expect(/without a substitute/i.test(r16)).toBe(false);
      expect(r16).not.toContain('[person]');
    });

    it('the script specialization is a valid v9, with variants', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r16)?.[1];
      expect(block).toBeDefined();
      const { parseSpecText } = await import('../../src/model/spec');
      const parsed = parseSpecText(block ?? '');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.spec.formatVersion).toBe(9);
    });

    it('uses the stdio client and the tools that the script checks', () => {
      for (const tool of [
        'validate_specialization',
        'propose_changes',
        'get_code_hints',
        'get_annotation',
        'get_marking',
        'find_by_code',
        'get_specialization',
      ]) {
        expect(r16, tool).toContain(tool);
      }
      expect(r16).toContain('OutlinedButton');
    });

    it('the cloud prompt lists the scripts up to R27', () => {
      expect(prompt).toContain('R0 to R27');
    });
  });

  // Material 3 library stage (MD5): R17 runs on its own, through the MCP client over stdio, the shell and Playwright.
  describe('R17 — Material 3 library (Compose)', () => {
    const guide = read('docs/TESTING.md');
    const r17 = guide.slice(guide.indexOf('### R17 '), guide.indexOf('### R18 '));

    it('is in the "Start here" table, after R16 and before the on-demand scripts', () => {
      expect(guide).toMatch(/^\| 19 +\| R17 — Material 3 library \(Compose\)/m);
      expect(guide.indexOf('### R17 ')).toBeGreaterThan(guide.indexOf('### R16 '));
      expect(guide.indexOf('### R17 ')).toBeLessThan(
        guide.indexOf('### On-demand scripts (manual)'),
      );
      expect(guide).toMatch(/^- R17 uses the folder of its own `screen-m3`/m);
      expect(guide).toContain('`material3-compose.zip` (R17)');
    });

    it('has steps R17.1 to R17.54, in order, and none depends on the owner', () => {
      const codes = [...stepActions(r17).keys()];
      expect(codes).toEqual(Array.from({ length: 54 }, (_, i) => `R17.${i + 1}`));
      expect(/without a substitute/i.test(r17)).toBe(false);
      expect(r17).not.toContain('[person]');
    });

    it('the script batch is valid JSON, with only types that the library has', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r17)?.[1];
      expect(block).toBeDefined();
      const ops = JSON.parse(block ?? '[]') as { op: string; type?: string }[];
      expect(ops.filter((o) => o.op === 'add_container')).toHaveLength(1);
      expect(ops.filter((o) => o.op === 'create_marking')).toHaveLength(7);
      expect(ops.some((o) => o.op === 'apply_specialization')).toBe(false);
      const spec = JSON.parse(
        read('libraries/material3-compose/material3-compose.spec.json'),
      ) as { layers: { annotationTypes: { id: string }[] }[] };
      const types = new Set(
        spec.layers.flatMap((l) =>
          l.annotationTypes.map((t) => `material3-compose/${t.id}`),
        ),
      );
      const used = ops
        .filter((o) => o.op === 'create_annotation')
        .map((o) => o.type ?? '');
      expect(used).toHaveLength(7);
      for (const type of used) expect(types.has(type), type).toBe(true);
    });

    it('uses the stdio client and the tools that the script checks', () => {
      for (const tool of [
        'validate_library',
        'create_project',
        'propose_changes',
        'list_markings',
        'get_code_hints',
        'get_annotation',
        'find_by_code',
      ]) {
        expect(r17, tool).toContain(tool);
      }
      for (const composable of ['Scaffold', 'TopAppBar', 'LazyColumn', 'ListItem']) {
        expect(r17, composable).toContain(composable);
      }
      expect(r17).toContain('OutlinedButton');
      expect(r17).toContain('FloatingActionButton');
      expect(r17).toContain('Apply zip…');
    });

    it('the cloud prompt lists the scripts up to R27', () => {
      expect(prompt).toContain('R0 to R27');
    });
  });

  // CL2 (stage #899): the retest found two script text errors, not app ones.
  describe('CL2 — text fixes from the retest of stage #899', () => {
    const guide = read('docs/TESTING.md');
    const row = (code: string): string => {
      const line = guide.split('\n').find((l) => l.startsWith(`| ${code} |`));
      expect(line, code).toBeDefined();
      return line ?? '';
    };

    it('R17.30: the background point falls inside the corner arc, not at (5, 5)', () => {
      const line = row('R17.30');
      // (5, 5) is outside the 12·s radius of the `surface` and gives the container white (FFFFFF).
      expect(line).not.toMatch(/px su-app\.png 5 5/);
      expect(line).not.toMatch(/\(5, 5\) `D0BCFF`/);
      expect(line).toMatch(/px su-app\.png 30 30/);
      expect(line).toContain('(30, 30)');
    });

    it('R25.26: the `unid` of the two `i` (with and without `family`) uses AREA=20', () => {
      const line = row('R25.26');
      // each thin `i` is a small blot: with the default AREA (300) the `unid` comes back empty.
      const aside = (color: string): string =>
        new RegExp("'" + color + "'[`]?\\s*\\(([^)]*)\\)").exec(line)?.[1] ?? '';
      expect(aside('#00E5FF')).toContain('AREA=20');
      expect(aside('#FF4081')).toContain('AREA=20');
      // the `W` is a large blot: it stays at the default AREA.
      expect(aside('#76FF03')).not.toContain('AREA');
      expect(aside('#FFAB40')).not.toContain('AREA');
    });
  });

  // Specialization warnings stage (AV4): R18 runs on its own, through the MCP client over stdio, the shell and the app.
  describe('R18 — Specialization warnings', () => {
    const guide = read('docs/TESTING.md');
    const r18 = guide.slice(guide.indexOf('### R18 '), guide.indexOf('### R19 '));

    it('is in the "Start here" table, after R17 and before the on-demand scripts', () => {
      expect(guide).toMatch(/^\| 20 +\| R18 — Specialization warnings/m);
      expect(guide.indexOf('### R18 ')).toBeGreaterThan(guide.indexOf('### R17 '));
      expect(guide.indexOf('### R18 ')).toBeLessThan(
        guide.indexOf('### On-demand scripts (manual)'),
      );
      expect(guide).toMatch(/^- R18 uses the folder of its own `avisos`/m);
    });

    it('has steps R18.1 to R18.14, in order, and none depends on the owner', () => {
      const codes = [...stepActions(r18).keys()];
      expect(codes).toEqual(Array.from({ length: 14 }, (_, i) => `R18.${i + 1}`));
      expect(/without a substitute/i.test(r18)).toBe(false);
      expect(r18).not.toContain('[person]');
    });

    it('the script specialization is a valid v10 with the four kinds', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r18)?.[1];
      expect(block).toBeDefined();
      const { parseSpecText } = await import('../../src/model');
      const result = parseSpecText(block ?? '');
      expect(result.ok).toBe(true);
      const kinds = new Set(
        [...(block ?? '').matchAll(/"kind": "(\w+)"/g)].map((m) => m[1]),
      );
      expect(kinds).toEqual(new Set(['removed', 'deprecated', 'diverges', 'pending']));
    });

    it('the script JSON is the same as the avisos-demo e2e fixture', () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r18)?.[1] ?? '';
      const fixture = read('tests/e2e/fixtures/avisos-demo.spec.json');
      expect(JSON.parse(block)).toEqual(JSON.parse(fixture));
    });

    it('the cloud prompt lists the scripts up to R27', () => {
      expect(prompt).toContain('R0 to R27');
    });

    it('the full-round order enumeration ends at R27, like the heading', () => {
      expect(prompt).toContain('R5, R8 and R9 to R27.');
      expect(prompt).not.toContain('R9 to R26');
    });
  });
});

// Cloud tests stage (TN1): the cloud tester prompt and the appendix A recipes.
describe('docs/TESTING-NUVEM.md (cloud tester prompt)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const { appendixA } = splitAppendixA(read('docs/TESTING.md'));
  const cloudRecipes = appendixA.slice(
    appendixA.indexOf('**Native dialogs in the cloud'),
  );

  it('exists and has the start message with branch and commit, in the directed and full modes', () => {
    expect(cloud).not.toBe('');
    expect(cloud).toMatch(
      /Read `docs\/TESTING-NUVEM\.md` and run in `modo dirigido`: R0 and R2\. Branch `[^`]+`, commit `[^`]+`/,
    );
    expect(cloud).toMatch(/`modo completo`\. Branch `[^`]+`, commit `[^`]+`/);
    expect(cloud).toContain('always non-interactive');
    expect(cloud).toMatch(
      /\(\*\*RP\*\*, \*\*RF\*\*, \*\*RA\*\*[^\n]*never run in the cloud/,
    );
  });

  it('tells the tester to notify the report coordinator, without a PR', () => {
    expect(cloud).toContain('Coordenador: session_');
    expect(cloud).toContain('Notify the coordinator');
    expect(cloud).not.toContain('the coordinator merges');
  });

  it('has the "Never": Enter, filechooser, one tab and the preview', () => {
    const never = cloud.slice(cloud.indexOf('## Never'));
    expect(never).toContain('**Enter**');
    expect(never).toContain('`filechooser`');
    expect(never).toContain('setInputFiles');
    expect(never).toMatch(/More than one app tab/);
    expect(never).toMatch(/\*\*preview\*\*/);
    expect(never).toContain('pkill -f chrome');
  });

  it('tells to build the app and the MCP from the commit and serve at localhost:8080', () => {
    expect(cloud).toContain('npm ci && npm run build');
    expect(cloud).toContain('http://localhost:8080');
    expect(cloud).toContain('npm run build:mcp');
    expect(cloud).toContain('--version');
    expect(cloud).toContain('git log -1');
    expect(cloud).toContain('~/mapping-testes/<YYYY-MM-DD>-<target>/');
  });

  it('cites the "Mapping - testes" environment, the setup script and the report as a comment', () => {
    expect(cloud).toContain('Mapping - testes');
    expect(cloud).toContain(
      'for i in 1 2 3 4 5; do apt-get update -q && apt-get install -y -q xdotool at-spi2-core python3-pyatspi openbox imagemagick && break; sleep $((i * 15)); done; true',
    );
    expect(cloud).toMatch(/code `14`/);
    expect(cloud).toContain('LANGUAGE=pt_BR:pt');
    expect(cloud).toContain(
      'Claude Code in the cloud (Xvfb, Playwright over CDP, xdotool, AT-SPI)',
    );
  });

  it('appendix A has the cloud recipes and the table of the five script actions', () => {
    expect(appendixA).toContain('**Native dialogs in the cloud (Xvfb).**');
    expect(appendixA).toContain('docs/TESTING-NUVEM.md');
    for (const tool of [
      'select_folder',
      'open_file',
      'save_file',
      'accept_permission_prompt',
      'cancel_dialog',
    ]) {
      expect(cloudRecipes, tool).toMatch(new RegExp(`^\\| \`${tool}\``, 'm'));
    }
    expect(cloudRecipes).toContain('alt+o');
    expect(cloudRecipes).toContain('alt+s');
    expect(cloudRecipes).toContain('alt+c');
    expect(cloudRecipes).toContain('/usr/bin/python3.12');
    expect(cloudRecipes).toContain('Atspi');
  });

  it('the [person] convention of section 8 cites the cloud recipe', () => {
    expect(read('docs/TESTING.md')).toMatch(
      /^- \*\*\[person\]\*\*[^\n]*Native dialogs in the cloud \(Xvfb\)/m,
    );
  });

  it('the app opens in en-US: appendix A and the cloud prompt say so', () => {
    expect(appendixA).toMatch(/The tester opens the app in \*\*en-US\*\*/);
    expect(appendixA).toMatch(/interface texts in this guide are the en-US ones/);
    expect(cloud).toMatch(
      /The tester opens the app in en-US, and the UI names in this prompt are the en-US ones/,
    );
  });

  it('README.md, CLAUDE.md and docs/TESTING.md point to it', () => {
    for (const path of ['README.md', 'CLAUDE.md', 'docs/TESTING.md']) {
      expect(read(path), path).toContain('TESTING-NUVEM.md');
    }
    expect(read('docs/PROCESS.md')).toContain('Automated flow');
    expect(read('CLAUDE.md')).toContain('docs/FLOW.md');
  });
});

describe('docs/FLOW.md (automated flow messages)', () => {
  const flow = read('docs/FLOW.md');

  it('the file exists', () => {
    expect(existsSync('docs/FLOW.md')).toBe(true);
  });

  it('has the three owner messages and the "pode mesclar"', () => {
    expect(flow).toContain('Crie uma issue roadmap (ou bug, se for defeito):');
    expect(flow).toContain('Detalhe a issue #<roadmap ou bug> como etapa');
    expect(flow).toContain('Implemente a etapa #<etapa> no fluxo automatizado');
    expect(flow).toContain('pode mesclar');
  });

  it('the phase message points to the coordinator and the PR follow-up', () => {
    expect(flow).toContain('Coordenador: `<id da sessão do orquestrador>`');
    expect(flow).toContain('subscribe_pr_activity');
    expect(flow).toContain('send_message');
    expect(flow).toContain('Parte de #');
  });

  it('the "test first" rule is in docs/PROCESS.md and the phase message points to it', () => {
    expect(read('docs/PROCESS.md')).toContain('**test first**');
    expect(flow).toContain('`test first` rule of `docs/PROCESS.md`');
  });

  it('the tester message follows the TESTING-NUVEM format and the notification cites PushNotification', () => {
    expect(flow).toMatch(
      /Read `docs\/TESTING-NUVEM\.md` and run in modo dirigido: [^\n]+\. Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+\. Coordenador: `/,
    );
    expect(flow).toContain('PushNotification');
  });

  it('docs/PROCESS.md describes the flow and no longer has the old section', () => {
    const claude = read('docs/PROCESS.md');
    for (const term of [
      'Orquestrador',
      'PushNotification',
      'pode mesclar',
      'send_later',
    ]) {
      expect(claude, term).toContain(term);
    }
    expect(claude).not.toContain('Rodada dirigida na nuvem');
  });
});

// Faster tester stage (TR2): retest with a reduced R0, visual pass by what the stage touches
// and real time measured by `mark()` instead of estimated.
describe('TR2 — reduced R0 in the retest, visual pass and real time', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');

  it('the findings retest runs only R0.1 and the steps the findings depend on, not the whole R0', () => {
    const directed = cloud.slice(cloud.indexOf('**Directed round.**'));
    expect(directed).toMatch(/R0\.1/);
    expect(directed).toMatch(/only (the )?\*{0,2}R0\.1/i);
    expect(directed).toMatch(/do not repeat the whole R0/i);
  });

  it('the visual pass comes from the message line, "nenhuma" becomes "not requested" and the retest uses only the findings', () => {
    const section = cloud.slice(cloud.indexOf('## What to run'));
    expect(section).toMatch(/passada visual: `?<list>`?/i);
    expect(section).toContain('not requested');
    expect(section).toMatch(/[Rr]etest[\s\S]{0,200}only the windows and dialogs/);
  });

  it('the real time comes from apoio/tempos.log, through mark(), and is never estimated', () => {
    expect(cloud).toMatch(/\bmark\(/);
    expect(cloud).toContain('tempos.log');
    expect(cloud).toContain('time not measured');
    expect(cloud).toMatch(/never estimate/i);
  });

  it('the section 10 template does not ask for an estimated time and points to tempos.log', () => {
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).not.toMatch(/ex\.:\s*R0 25 min/);
    expect(templates).toContain('tempos.log');
  });

  it('section 6 marks the time (secao6) and the report copies the `cloud.mjs tempos` output (stage #482, GT3)', () => {
    const start = guide.indexOf('## 6. Install the MCP server');
    const section6 = guide.slice(start, guide.indexOf('## 7. ', start));
    expect(section6).toContain("mark(apoioDir, 'secao6', 'start')");
    expect(section6).toContain("mark(apoioDir, 'secao6', 'end')");
    expect(cloud).toMatch(/cloud\.mjs tempos/);
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).toMatch(/cloud\.mjs tempos/);
  });

  it('the two tester messages in docs/FLOW.md have the visual pass line', () => {
    const testerSection = flow.slice(flow.indexOf('## For the tester'));
    const occurrences = testerSection.split(/[Pp]assada visual/).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('the FLOW.md retest message cites the R0 reduced to R0.1', () => {
    const retest = flow.slice(
      flow.indexOf('Retest, after the fix'),
      flow.indexOf('## Full round in 5 blocks'),
    );
    expect(retest).toMatch(/R0\.1/);
    // TR3 (decision 13): the message spells out the R0, so it does not diverge from the guide.
    expect(retest).toContain('R0 only R0.1 and the steps the findings depend on');
  });

  it('docs/PROCESS.md tells the orchestrator to pass the visual pass to the tester and the last phase sub-issue to bring the line', () => {
    expect(claude).toMatch(/the scripts and the visual pass/);
    expect(claude).toContain('Passada visual:');
  });
});

// Faster tester stage (TR3): setups that do not overwrite and aligned messages.
describe('TR3 — setups that do not overwrite and aligned messages', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const flow = read('docs/FLOW.md');

  /** The fenced code blocks of section 8 (from "## 8." to "## 9."). */
  function section8Blocks(): string[] {
    const start = guide.indexOf('## 8. Test scripts');
    const end = guide.indexOf('## 9. ', start);
    const blocks: string[] = [];
    let current: string[] | null = null;
    for (const line of guide.slice(start, end).split('\n')) {
      if (/^\s*```/.test(line)) {
        if (current) blocks.push(current.join('\n'));
        current = current ? null : [];
      } else if (current) current.push(line);
    }
    return blocks;
  }

  // Creates the project folder or writes its `mapping.json`.
  const CREATES_PROJECT =
    /mkdir -p "\$PROJ"|> "\$PROJ\/mapping\.json"|v15\.py"? "\$PROJ"|unzip [^\n]*-d "\$PROJ"|cat > \w+\/mapping\.json/;

  it('every setup block that creates the project folder or writes the mapping.json has the guard, without rm (decision 12)', () => {
    const creators = section8Blocks().filter((b) => CREATES_PROJECT.test(b));
    expect(creators.length).toBeGreaterThanOrEqual(3);
    for (const block of creators) {
      expect(block).toMatch(
        /already exists: the (setup|preparation) already ran; do not run it again/,
      );
      expect(block).toMatch(/if \[ -e [^\]]+\]; then/);
      expect(block).not.toMatch(/\brm\b.*(\$PROJ|migracao13)/);
    }
  });

  it('the directed message says "Whole R0 first" and the TESTING-NUVEM one prevails when it diverges from the guide (decision 13)', () => {
    const tester = flow.slice(
      flow.indexOf('## For the tester'),
      flow.indexOf('Retest, after the fix'),
    );
    expect(tester).toContain('Whole R0 first');
    expect(cloud).toMatch(/message prevails when it diverges/i);
  });

  it('every directed, group and block message brings the release tag slot, and the prompt says what to do with "sem R21" (decision 14)', () => {
    const tester = flow.slice(
      flow.indexOf('## For the tester'),
      flow.indexOf('### Standalone round'),
    );
    const messages = tester.match(/```text\n[\s\S]*?```/g) ?? [];
    expect(messages.length).toBe(4);
    for (const m of messages) {
      expect(m).toContain('Tag da release: <mcp-v…-rc.n, or "sem R21">');
    }
    // The rule moved to `consulta.regras` (TE1); the prompt points to it and says the essentials.
    expect(cloud).toContain('cloud.mjs secao consulta.regras');
    const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');
    const r21 = consulta.slice(
      consulta.indexOf('**R21 and the release tag.**'),
      consulta.indexOf('## Block history'),
    );
    expect(r21).toContain('sem R21');
    expect(r21).toMatch(/sem R21[^\n]*(skip it|not part of)/i);
  });
});

describe('TS2 — prompt with the round guide, foreground, state() and grouped report', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const { appendixA } = splitAppendixA(guide);
  const first10 = cloud.slice(
    cloud.indexOf('## First 10 minutes'),
    cloud.indexOf('## Environment'),
  );
  const howTo = cloud.slice(
    cloud.indexOf('## How to act'),
    cloud.indexOf('## What to run'),
  );

  it('tells to generate the round guide and not to read the whole docs/TESTING.md', () => {
    expect(first10).toContain('node scripts/testing/round-guide.mjs');
    expect(first10).toContain('apoio/guia.md');
    expect(first10).toMatch(/`all`/);
    expect(first10).toMatch(/Grep/);
    expect(first10).not.toMatch(/read `docs\/TESTING\.md` whole/i);
    expect(first10).toMatch(/do not read it whole/);
    expect(cloud).not.toMatch(/read both whole/i);
  });

  it('GL2 — reads the guide base at the start and the scripts on demand, through cloud.mjs passo (#1232, decision 10)', () => {
    const item3 = first10.slice(first10.indexOf('\n3. '), first10.indexOf('\n4. '));
    expect(first10).toContain('apoio/guia-base.md');
    expect(first10).toContain('guia-indice.tsv');
    expect(first10).toContain('cloud.mjs passo');
    expect(first10).not.toMatch(/Read the `apoio\/guia\.md` whole/);
    expect(cloud.slice(0, cloud.indexOf('## Role and limits'))).toMatch(
      /base guide[^\n]*test scripts and the on-demand sections/,
    );
    expect(item3).toMatch(
      /Read `apoio\/guia-base\.md` whole\*\*, in pieces below 25 thousand tokens/,
    );
    expect(item3).toMatch(/cloud\.mjs secao <key…>` \*\*at the moment its line says\*\*/);
    expect(item3).toMatch(/cloud\.mjs passo <Rn>` before starting it/);
    expect(item3).toMatch(/batches of up to 8 \(`cloud\.mjs passo <Rn\.a>-<Rn\.b>`\)/);
    expect(item3).toMatch(/`guia\.md` is only for a pointed `Grep`/);
    expect(item3).toMatch(/`guia\.md` \(whole\), `guia-base\.md` and `guia-indice\.tsv`/);
    expect(first10).toMatch(/item 3 generates the \*\*round guide\*\* and its base/);
  });

  it('GL2 — the "How to act" lists the passo and says the expected result comes from the passo printed right then', () => {
    expect(howTo).toMatch(/`run`, `help`, `passo`, `connect`/);
    expect(howTo).toMatch(
      /expected result of a step comes from the `cloud\.mjs passo` printed right then, not from memory/,
    );
  });

  it('GL2 — items 1 of the block and group modes cite the guide base and the passo, and the report records what the passo did not give', () => {
    const withConsulta = `${cloud}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`;
    for (const heading of [
      '**Mode `modo completo, bloco k de 5`.**',
      '**Mode `modo dirigido, grupo k de n`.**',
    ]) {
      const from = withConsulta.indexOf(heading);
      const item1 = withConsulta.slice(
        withConsulta.indexOf('1. ', from),
        withConsulta.indexOf('\n2. ', from),
      );
      expect(item1).toMatch(
        /read `guia-base\.md` whole and ask for the scripts through `passo` and the on-demand sections through `secao` \(item 3\)/,
      );
    }
    const report = cloud.slice(cloud.indexOf('## Report'));
    expect(report).toMatch(/`passo` did not give what the step needed/);
    expect(report).toMatch(/how many calls to `passo` and how many to `secao`/);
  });

  it('cloud-up.sh runs in the foreground, with a 600000 ms timeout and without run_in_background', () => {
    expect(first10).toMatch(/foreground/);
    expect(first10).toContain('run_in_background');
    expect(first10).toContain('600000');
  });

  it('every step script ends with state(), and the capture is left for the canvas, the ❌ and the visual pass', () => {
    expect(howTo).toContain('formatState(await state(page, apoioDir, { projectDir }))');
    expect(howTo).toContain('connect()');
    expect(howTo).toMatch(/canvas/);
    expect(howTo).toContain('60000');
    expect(howTo).toContain('{ timeout }');
  });

  it('every step script goes through cloud.mjs run, with a heredoc example, and the list includes run and help (#1148, decision 6)', () => {
    expect(howTo).toContain('cloud.mjs run');
    expect(howTo).toContain("<<'JS'");
    expect(howTo).toMatch(/`run`, `help`, `passo`, `connect`/);
    expect(howTo).toMatch(/What got in the way/);
    expect(guide).toContain("<<'JS'");
    expect(cloud).toContain('apoio/env.sh');
    expect(`${cloud}${guide}`).not.toMatch(/apoio\/env\b(?!\.sh)/);
  });

  it('TE2 — the "How to act", the "Check and record" and the "Report" describe the server, the check, the ctx and the Reproduction (#1533, decisions 6 to 8)', () => {
    expect(howTo).toContain('one `run` per batch of up to 8 steps');
    for (const text of [
      'cloud.mjs serve',
      '`ctx`',
      '`check(label, condition, detail?)`',
      'run --novo',
      'paletteDrag(page, type, to, { capture, group })',
    ]) {
      expect(howTo, text).toContain(text);
    }
    const check = cloud.slice(
      cloud.indexOf('## Check and record'),
      cloud.indexOf('## Report'),
    );
    expect(check).toContain('**Reproduction**');
    expect(check).toContain('apoio/runs/<n>.js');
    expect(check).toContain('apoio/runs.log');
    const report = cloud.slice(cloud.indexOf('## Report'));
    expect(report).toContain('**Reproduction**');
    expect(report).toMatch(/total of `run` and of checks/);
  });

  it('the coordinator notice uses the send_message of claude-code-remote, not SendMessage', () => {
    expect(cloud).toMatch(/`send_message`[^\n]*claude-code-remote/);
    expect(cloud).toMatch(/not `SendMessage`/);
  });

  it('the report groups the ✅ and the template has the range rule', () => {
    expect(cloud.slice(cloud.indexOf('## Report'))).toMatch(
      /of the same script[^\n]*passed|range/i,
    );
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).toContain('R11.1 to R11.10');
    expect(templates).toMatch(/range/);
    expect(templates).toMatch(/same (source|originating) finding/);
    expect(templates).toMatch(/Summary[^\n]*per step/);
  });

  it('appendix A: recipe 4 describes connect() and state(); recipe 2 limits the source to the shell', () => {
    const recipe4 = appendixA.slice(
      appendixA.indexOf('**Recipe 4 (cloud), the page'),
      appendixA.indexOf('**Recipe 5 (cloud), GTK'),
    );
    expect(recipe4).toContain('apoio/env.sh');
    expect(recipe4).toMatch(/5 s/);
    expect(recipe4).toContain('state(');
    const recipe2 = appendixA.slice(
      appendixA.indexOf('**Recipe 2 (cloud)'),
      appendixA.indexOf('**Recipe 3 (cloud)'),
    );
    expect(recipe2).toMatch(/source "\$S\/env\.sh"[^\n]*(xdotool|shell)/);
    expect(recipe2).toMatch(/helpers/);
  });

  it('the prompt tells to generate the round guide with the scripts of the cut (R0 R2 R4 R11 really generates)', () => {
    const out = `${process.env.TMPDIR ?? '/tmp'}/guia-ts2-test.md`;
    execFileSync('node', [
      'scripts/testing/round-guide.mjs',
      'R0',
      'R2',
      'R4',
      'R11',
      '--out',
      out,
    ]);
    const generated = read(out);
    expect(generated).toContain('## Appendix A');
    expect(generated).toContain('Round report');
    expect(generated.length).toBeLessThan(guide.length / 2);
    expect(read(out.replace(/\.md$/, '-base.md'))).toContain('cloud.mjs passo R4');
    expect(read(out.replace(/\.md$/, '-indice.tsv')).split('\n')[0]).toBe(
      'tipo\tchave\tini\tfim\ttítulo',
    );
  });
});

describe('full round in 5 blocks (stages #424 and #841)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');
  const guide = read('docs/TESTING.md');

  it('the prompt has the "modo completo, bloco k de 5" mode, the whole R0 first and the block round guide', () => {
    expect(cloud).toContain('run the `modo completo, bloco k de 5`');
    expect(cloud).toMatch(/## Full round in blocks/);
    expect(cloud).toMatch(/whole R0/);
    expect(cloud).toMatch(/round guide with them/);
    expect(cloud).toMatch(/The `modo completo` without a block remains valid/i);
  });

  it('the block report: Modo, first line, findings k.n and coordinator notice with the block', () => {
    expect(cloud).toContain('Modo: completo, bloco k de 5 (<scripts>)');
    expect(cloud).toContain('Full round — block k of 5');
    expect(cloud).toMatch(/`k\.1`, `k\.2`/);
    expect(cloud).toMatch(/notice to the coordinator[^\n]*block/i);
    expect(cloud).toMatch(/Part i of n/);
  });

  it('the report template (section 10) accepts the block mode and the k.n numbering', () => {
    expect(guide).toContain('completo, bloco k de 5');
    expect(guide).toMatch(/k\.n/);
    expect(guide).toMatch(/TESTING-NUVEM\.md`, "Full round in blocks"/);
  });

  it('FLOW.md has the tester message per block, the standalone one and the summary template', () => {
    expect(flow).toMatch(
      /run the modo completo, bloco <k> de 5\.[^\n]*Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+\. Coordenador: `/,
    );
    expect(flow).toContain('Testador — <target>, bloco <k> de 5');
    expect(flow).toContain(
      'Run the full tester round in blocks on branch `<branch>`, commit `<hash>`. Summary and reports in issue #<N>.',
    );
    expect(flow).toMatch(/## Summary of the round in blocks/);
    for (const part of [
      'Full round in blocks — summary',
      'not executed',
      'wall time',
      'Findings by severity',
      'Reports:',
    ]) {
      expect(flow, part).toContain(part);
    }
    expect(flow).toMatch(/does not rewrite the reports/i);
  });

  it('FLOW.md: 60 min backup check, 5 notices, retest in a single session and the standalone one opens a bug per ❌', () => {
    expect(flow).toMatch(/60 min/);
    expect(flow).toMatch(/five notices/i);
    expect(flow).toMatch(/a single session/i);
    expect(flow).toMatch(/`bug` issue[^\n]*duplicate/i);
  });

  it('docs/PROCESS.md: the orchestrator creates the 5 sessions when the sub-issue asks for the full round', () => {
    expect(claude).toMatch(/full round[^\n]*5 sessions/);
    expect(claude).toContain('bloco k de 5');
    expect(claude).toMatch(/\bk\.n\b/);
  });
});

describe('.prettierrc.json (compact tables, stage #478)', () => {
  it('has an override with proseWrap "never" only for the test guide and the DS register', () => {
    const config = JSON.parse(read('.prettierrc.json')) as {
      proseWrap?: string;
      overrides?: { files: string | string[]; options: { proseWrap?: string } }[];
    };
    expect(config.proseWrap).toBeUndefined();
    expect(config.overrides).toHaveLength(1);
    const [override] = config.overrides!;
    expect([override!.files].flat().sort()).toEqual([
      'docs/DESIGN-SYSTEM.md',
      'docs/TESTING.md',
    ]);
    expect(override!.options.proseWrap).toBe('never');
  });
});

describe('GT2 — guide aligned with the app (stage #482)', () => {
  const guide = read('docs/TESTING.md');

  /** Numbered item of the "Preparing R3.8…" that starts with `prefix`. */
  const prepStep = (prefix: string): string =>
    guide.split('\n').find((l) => l.startsWith(prefix)) ?? '';

  it('the R3.8 and R3.8b setup swaps containers/containerId for images/imageId, like the real v8 and v10', () => {
    for (const prefix of [
      '3. Outside the app: in `migracao/mapping.json`',
      '5. Outside the app, in `migracao10/mapping.json`',
    ]) {
      const step = prepStep(prefix);
      expect(step, prefix).not.toBe('');
      expect(step, prefix).toContain('"containers"');
      expect(step, prefix).toContain('"images"');
      expect(step, prefix).toContain('imageId');
    }
  });

  it('R3.1: the Notes version is the one in notas.spec.json', () => {
    const spec = JSON.parse(read('libraries/notas/notas.spec.json')) as {
      version: number;
    };
    const row = guide.split('\n').find((l) => /^\| R3\.1 \|/.test(l)) ?? '';
    expect(row).toContain(`**Notes** (version ${spec.version})`);
  });

  it('appendix A: "Misleading selectors and names" lists only data-window values that exist in src/', () => {
    const { appendixA } = splitAppendixA(guide);
    const block = /### Misleading selectors and names([\s\S]*?)(?=\n### |\n## |$)/.exec(
      appendixA,
    )?.[1];
    expect(block).toBeDefined();
    const listed = /\[data-window=([a-z|]+)\]/.exec(block!)?.[1]?.split('|') ?? [];
    expect(listed.length).toBeGreaterThanOrEqual(7);
    const source = read('src/store/toolWindows.ts');
    for (const id of listed) expect(source, id).toContain(`'${id}'`);
    for (const word of [
      'alertdialog',
      'button.tree-item',
      'page.mouse',
      'New container',
      '/^Review/',
    ]) {
      expect(block, word).toContain(word);
    }
  });

  it('R11.9: cites every Ctrl+Shift+<n> window shortcut (WINDOW_NUMBER of toolWindows.ts)', () => {
    const source = read('src/store/toolWindows.ts');
    const numbers = [
      ...(/WINDOW_NUMBER[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '').matchAll(
        /:\s*(\d+),/g,
      ),
    ].map((m) => m[1]);
    expect(numbers.length).toBeGreaterThanOrEqual(9);
    const row = guide.split('\n').find((l) => /^\| R11\.9 \|/.test(l)) ?? '';
    expect(row).not.toBe('');
    for (const n of numbers) {
      expect(row, `Ctrl+Shift+${n}`).toMatch(
        new RegExp(`Ctrl\\+Shift\\+${n}\\b|\`${n}\`(?![\\d])`),
      );
    }
  });
});

// Stage #1148 (TR4, decisions 15 to 20): directed round in groups and retest together.
describe('TR4 — directed round in groups and retest together', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');
  const skill = read('.claude/skills/implementar-fila/SKILL.md');

  it('the prompt has the limit (40 steps without R0, up to 5 sessions) and the "grupo k de n" mode', () => {
    // The summary stays in the prompt; the body moved to `consulta.grupos` (TE1).
    const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');
    const summary = cloud.slice(
      cloud.indexOf('## Directed round in groups'),
      cloud.indexOf('## Check and record'),
    );
    expect(summary).toMatch(/goes over \*\*40 steps\*\*/);
    expect(summary).toMatch(/at most \*\*5 simultaneous sessions/);
    expect(summary).toContain('cloud.mjs secao consulta.grupos');
    const section = consulta.slice(
      consulta.indexOf('## Directed round in groups'),
      consulta.indexOf('## Visual pass'),
    );
    expect(section).toMatch(/goes over \*\*40 steps\*\*/);
    expect(section).toMatch(/at most \*\*5 simultaneous sessions/);
    expect(section).toContain('round-guide.mjs --grupos');
    expect(section).toContain('run in `modo dirigido, grupo k de n`');
    expect(`${cloud}\n${consulta}`).toContain('Modo: dirigido, grupo k de n (<scripts>)');
    expect(section).toContain('Directed round — group k of n');
    expect(section).toMatch(/notice to the coordinator[^\n]*group/i);
    expect(section).toMatch(/\*\*group 1\*\* runs the \*\*whole R0\*\*/);
    expect(section).toMatch(/R0\.1/);
  });

  it('FLOW.md has the group message, the title, the 60 min backup and the summary with "Grupo"', () => {
    expect(flow).toMatch(
      /run in modo dirigido, grupo <k> de <n>:[^\n]*Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+Tag da release:[^\n]+Coordenador: `/,
    );
    expect(flow).toContain('Testador — <target>, grupo <k> de <n>');
    const section = flow.slice(
      flow.indexOf('## Directed round in groups'),
      flow.indexOf('## Retest together'),
    );
    expect(section).toMatch(/60 min/);
    expect(section).toMatch(/n notices/);
    expect(section).toMatch(/"Grupo" in place of "Bloco"/);
  });

  it('the retest is a single session, with the findings of all groups or blocks, and the merged fix goes in', () => {
    const section = flow.slice(flow.indexOf('## Retest together'));
    expect(section).toMatch(/a single session/);
    expect(section).toMatch(/\*\*all\*\* the groups or blocks/);
    expect(section).toMatch(/while the retest has not started yet/);
  });

  it('docs/PROCESS.md and the implementar-fila skill cite the round in groups and the retest together', () => {
    expect(claude).toContain('round-guide.mjs --grupos');
    expect(claude).toMatch(
      /in a single session\*\* with the findings of all (?:the )?groups or blocks/,
    );
    expect(claude).toMatch(/grupo k de n/);
    expect(skill).toContain('round-guide.mjs --grupos');
    expect(skill).toMatch(
      /in a single session\*\* with the findings of all (?:the )?groups or blocks/,
    );
  });
});

describe('CL1 — script of R9.24 to R9.28 (stage #701)', () => {
  const rows = read('docs/TESTING.md')
    .split('\n')
    .filter((l) => /^\| R9\.2[4-8] /.test(l));
  const row = (id: string): string => rows.find((l) => l.startsWith(`| ${id} `)) ?? '';

  it('the Column of R9.25 and R9.26 fits the 300 × 200 Card of R9.18 (x 20 + width ≤ 300)', () => {
    for (const id of ['R9.25', 'R9.26']) {
      const m = /Column with `rect` `\{"x":(\d+),"y":\d+,"width":(\d+),/.exec(row(id));
      expect(m, id).not.toBeNull();
      expect(Number(m?.[1]) + Number(m?.[2]), id).toBeLessThanOrEqual(300);
    }
  });

  it('R9.28 (c) separates invalid-ref (???) from not-found (a well-formed reference that does not exist)', () => {
    const r = row('R9.28');
    expect(r).toMatch(/`inside` `\?\?\?`/);
    expect(r).toMatch(/`inside` `mapping:\/\/telas\/m\/nonexistent`/);
    expect(r).toMatch(/\(c1\) `invalid-ref`; \(c2\) `not-found`/);
  });

  it('R9.24 does not expect membership (it only lists who changed parent)', () => {
    expect(row('R9.24')).not.toBe('');
    expect(row('R9.24')).not.toContain('membership');
  });
});

describe('D2 — density script (R9.29 to R9.31, stage #1085)', () => {
  const rows = read('docs/TESTING.md')
    .split('\n')
    .filter((l) => /^\| R9\.(29|30|31) /.test(l));
  const row = (id: string): string => rows.find((l) => l.startsWith(`| ${id} `)) ?? '';

  it('the three steps exist and do not ask for the MCP (the cloud does it alone)', () => {
    for (const id of ['R9.29', 'R9.30', 'R9.31']) expect(row(id), id).not.toBe('');
    expect(rows.join('\n')).not.toMatch(/stdio|plan_changes/);
  });

  it('the texts cited are the interface ones (en-US)', () => {
    expect(enUS['density.suggestion']).toBe('Suggestion: {value}x ({name})');
    expect(row('R9.29')).toContain(
      enUS['density.suggestion']
        .replace('{value}', '3')
        .replace('{name}', 'Phone 360 × 800'),
    );
    expect(row('R9.31')).toContain(enUS['density.error']);
    expect(row('R9.29')).toContain(enUS['density.apply']);
    expect(row('R9.31')).toContain(enUS['density.custom']);
  });

  it('the R9.30 button measures 174 × 120 (the minSize 58 × 40 × 3) and is born 264 × 120 (88 × 40 × 3)', () => {
    const r = row('R9.30');
    expect(r).toContain('`174`');
    expect(r).toContain('`120`');
    expect(r).toContain('`264`');
    expect(58 * 3).toBe(174);
    expect(88 * 3).toBe(264);
  });
});

describe('A4 — anchor script in the app (R9.32 to R9.36, stage #1096, R4)', () => {
  const rows = read('docs/TESTING.md')
    .split('\n')
    .filter((l) => /^\| R9\.(32|33|34|35|36) /.test(l));
  const row = (id: string): string => rows.find((l) => l.startsWith(`| ${id} `)) ?? '';

  it('the five steps exist and do not ask for the MCP (the cloud does it alone)', () => {
    for (const id of ['R9.32', 'R9.33', 'R9.34', 'R9.35', 'R9.36']) {
      expect(row(id), id).not.toBe('');
    }
    expect(rows.join('\n')).not.toMatch(/stdio|plan_changes|propose_changes/);
  });

  it('the texts cited are the interface ones (en-US)', () => {
    expect(row('R9.32')).toContain(enUS['anchor.section']);
    expect(row('R9.32')).toContain(enUS['anchor.target']);
    expect(row('R9.32')).toContain(enUS['anchor.none']);
    expect(row('R9.33')).toContain(enUS['anchor.sideBottom']);
    expect(row('R9.33')).toContain(enUS['anchor.alignEnd']);
    expect(row('R9.33')).toContain(enUS['anchor.offsetMainShort']);
    expect(row('R9.33')).toContain(enUS['anchor.error.number']);
    expect(row('R9.34')).toContain(enUS['anchor.snap']);
    expect(row('R9.34')).toContain(enUS['anchor.snapped']);
    expect(row('R9.34')).toContain(enUS['anchor.snapNothing']);
    expect(row('R9.36')).toContain(enUS['arrange.done']);
  });

  it('the snap arithmetic: button 88 × 40, above (Y 400 − 40 = 360) and below with 10 (Y 400 + 40 + 10 = 450)', () => {
    const r = row('R9.34');
    expect(r).toContain('88 × 40');
    expect(r).toContain('`360`');
    expect(r).toContain('`450`');
    expect(400 - 40).toBe(360);
    expect(400 + 40 + 10).toBe(450);
  });
});

// Stage #1533 (TE1, decision 4): the tester prompt is read whole; what only some read stays in the CONSULTA.
describe('lean docs/TESTING-NUVEM.md and TESTING-NUVEM-CONSULTA.md (#1533, TE1)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');

  // The ceiling went from 32,000 to 32,500 in stage #1712 (restoring the wording from before PR #1709).
  it('TESTING-NUVEM.md has up to 32,500 characters', () => {
    expect(cloud.length).toBeLessThanOrEqual(32_500);
  });

  it('the CONSULTA brings the keys and TESTING-NUVEM.md points to the secao of each one', () => {
    for (const [key, title] of [
      ['consulta.grupos', '## Directed round in groups'],
      ['consulta.passada', '## Visual pass'],
      ['consulta.regras', '## Exception rules'],
      ['consulta.historico', '## Block history'],
    ] as const) {
      expect(consulta, key).toContain(title);
      expect(cloud, key).toContain(`cloud.mjs secao ${key}`);
    }
  });

  it('the headings that FLOW and PROCESS link to are still in TESTING-NUVEM.md', () => {
    expect(cloud).toMatch(/^## Full round in blocks$/m);
    expect(cloud).toMatch(/^## Directed round in groups$/m);
  });
});

// Stage #1533 (TE3, decision 14 (1) and (2)): screen labels in R25 and R1.21a without item (8).
describe('TE3 — R1.21a and R25.28/30/32 (#1489)', () => {
  const guide = readFileSync('docs/TESTING.md', 'utf8');
  const row = (code: string): string =>
    guide.split('\n').find((l) => l.startsWith(`| ${code} |`)) ?? '';

  it('R1.21a loses item (8): the sentence of R15.3 and R15.11 stays', () => {
    const r = row('R1.21a');
    expect(r).not.toContain('(8)');
    expect(r).toContain(
      'The consent strip is checked in R15.3 and R15.11, which already check the focus.',
    );
  });

  it('R25.28, R25.30 and R25.32 say Light, Dark and Follow the project, with the saved value in parentheses', () => {
    const r30 = row('R25.30');
    expect(r30).toContain('choose **Light** (saves `light`)');
    expect(r30).toContain('**Follow the project**');
    expect(r30).toContain('then **Light** and **Dark**');
    expect(r30).not.toMatch(/then `light` and `dark`/);
    const r32 = row('R25.32');
    expect(r32).toContain('**Light** (`light`');
    expect(r32).toContain('**Dark** (`dark`)');
    expect(r32).not.toMatch(/back to `light`/);
    expect(row('R25.28')).toContain(
      '**Light** and **Dark** (the saved values are `light` and `dark`',
    );
  });
});

describe('TE3 — restricted retest, 300 thousand and Marking tree (#1533, decisions 11, 13 and 14)', () => {
  const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const consulta = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');

  it('mode 1 and the "R0 in the retest" talk about the ranges and the Reproduction', () => {
    expect(cloud).toContain('**restricted retest**');
    expect(cloud).toContain('round-guide.mjs R12.10d-R12.10f');
    expect(cloud).toMatch(/first run the \*\*Reproduction\*\* of each finding/);
    expect(cloud).toMatch(/range and the Reproduction of the findings/);
    expect(consulta).toMatch(
      /Retests together[^\n]*\*\*ranges\*\*[^\n]*\*\*Reproduction\*\*/,
    );
  });

  it('the 300 thousand context rule is in "Full round in blocks"', () => {
    const blocks = cloud.slice(cloud.indexOf('## Full round in blocks'));
    expect(blocks).toMatch(/\*\*300 thousand\*\*/);
    expect(blocks).toMatch(
      /it is the session that guarantees it, with the subagents per batch/,
    );
    expect(blocks).toContain('Teto de contexto do testador');
    // TC2 (#1639, decision 8): the excess is recorded, without moving scripts nor calling the owner.
    expect(blocks).not.toContain('moves scripts between the 5 blocks');
    expect(blocks).not.toMatch(/Context up to 300 thousand[^\n]*calls the owner/);
  });

  it('the "How to act" cites the "Marking tree" button and openWindow', () => {
    expect(cloud).toContain('**Marking tree**, not "Tree"');
    expect(cloud).toContain('only with `openWindow(page, id)`');
  });
});

// Phase ID8 (#824 of #741): the app is opened in en-US, so R8 gets a Portuguese sample (R8.6)
// and R11 checks the guide in Portuguese through `mapping.locale` (R11.15).
describe('ID8 — R8.6 (Portuguese sample) and R11.15 (guide in Portuguese)', () => {
  const guide = read('docs/TESTING.md');
  const row = (code: string): string => {
    const line = guide.split('\n').find((l) => l.startsWith(`| ${code} |`));
    expect(line, code).toBeDefined();
    return line ?? '';
  };
  const r8 = guide.slice(guide.indexOf('### R8 '), guide.indexOf('### R9 '));

  it('R8 ends with R8.6, after the theme and language steps', () => {
    const codes = [...stepActions(r8).keys()];
    expect(codes.at(-1)).toBe('R8.6');
    expect(codes).toContain('R8.5c');
  });

  it('R8.6 reads the home screen, the status bar and a dialog in Portuguese, then goes back to English', () => {
    const r = row('R8.6');
    expect(r).toContain('**Portuguese sample.**');
    expect(r).toContain(`**${enUS['language.pt-BR']}**`);
    expect(r).toContain(
      `page.getByLabel('${enUS['settings.language']}').selectOption('pt-BR')`,
    );
    expect(r).toContain(
      `page.getByLabel('${ptBR['settings.language']}').selectOption('en-US')`,
    );
    expect(r).toMatch(/home screen[\s\S]*status bar[\s\S]*Settings[\s\S]*Help/);
  });

  it('R8.6 cites the pt-BR texts of the app and the en-US ones after going back', () => {
    const r = row('R8.6');
    for (const key of [
      'home.start',
      'home.newProject',
      'home.openFolder',
      'home.openZip',
      'status.saved',
      'settings.title',
      'help.title',
    ] as const) {
      expect(r, key).toContain(`**${ptBR[key]}**`);
      expect(r, key).toContain(`\`${key}\``);
    }
    for (const key of [
      'home.start',
      'status.saved',
      'settings.title',
      'help.title',
    ] as const) {
      expect(r, key).toContain(`**${enUS[key]}**`);
    }
  });

  it('R11.15 switches the app to pt-BR (mapping.locale), goes through steps 1 and 14 and goes back', () => {
    const r = row('R11.15');
    expect(r).toContain('**The guide in Portuguese.**');
    expect(r).toContain('`mapping.locale`');
    expect(r).toContain(`**${enUS['language.pt-BR']}**`);
    expect(r).toContain(`**${enUS['language.en-US']}**`);
    expect(r).not.toContain('localStorage');
    expect(r).toContain('step 14 still has 14 steps');
  });

  it('R11.15 cites the guide texts in Portuguese and in English', () => {
    const r = row('R11.15');
    const pt = GUIDE_MESSAGES['pt-BR'];
    const en = GUIDE_MESSAGES['en-US'];
    for (const text of [pt.previous, pt.next, pt.stepsHeading, pt.openApp]) {
      expect(r, text).toContain(`**${text}**`);
    }
    for (const text of [en.previous, en.next]) {
      expect(r, text).toContain(`**${text}**`);
    }
    expect(r).toContain(`**${ptBR['home.openZip']}**`);
  });
});
