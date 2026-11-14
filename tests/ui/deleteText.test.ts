import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { deleteImpact } from '../../src/model';
import { impactText } from '../../src/ui/comments/deleteText';
import {
  AGENT,
  HUMAN,
  T0,
  T1,
  T2,
  T3,
  message,
  sampleThread,
} from '../model/threadFixtures';

// Locks what the script (docs/TESTING.md, R22.18 and R3.10) claims about the app texts.
describe('texts cited in the script', () => {
  beforeEach(() => {
    locale.value = 'en-US';
  });

  it('R22.18: "5 messages will be gone" by author, from who wrote the most to who wrote the least, alphabetical tie', () => {
    const cloud = {
      kind: 'human' as const,
      name: 'Cloud Test',
      email: 'test@example.com',
    };
    const tester = { kind: 'agent' as const, name: 'agent-tester', email: null };
    const thread = sampleThread({
      messages: [
        message('m1', T0, HUMAN),
        message('m2', T1, cloud),
        message('m3', T2, AGENT),
        message('m4', T3, tester),
        message('m5', T3, cloud),
      ],
    });
    expect(impactText(deleteImpact(thread, null))).toBe(
      '5 messages will be gone: 2 from Cloud Test, 1 from agent-tester (agent), 1 from Claude Code (agent), 1 from Marina Alves.',
    );
  });

  it('R3.10: the application message carries the name in quotes', () => {
    expect(t('spec.appliedMessage', { name: 'Material 3 (Compose)', layers: 3 })).toBe(
      '"Material 3 (Compose)" applied: 3 layer(s) created.',
    );
  });
});
