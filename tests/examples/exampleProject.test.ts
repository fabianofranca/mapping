import JSZip from 'jszip';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deserialize,
  isTextPackageFile,
  parseSpecText,
  parseProposalText,
  toLibraryFiles,
  validateAccepted,
  type Project,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import { EXAMPLE_DIR, EXAMPLE_ZIP, exampleFiles } from '../../scripts/exampleProject.mjs';

// `examples/exemplo-completo/` é o projeto de exemplo (a fonte); o zip e o guia (`public/guia/`)
// saem dela. A app embute o zip no botão "Abrir projeto de exemplo" da tela inicial. Para gerar
// o zip de novo: `npm run build:example`.

const HINT = 'Rode `npm run build:example` para regerar examples/exemplo-completo.zip.';

async function readExample() {
  const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
  if (!read.ok) throw new Error(`zip ilegível: ${read.error}`);
  const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
  if (!parsed.ok) throw new Error(`mapping.json inválido: ${parsed.error.code}`);
  return { files: read.files, project: parsed.project };
}

describe('zip do projeto de exemplo', () => {
  it('tem o conteúdo da pasta examples/exemplo-completo/', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE_ZIP));
    const expected = await exampleFiles(EXAMPLE_DIR);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      const bytes = Buffer.from((await zip.file(path)?.async('uint8array')) ?? []);
      expect(bytes.equals(content), `${path} difere da pasta. ${HINT}`).toBe(true);
    }
  });

  it('abre como o "Abrir zip": mapping.json válido no schema atual, sem migração', async () => {
    const { project } = await readExample();
    expect(project.schemaVersion).toBe(11);
    expect(project.revision).toBe(1);
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
    const parsed = read.ok
      ? deserialize(read.files.mapping, undefined, read.files.specs)
      : null;
    expect(parsed?.ok && parsed.migratedFrom).toBeNull();
  });

  it('tem 4 imagens, 31 marcações, 41 anotações, 8 camadas e 3 especializações', async () => {
    const { project } = await readExample();
    expect(project.images).toHaveLength(4);
    expect(project.markings).toHaveLength(31);
    expect(project.annotations).toHaveLength(41);
    expect(project.layers).toHaveLength(8);
    expect(project.specializations).toHaveLength(3);
  });

  it('duas telas são fotos e duas são telas em branco; cada foto está no zip', async () => {
    const { project, files } = await readExample();
    const photos = project.images.filter((image) => image.file !== null);
    expect(photos).toHaveLength(2);
    expect(project.images.filter((image) => image.file === null)).toHaveLength(2);
    for (const image of photos)
      expect(files.images.has(image.file ?? ''), image.name ?? '').toBe(true);
  });

  it('as especializações citadas estão nas cópias de specs/', async () => {
    const { project, files } = await readExample();
    for (const spec of project.specializations) {
      expect(files.specs.has(spec.file), spec.file).toBe(true);
    }
  });

  it('toda anotação tipada usa um tipo que a especialização do projeto declara', async () => {
    const { project, files } = await readExample();
    const typeIds = new Map<string, Set<string>>();
    for (const entry of project.specializations) {
      const parsed = parseSpecText(files.specs.get(entry.file) ?? '');
      if (!parsed.ok) throw new Error(`${entry.file}: ${parsed.errors.join('; ')}`);
      typeIds.set(
        entry.id,
        new Set(parsed.spec.layers.flatMap((l) => l.annotationTypes.map((a) => a.id))),
      );
    }
    const typed = project.annotations.filter((a) => a.type !== null);
    expect(typed.length).toBeGreaterThan(20);
    for (const a of typed) {
      const { specId, typeId } = a.type!;
      expect(typeIds.get(specId)?.has(typeId), `${specId}/${typeId}`).toBe(true);
    }
  });

  it('o pacote Material 3 valida sem erros', async () => {
    const { files } = await readExample();
    const entries: { path: string; text?: string }[] = [...files.specs].map(
      ([path, text]) => ({ path, text }),
    );
    for (const [path, blob] of files.specAssets ?? []) {
      if (files.specs.has(path)) continue;
      entries.push(
        isTextPackageFile(path) ? { path, text: await blob.text() } : { path },
      );
    }
    const report = validateLibrary({ files: toLibraryFiles('specs/material3', entries) });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('proposta de exemplo', () => {
  async function readProposal(project: Project) {
    const { files } = await readExample();
    const entries = [...files.proposals];
    expect(entries).toHaveLength(1);
    const [path, text] = entries[0]!;
    const parsed = parseProposalText(text);
    if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
    expect(path).toBe(`proposals/${parsed.proposal.id}/proposal.json`);
    expect(parsed.proposal.baseRevision).toBe(project.revision);
    return parsed.proposal;
  }

  it('é válida, está aberta, sem decisões, e aceitar tudo dá um projeto válido', async () => {
    const { project } = await readExample();
    const proposal = await readProposal(project);
    expect(proposal.status).toBe('open');
    expect(proposal.title).toBe('Tela de Perfil e ajuste no Cadastro');
    expect(proposal.changes.length).toBeGreaterThan(5);
    expect(Object.keys(proposal.decisions)).toEqual([]);
    const all = Object.fromEntries(
      proposal.changes.map((c) => [c.id, { state: 'accepted' as const, at: 'x' }]),
    );
    expect(validateAccepted(project, { ...proposal, decisions: all }).ok).toBe(true);
  });
});

describe('cópias do exemplo × fontes', () => {
  const SYNC_HINT =
    'o exemplo está desatualizado: copie a fonte para examples/exemplo-completo/specs/ ' +
    '(pacote de examples/libraries/material3, specs de examples/specs) e rode ' +
    '`npm run build:example` e `npm run build:guia`.';

  function listFiles(root: string, dir = ''): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...listFiles(root, rel));
      else out.push(rel);
    }
    return out.sort();
  }

  function sameFile(copy: string, source: string, label: string) {
    if (copy.endsWith('.json')) {
      const a: unknown = JSON.parse(readFileSync(copy, 'utf8'));
      const b: unknown = JSON.parse(readFileSync(source, 'utf8'));
      expect(a, `${label} difere da fonte. ${SYNC_HINT}`).toEqual(b);
    } else {
      const same = readFileSync(copy).equals(readFileSync(source));
      expect(same, `${label} difere da fonte. ${SYNC_HINT}`).toBe(true);
    }
  }

  it('specs/material3/ tem os mesmos arquivos e o mesmo conteúdo de examples/libraries/material3/', () => {
    const copy = join(EXAMPLE_DIR, 'specs/material3');
    const source = 'examples/libraries/material3';
    expect(listFiles(copy), `lista de arquivos diferente. ${SYNC_HINT}`).toEqual(
      listFiles(source),
    );
    for (const rel of listFiles(source))
      sameFile(join(copy, rel), join(source, rel), rel);
  });

  it.each([
    ['sdui.json', 'examples/specs/sdui.json'],
    ['modelo-dados.json', 'examples/specs/modelo-de-dados.json'],
  ])('specs/%s tem o conteúdo de %s', (name, source) => {
    sameFile(join(EXAMPLE_DIR, 'specs', name), source, name);
  });

  it('a version de cada especialização do mapping.json é a da fonte', () => {
    const mapping = JSON.parse(
      readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
    ) as {
      specializations: { id: string; version: number; file: string }[];
    };
    const sources: Record<string, string> = {
      sdui: 'examples/specs/sdui.json',
      'modelo-dados': 'examples/specs/modelo-de-dados.json',
      material3: 'examples/libraries/material3/material3.spec.json',
    };
    expect(mapping.specializations.map((s) => s.id).sort()).toEqual(
      Object.keys(sources).sort(),
    );
    for (const s of mapping.specializations) {
      const src = JSON.parse(readFileSync(sources[s.id] as string, 'utf8')) as {
        id: string;
        version: number;
      };
      expect(s.version, `versão de ${s.id} difere da fonte. ${SYNC_HINT}`).toBe(
        src.version,
      );
    }
  });
});
