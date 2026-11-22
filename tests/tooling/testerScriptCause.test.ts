// @vitest-environment node
// Fast track #2261: the cloud tester tells a test-script mismatch from a product defect before it
// gives a ❌ its severity. Text-only test (reads the file).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
const guide = readFileSync('docs/TESTING.md', 'utf8');
const consulta = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');

describe('#2261 — the tester gives each ❌ a cause before its severity', () => {
  const check = section(cloud, '## Check and record');
  const report = section(cloud, '## Report');

  it('"Check and record": check the expected result against the source that defines the behavior', () => {
    expect(check).toContain('Before recording a ❌');
    expect(check).toContain('the docs in `docs/`');
    expect(check).toContain('the code');
    expect(check).toContain('design decision');
  });

  it('"Check and record": the cause is `produto` or `roteiro`, and `roteiro` is always low', () => {
    expect(check).toContain('**cause**');
    expect(check).toContain('`produto`');
    expect(check).toContain('`roteiro`');
    expect(check).toContain('always **low**');
    expect(check).toContain('`docs/PROCESS.md`');
  });

  it('"Check and record": a doubt is recorded with the source read and does not raise the severity', () => {
    expect(check).toContain('cannot tell them apart');
    expect(check).toContain('the source you read');
    expect(check).toContain('do not raise the severity because of the doubt');
  });

  it('"Report": the findings carry the cause and the notice counts `roteiro` apart', () => {
    expect(report).toContain('the **cause** (`produto` or `roteiro`) of each one');
    expect(report).toContain('`roteiro` counted apart, not in `low`');
    expect(report).toContain('findings: high 1, medium 1, roteiro 2');
  });
});

// Stage #2450 (TC1, decisions 1 to 3; absorbs #2264 and #2364): the cause reaches the template and the
// subagent's lines, and the batch subagent's model is stated.
describe('#2450 — the finding cause in the report template and the subagent lines', () => {
  const template = section(guide, '### Round report');
  const subagent = section(consulta, '## Subagent per batch');

  it('the finding template has the `- Cause:` line right after `- Severity:`', () => {
    const lines = template.split('\n');
    const i = lines.findIndex((l) => l.startsWith('- Severity:'));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toBe('- Cause: `produto` | `roteiro`');
    expect(template).toContain('`docs/TESTING-NUVEM.md`, "Check and record"');
  });

  it('the Summary line counts `roteiro` apart', () => {
    expect(template).toContain(
      '- Findings by severity: blocks N, high N, medium N, low N; `roteiro` N (counted apart, not in low).',
    );
  });

  it('"Subagent per batch": the cause in each finding and in the return line', () => {
    expect(subagent).toContain('the cause (`produto` or `roteiro`) next to the severity');
    expect(subagent).toContain('findings: <code severity cause short title…> or none');
    expect(subagent).toContain('findings: 3.2 low roteiro R17.48 issues.new not empty');
    expect(subagent).toContain('counts `roteiro` apart without opening the file');
  });

  it('"Subagent per batch": names the model (`sonnet`, medium), not the session\'s', () => {
    expect(subagent).toContain('`model: "sonnet"`');
    expect(subagent).toContain('medium effort');
    expect(subagent).not.toContain('the same model as the session');
  });
});
