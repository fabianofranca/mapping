// Fixes from the `/code-review` of NV1 (stage #1900): proposals carrying `$tokens` suggestions, cycles through
// `over`/`alpha`.
import { describe, expect, it } from 'vitest';
import {
  buildProposal,
  createProject,
  parseProposalText,
  parseSpec,
  patchProject,
  serializeProposal,
  type Project,
  type Spec,
} from '../../src/model';

type Json = Record<string, unknown>;

function raw(tokens: Json, suggestions?: unknown[]): Json {
  const field: Json = { key: 'kind', type: 'string' };
  if (suggestions) field.suggestions = suggestions;
  field.required = true;
  return {
    format: 'mapping-spec',
    formatVersion: 23,
    id: 's',
    name: 'S',
    version: 1,
    tokens,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 't', name: 'T', fields: [field] }],
      },
    ],
  };
}

const EVENTS = {
  values: {
    open: { $value: 'open', $group: 'events' },
    close: { $value: 'close', $group: 'events' },
  },
};

function parsed(data: unknown): Spec {
  const r = parseSpec(data);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
}

function withSpec(spec: Spec): { base: Project; after: Project } {
  const base = createProject({
    name: 'P',
    now: '2026-10-09T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'L', color: '#112233' },
  });
  const after: Project = {
    ...base,
    specializations: [{ id: 's', version: 1, file: 'specs/s.json', spec }],
  };
  return { base, after };
}

describe('a proposal that carries a specialization with $tokens suggestions', () => {
  const spec = parsed(raw(EVENTS, [{ $tokens: 'events' }]));
  const { base, after } = withSpec(spec);
  const proposal = buildProposal(base, after, {
    id: 'P1',
    title: 'T',
    createdAt: '2026-10-09T12:00:00.000Z',
  });

  it('is written and read back (no suggestionsSource in the file)', () => {
    const text = serializeProposal(proposal);
    expect(text).not.toContain('suggestionsSource');
    const read = parseProposalText(text);
    expect(read.ok).toBe(true);
  });

  it('applies with the suggestions expanded and the written list kept', () => {
    const read = parseProposalText(serializeProposal(proposal));
    if (!read.ok) throw new Error('not read');
    const applied = patchProject(base, read.proposal.changes).project;
    const field = applied.specializations[0]?.spec?.layers[0]?.annotationTypes[0]
      ?.fields[0] as { suggestions?: unknown; suggestionsSource?: unknown };
    expect(field.suggestions).toEqual(['open', 'close']);
    expect(field.suggestionsSource).toEqual([{ $tokens: 'events' }]);
  });
});

describe('a cycle through `over`', () => {
  it('is reported at the alias that closes it', () => {
    const r = parseSpec(
      raw({
        values: {
          base: '#112233',
          a: { $token: 'base', over: 'c' },
          c: { $token: 'a' },
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.some((i) => i.message.includes('→'))).toBe(true);
  });
});
