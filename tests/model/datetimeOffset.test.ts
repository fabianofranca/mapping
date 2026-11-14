import { describe, expect, it } from 'vitest';
import {
  deserialize,
  parseProposalText,
  renameMarking,
  serialize,
  serializeProposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { propose } from './proposalFixtures';

function withDates(createdAt: string, updatedAt: string): string {
  const p = sampleProject();
  return serialize({ ...p, project: { ...p.project, createdAt, updatedAt } });
}

describe('project dates', () => {
  it('UTC with Z: lossless round trip', () => {
    const text = withDates('2026-10-01T09:30:00Z', '2026-10-02T10:00:00.123Z');
    const result = deserialize(text);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(serialize(result.project)).toBe(text);
  });

  it('with a time zone (written by an external tool): opens and saves normalized to UTC', () => {
    const text = withDates('2026-10-01T09:30:00-03:00', '2026-10-02T10:00:00.5+01:00');
    const result = deserialize(text);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const saved = serialize(result.project);
    expect(saved).toContain('"createdAt": "2026-10-01T12:30:00.000Z"');
    expect(saved).toContain('"updatedAt": "2026-10-02T09:00:00.500Z"');
    const again = deserialize(saved);
    if (!again.ok) throw new Error(JSON.stringify(again.error));
    expect(serialize(again.project)).toBe(saved);
  });
});

describe('proposal dates', () => {
  it('with a time zone: accepts and normalizes to UTC', () => {
    const base = sampleProject();
    const proposal = propose(base, renameMarking(base, 'M4', 'Headlight'));
    const json = JSON.parse(serializeProposal(proposal)) as Record<string, unknown>;
    json.createdAt = '2026-10-09T09:00:00-03:00';
    const parsed = parseProposalText(JSON.stringify(json));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(parsed.proposal.createdAt).toBe('2026-10-09T12:00:00.000Z');
  });
});
