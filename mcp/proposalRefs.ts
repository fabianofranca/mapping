import { formatAnyRef, normalizeId, parseAnyRef, shortCodesFor } from '../src/model';
import { ToolError } from './errors';
import { INVALID_REF_HINT, candidateLocations } from './items';
import type { ProjectLocation } from './projects';
import {
  listStored,
  type BrokenProposal,
  type StoredProposal,
  type StoredProposals,
} from './proposalStore';
import type { Roots } from './paths';
import { BARE_ID } from './shared';

// Proposal reference: `mapping://<project>/p/<code>` (the code is the first 8 hexadecimal
// characters of the id, as on items; it grows by 4 if there is a collision among the
// project's proposals). Also accepts `p/<code>` with `project` given, or the full id.

interface ParsedProposalRef {
  readonly project: string | null;
  /** Short code or full id, as given. */
  readonly code: string;
}

export function parseProposalRef(text: string): ParsedProposalRef | null {
  const input = text.trim();
  const parsed = parseAnyRef(input);
  if (parsed) {
    const { ref } = parsed;
    // Only the letter `p` applies here; the rest of the grammar belongs to the item tools (CM6).
    return ref.type === 'item' && ref.kind === 'p'
      ? { project: parsed.project, code: ref.code }
      : null;
  }
  return BARE_ID.test(input) ? { project: null, code: input } : null;
}

/** Short codes of the project's proposals (unique among them). */
export function proposalCodes(ids: readonly string[]): ReadonlyMap<string, string> {
  return shortCodesFor(ids);
}

/** `mapping://<project>/p/<code>`: only the URL, with the project encoded. */
export function formatProposalRef(projectName: string, code: string): string {
  return formatAnyRef(projectName, { type: 'item', kind: 'p', code });
}

/** References of all the readable proposals of the project, by id. */
export class ProposalRefs {
  private readonly codes: ReadonlyMap<string, string>;

  constructor(
    readonly projectName: string,
    private readonly all: StoredProposals,
    extraIds: readonly string[] = [],
  ) {
    this.codes = proposalCodes([...all.proposals.map((p) => p.id), ...extraIds]);
  }

  /** Reference of the proposal (`mapping://<project>/p/<code>`). */
  ref(id: string): string {
    const code = this.codes.get(id) ?? normalizeId(id).slice(0, 8);
    return formatProposalRef(this.projectName, code);
  }
}

export interface ResolvedProposal {
  readonly location: ProjectLocation;
  readonly stored: StoredProposal;
  readonly all: StoredProposals;
  readonly refs: ProposalRefs;
}

function matches<T extends { readonly id: string }>(
  stored: readonly T[],
  code: string,
): T[] {
  const exactId = stored.filter((s) => s.id === code);
  if (exactId.length === 1) return exactId;
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const prefix = stored.filter((s) => normalizeId(s.id).startsWith(wanted));
  const exact = prefix.filter((s) => normalizeId(s.id) === wanted);
  return exact.length > 0 ? exact : prefix;
}

const ACCEPTED = [
  'mapping://project/p/3f2a9c1e',
  'p/3f2a9c1e (with the project given separately)',
  'the full id of the proposal (with the project given separately)',
];

/**
 * Finds the proposal in an already-read list (those of one project). The full reference of another
 * project is refused (`project-mismatch`); an ambiguous code returns the candidates.
 */
export function lookupStored(
  all: StoredProposals,
  location: ProjectLocation,
  refText: string,
): StoredProposal {
  const parsed = parseProposalRef(refText);
  if (!parsed) {
    throw new ToolError('invalid-ref', `invalid proposal reference: ${refText}`, {
      accepted: ACCEPTED,
      hint: INVALID_REF_HINT,
    });
  }
  if (parsed.project !== null && parsed.project !== location.name) {
    throw new ToolError(
      'project-mismatch',
      `the reference is from project "${parsed.project}", not "${location.name}"`,
    );
  }
  const found = matches(all.proposals, parsed.code);
  if (found.length === 1) return found[0]!;
  if (found.length === 0) {
    const unreadable = matches(all.broken, parsed.code);
    if (unreadable.length > 0) throw unreadableProposal(unreadable);
    throw new ToolError('proposal-not-found', `no proposal matches ${refText}`, {
      ref: refText,
      hint: 'use list_proposals(project) to see the proposals of the project',
    });
  }
  throw ambiguous(refText, location, all, found);
}

/** The code only finds unreadable proposals: `invalid-proposal` (the guide), not `proposal-not-found`. */
function unreadableProposal(broken: readonly BrokenProposal[]): ToolError {
  const first = broken[0]!;
  return new ToolError('invalid-proposal', `unreadable proposal: ${first.error}`, {
    proposal: first.id,
    hint: 'the proposal.json is unreadable; list_proposals shows the unreadable ones in `broken`',
  });
}

function ambiguous(
  refText: string,
  location: ProjectLocation,
  all: StoredProposals,
  found: readonly StoredProposal[],
): ToolError {
  const refs = new ProposalRefs(location.name, all);
  return new ToolError(
    'ambiguous-ref',
    `${found.length} proposals start with that code: use the full reference of one of them`,
    {
      ref: refText,
      candidates: found
        .slice(0, 20)
        .map((s) => ({ ref: refs.ref(s.id), dir: location.dir })),
    },
  );
}

/**
 * Finds the proposal from what the agent gave (`ref`, plus `project` when the reference does not
 * carry it). Without a project, searches all those in the roots. An ambiguous code returns the candidates.
 */
export async function resolveProposal(
  roots: Roots,
  refText: string,
  projectArg?: string,
): Promise<ResolvedProposal> {
  const parsed = parseProposalRef(refText);
  if (!parsed) {
    throw new ToolError('invalid-ref', `invalid proposal reference: ${refText}`, {
      accepted: ACCEPTED,
      hint: INVALID_REF_HINT,
    });
  }
  const locations = await candidateLocations(roots, parsed.project, projectArg);

  const found: {
    location: ProjectLocation;
    all: StoredProposals;
    stored: StoredProposal;
  }[] = [];
  const unreadable: BrokenProposal[] = [];
  for (const location of locations) {
    const all = await listStored(roots, location);
    for (const stored of matches(all.proposals, parsed.code)) {
      found.push({ location, all, stored });
    }
    unreadable.push(...matches(all.broken, parsed.code));
  }
  if (found.length === 1) {
    const [only] = found;
    return { ...only!, refs: new ProposalRefs(only!.location.name, only!.all) };
  }
  if (found.length === 0 && unreadable.length > 0) throw unreadableProposal(unreadable);
  if (found.length === 0) {
    throw new ToolError('proposal-not-found', `no proposal matches ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
      hint: 'use list_proposals(project) to see the proposals of the project',
    });
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} proposals start with that code: use the full reference of one of them`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => ({
        ref: new ProposalRefs(c.location.name, c.all).ref(c.stored.id),
        dir: c.location.dir,
      })),
    },
  );
}
