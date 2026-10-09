import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addLayer,
  buildProposal,
  createProject,
  parseProposalText,
  proposalFilePath,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { ToolError } from '../../mcp/errors';
import { Roots } from '../../mcp/paths';
import { listStored, updateStored, writeNewProposal } from '../../mcp/proposalStore';
import type { ProjectLocation } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// A conferência de `revision` do arquivo da proposta (como a do mapping.json): quem atualiza
// relê o arquivo imediatamente antes de gravar e grava `revision + 1`.

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mapping-store-'));
  const dir = join(root, 'p');
  mkdirSync(dir);
  const location: ProjectLocation = { name: 'p', dir, root, path: 'p' };
  const base = createProject({
    name: 'P',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
  });
  const after = addLayer(base, { id: 'L2', name: 'Nova', color: '#112233' });
  const proposal = buildProposal(base, after, {
    id: 'prop-1',
    title: 'Teste',
    createdAt: NOW,
  });
  return { roots: new Roots([root]), dir, location, proposal };
}

const read = (dir: string, id: string): Proposal => {
  const parsed = parseProposalText(readFileSync(join(dir, proposalFilePath(id)), 'utf8'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.proposal;
};

describe('writeNewProposal e listStored', () => {
  it('grava a pasta, as imagens e o proposal.json; um id repetido é recusado', async () => {
    const { roots, dir, location, proposal } = setup();
    const result = await writeNewProposal(
      roots,
      location,
      proposal,
      new Map([['images/a.webp', new Uint8Array([1, 2, 3])]]),
    );
    expect(result.written).toEqual(['proposals/prop-1/images/a.webp']);
    expect(readdirSync(join(dir, 'proposals', 'prop-1')).sort()).toEqual([
      'images',
      'proposal.json',
    ]);
    expect(read(dir, 'prop-1')).toEqual(proposal);
    await expect(
      writeNewProposal(roots, location, proposal, new Map()),
    ).rejects.toThrow();
    // A falha não apaga a proposta que já existia.
    expect(read(dir, 'prop-1').id).toBe('prop-1');

    const stored = await listStored(roots, location);
    expect(stored.proposals.map((s) => s.id)).toEqual(['prop-1']);
    expect(stored.broken).toEqual([]);
  });

  it('uma pasta cujo id não bate com o do arquivo é listada como quebrada', async () => {
    const { roots, dir, location, proposal } = setup();
    mkdirSync(join(dir, 'proposals', 'outra'), { recursive: true });
    writeFileSync(
      join(dir, 'proposals', 'outra', 'proposal.json'),
      serializeProposal(proposal),
    );
    const stored = await listStored(roots, location);
    expect(stored.proposals).toEqual([]);
    expect(stored.broken).toEqual([
      { id: 'outra', error: expect.stringContaining('não bate com o da pasta') },
    ]);
  });
});

describe('updateStored', () => {
  it('grava com revision + 1 e não grava se nada mudou', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const same = await updateStored(roots, location, 'prop-1', (p) => p);
    expect(same.revision).toBe(0);
    const updated = await updateStored(roots, location, 'prop-1', (p) => ({
      ...p,
      status: 'withdrawn',
    }));
    expect(updated).toMatchObject({ status: 'withdrawn', revision: 1 });
    expect(read(dir, 'prop-1')).toMatchObject({ status: 'withdrawn', revision: 1 });
  });

  it('se a app grava no meio, relê e tenta de novo, sem perder a decisão dela', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    const change = proposal.changes[0]!;
    let attempts = 0;
    const updated = await updateStored(roots, location, 'prop-1', (p) => {
      attempts++;
      if (attempts === 1) {
        // A app grava uma decisão (revision 1) entre a leitura e a gravação do servidor.
        const decided: Proposal = {
          ...p,
          revision: 1,
          decisions: { [change.id]: { state: 'accepted', at: NOW } },
        };
        writeFileSync(join(dir, proposalFilePath('prop-1')), serializeProposal(decided));
      }
      return { ...p, status: 'superseded' };
    });
    expect(attempts).toBe(2);
    expect(updated).toMatchObject({ status: 'superseded', revision: 2 });
    expect(read(dir, 'prop-1').decisions[change.id]).toMatchObject({ state: 'accepted' });
  });

  it('recusa com revision-conflict se o arquivo não para de mudar', async () => {
    const { roots, dir, location, proposal } = setup();
    await writeNewProposal(roots, location, proposal, new Map());
    let revision = 0;
    const result = updateStored(roots, location, 'prop-1', (p) => {
      revision++;
      writeFileSync(
        join(dir, proposalFilePath('prop-1')),
        serializeProposal({ ...p, revision }),
      );
      return { ...p, status: 'withdrawn' };
    });
    await expect(result).rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(result).rejects.toBeInstanceOf(ToolError);
    // Nada do servidor foi gravado por cima da alteração externa.
    expect(read(dir, 'prop-1').status).toBe('open');
  });

  it('proposta inexistente', async () => {
    const { roots, location } = setup();
    await expect(
      updateStored(roots, location, 'nao-existe', (p) => p),
    ).rejects.toMatchObject({ code: 'proposal-not-found' });
  });
});
