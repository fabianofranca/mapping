// @vitest-environment node
// Stage #1879, phase WC3: the `watch-conversations` skill of the example workspace and the docs that cite it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractBlock } from '../../scripts/release/workspaceAssets.mjs';

const read = (path: string) => readFileSync(path, 'utf8');
const SKILL = read('examples/workspace/.agents/skills/watch-conversations/SKILL.md');

/** The frontmatter between the first two `---` lines. */
function frontmatter(text: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error('frontmatter not found');
  return match[1]!;
}

describe('watch-conversations skill', () => {
  it('has the name and an English description that cites watching and stopping', () => {
    const fm = frontmatter(SKILL);
    expect(fm).toMatch(/^name: watch-conversations$/m);
    const description = /^description: (.+)$/m.exec(fm)?.[1] ?? '';
    expect(description).toMatch(/watch the conversations/i);
    expect(description).toMatch(/stop watching/i);
    expect(/^[ -~]+$/.test(description)).toBe(true);
  });

  it('has the sections of the flow', () => {
    for (const title of [
      'Preparation',
      'Answer what is already waiting',
      'Start',
      'Claude Code',
      'Cursor',
      'On wake',
      'Stop',
    ]) {
      expect(SKILL, title).toMatch(new RegExp(`^#{2,3} ${title}`, 'm'));
    }
  });

  it('cites the watcher command, the wake line and the tool parameters', () => {
    for (const text of [
      '--emit',
      '--state .mapping-watch/state.json',
      '--root',
      '^MAPPING_WAKE',
      'timeout_ms',
      '1800000',
      'exec',
      'list_threads',
      'get_thread',
      'post_message',
      'stale-thread',
      'wait_for_comment',
    ]) {
      expect(SKILL, text).toContain(text);
    }
    expect(SKILL).toMatch(/never edit `watch-comments\.mjs`/i);
  });
});

describe('docs cite the skill', () => {
  it('the workspace README and the skills README', () => {
    expect(read('examples/workspace/README.md')).toContain('watch-conversations');
    expect(read('examples/workspace/README.md')).toContain('.mapping-watch/');
    expect(read('examples/workspace/.agents/skills/README.md')).toContain(
      'watch-conversations',
    );
  });

  it('the AGENTS.md managed block, in both workspaces', () => {
    for (const file of ['examples/workspace/AGENTS.md', 'mappings-workspace/AGENTS.md']) {
      expect(extractBlock(read(file)), file).toContain('watch-conversations');
    }
  });

  it('the mappings-workspace README and the agent guide', () => {
    expect(read('mappings-workspace/README.md')).toContain('watch-conversations');
    expect(read('docs/AGENT-GUIDE.md')).toContain('watch-conversations');
  });
});
