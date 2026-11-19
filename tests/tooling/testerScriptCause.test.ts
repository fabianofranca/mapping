// @vitest-environment node
// Fast track #2261: the cloud tester tells a test-script mismatch from a product defect before it
// gives a ❌ its severity. Text-only test (reads the file).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');

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
