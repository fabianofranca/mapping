// CLAUDE.md enters the context of every session and every subagent: it stays lean, and the
// delivery process lives in docs/PROCESS.md (stage #1306).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');
const LIMIT = 15000;

describe('lean CLAUDE.md', () => {
  it(`has at most ${LIMIT} characters`, () => {
    expect(read('CLAUDE.md').length).toBeLessThanOrEqual(LIMIT);
  });

  it('points to docs/PROCESS.md at the top and in the workflow summary', () => {
    const claude = read('CLAUDE.md');
    const project = claude.slice(
      claude.indexOf('## Project'),
      claude.indexOf('## Stack'),
    );
    expect(project).toContain('docs/PROCESS.md');
    const summary = claude.slice(claude.indexOf('## Workflow (summary)'));
    expect(summary).toContain('docs/PROCESS.md');
  });

  it('docs/PROCESS.md has the moved sections', () => {
    const process = read('docs/PROCESS.md');
    for (const title of ['## Workflow', '## Model use', '## Stages']) {
      expect(process, title).toContain(title);
    }
  });

  it('docs/PROCESS.md has at most 26 thousand bytes and the moved step by step is in docs/FLOW.md (stage #1306, LC2)', () => {
    expect(Buffer.byteLength(read('docs/PROCESS.md'))).toBeLessThanOrEqual(26000);
    const flow = read('docs/FLOW.md');
    for (const title of [
      '## Orchestrator — step by step',
      '## Bug: duplicate search',
      '## Bug: body and evidence',
      '## Bug evidence',
      '## CI and preview',
    ]) {
      expect(flow, title).toContain(title);
    }
    const process = read('docs/PROCESS.md');
    expect(process).not.toContain('git worktree add');
    expect(process).toContain('docs/FLOW.md');
    // each pointer in PROCESS.md points to a title that exists in FLOW.md
    for (const title of [
      'Orchestrator — step by step',
      'Bug: duplicate search',
      'Bug: body and evidence',
      'Bug evidence',
      'CI and preview',
    ]) {
      expect(process, title).toContain(title);
    }
  });
});
