import JSZip from 'jszip';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deserialize,
  isTextPackageFile,
  parseSpecText,
  parseProposalText,
  parseThreadText,
  serializeThread,
  awaiting,
  resolveAnchor,
  extractCitations,
  resolveCitation,
  toLibraryFiles,
  validateAccepted,
  validateProject,
  type Project,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import {
  EXAMPLE_DIR,
  EXAMPLE_SPECS,
  EXAMPLE_ZIP,
  exampleFiles,
  folderFiles,
} from '../../scripts/exampleProject.mjs';

// `examples/exemplo-completo/` é o projeto de exemplo (a fonte); o zip e o guia (`public/guia/`)
// saem dela. O zip é o que a pessoa baixa do repositório (a app não o embute). Para gerar
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
  it('tem o conteúdo da pasta (fora de specs/) mais o manifesto', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE_ZIP));
    const expected = await exampleFiles();
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      const bytes = Buffer.from((await zip.file(path)?.async('uint8array')) ?? []);
      expect(bytes.equals(content), `${path} difere da vista do exemplo. ${HINT}`).toBe(
        true,
      );
    }
  });

  it('abre como o "Abrir zip": mapping.json válido no schema atual, sem migração', async () => {
    const { project } = await readExample();
    expect(project.schemaVersion).toBe(20);
    expect(project.revision).toBe(1);
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
    const parsed = read.ok
      ? deserialize(read.files.mapping, undefined, read.files.specs)
      : null;
    expect(parsed?.ok && parsed.migratedFrom).toBeNull();
  });

  it('tem 4 imagens, 32 marcações, 42 anotações, 10 camadas e 4 especializações', async () => {
    const { project } = await readExample();
    expect(project.containers).toHaveLength(4);
    expect(project.markings).toHaveLength(32); // 31 nas telas + a nota flutuante da biblioteca de notas
    expect(project.annotations).toHaveLength(42);
    expect(project.layers).toHaveLength(10); // + Notas (a livre virou Dúvidas) e Layout M3
    expect(project.specializations).toHaveLength(4);
  });

  it('tem as perspectivas Dados e Material 3 (Para todos) e a chegada da nota "Cadastro"', async () => {
    const { project } = await readExample();
    const layerId = (name: string) => project.layers.find((l) => l.name === name)?.id;
    const container = (name: string) =>
      project.containers.find((c) => c.name === name)?.id;
    const note = project.markings.find((m) => m.floating);
    expect(note).toBeDefined();
    expect(project.perspectives.map((p) => p.name)).toEqual(['Dados', 'Material 3']);
    const [dados, material] = project.perspectives;
    expect(dados?.items.map((i) => i.root).sort()).toEqual(
      [container('Cadastro'), container('Login'), note?.id].sort(),
    );
    expect([...(dados?.hiddenLayers ?? [])].sort()).toEqual(
      ['Componentes', 'Eventos', 'Dúvidas'].map((n) => layerId(n)).sort(),
    );
    expect(material?.items.map((i) => i.root).sort()).toEqual(
      [container('Configurações'), container('Detalhes do pedido')].sort(),
    );
    expect(material?.hiddenLayers).toEqual([]);
    expect(project.arrivals).toEqual([
      { root: note?.id, from: dados?.id, fromName: 'Dados' },
    ]);
  });

  it('as perspectivas e a chegada não têm aviso de leitura (perspective-*, arrival-*)', async () => {
    const { project } = await readExample();
    const codes = validateProject(project).map((i) => i.code);
    expect(codes.filter((c) => /^(perspective|arrival)-/.test(c))).toEqual([]);
    expect(codes).toEqual([]);
  });

  it('duas telas são fotos e duas são telas em branco; cada foto está no zip', async () => {
    const { project, files } = await readExample();
    const photos = project.containers.filter((image) => image.file !== null);
    expect(photos).toHaveLength(2);
    expect(project.containers.filter((image) => image.file === null)).toHaveLength(2);
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

  it('o pacote material3-compose valida sem erros', async () => {
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
    const report = validateLibrary({
      files: toLibraryFiles('specs/material3-compose', entries),
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('conversas de exemplo (comments/)', () => {
  async function readThreads() {
    const { files, project } = await readExample();
    const threads = [...(files.threads ?? [])].map(([path, text]) => {
      const parsed = parseThreadText(text);
      if (!parsed.ok) throw new Error(`${path}: ${parsed.errors.join('; ')}`);
      return { path, text, thread: parsed.thread };
    });
    return { threads, project };
  }

  it('o zip leva três conversas válidas, canônicas e nos caminhos certos', async () => {
    const { threads } = await readThreads();
    expect(threads).toHaveLength(3);
    for (const { path, text, thread } of threads) {
      const folder = thread.resolved === null ? 'comments' : 'comments/resolved';
      expect(path).toBe(`${folder}/${thread.id}.json`);
      expect(serializeThread(thread), path).toBe(text);
    }
  });

  it('uma aguarda humano (agente, com citação de campo), uma aguarda agente e uma está resolvida', async () => {
    const { threads } = await readThreads();
    const states = threads.map(({ thread }) => awaiting(thread));
    expect(states.filter((s) => s === 'human')).toHaveLength(1);
    expect(states.filter((s) => s === 'agent')).toHaveLength(1);
    expect(states.filter((s) => s === null)).toHaveLength(1);
    const byAgent = threads.find(({ thread }) => awaiting(thread) === 'human')!.thread;
    expect(byAgent.anchor.kind).toBe('field');
    expect(byAgent.messages[0]!.author.kind).toBe('agent');
    expect(byAgent.messages[0]!.text).toContain('mapping://exemplo-completo/m/');
    const resolved = threads.find(({ thread }) => thread.resolved !== null)!.thread;
    expect(resolved.resolved?.by.email).toBe('marina@exemplo.com');
  });

  it('toda citação mapping:// das conversas resolve no projeto (sem broken)', async () => {
    const { threads, project } = await readThreads();
    const all = threads.map(({ thread }) => thread);
    for (const thread of all) {
      for (const m of thread.messages) {
        for (const c of extractCitations(m.text)) {
          expect(c.ref, `${thread.id}: ${c.url}`).not.toBeNull();
          const r = resolveCitation({ project, threads: all, proposals: [] }, c.ref!.ref);
          expect(r.found, `${thread.id}: ${c.url}`).toBe(true);
        }
      }
    }
  });

  it('todas as âncoras existem no projeto e nenhum e-mail é real', async () => {
    const { threads, project } = await readThreads();
    for (const { thread } of threads) {
      expect(resolveAnchor(project, thread.anchor).orphan, thread.id).toBe(false);
      for (const m of thread.messages)
        if (m.author.email !== null) expect(m.author.email).toMatch(/@exemplo\.com$/);
    }
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

describe('especializações do exemplo geradas das fontes', () => {
  it('os file de specializations[] do mapping.json caem em destinos do manifesto', () => {
    const mapping = JSON.parse(
      readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
    ) as { specializations: { file: string }[] };
    const targets = EXAMPLE_SPECS.map((entry) => `specs/${entry.target}`);
    expect(mapping.specializations).toHaveLength(EXAMPLE_SPECS.length);
    for (const { file } of mapping.specializations) {
      const inside = targets.some(
        (target) => file === target || file.startsWith(`${target}/`),
      );
      expect(inside, `${file} não cai em nenhum destino do manifesto`).toBe(true);
    }
  });

  it('a version de cada especialização do mapping.json é a da fonte', () => {
    const mapping = JSON.parse(
      readFileSync(join(EXAMPLE_DIR, 'mapping.json'), 'utf8'),
    ) as { specializations: { id: string; version: number; file: string }[] };
    expect(mapping.specializations.map((s) => s.id).sort()).toEqual([
      'material3-compose',
      'modelo-dados',
      'notas',
      'sdui',
    ]);
    for (const s of mapping.specializations) {
      const entry = EXAMPLE_SPECS.find(
        (e) => s.file === `specs/${e.target}` || s.file.startsWith(`specs/${e.target}/`),
      );
      const rel = s.file.slice(`specs/${entry?.target}`.length).replace(/^\//, '');
      const source =
        rel === '' ? (entry?.source as string) : join(entry?.source as string, rel);
      const src = JSON.parse(readFileSync(source, 'utf8')) as { version: number };
      expect(s.version, `versão de ${s.id} difere da fonte. ${HINT}`).toBe(src.version);
    }
  });

  it('exampleFiles() ignora o specs/ do disco e traz o das fontes', async () => {
    const view = await exampleFiles();
    const paths = [...view.keys()];
    expect(paths).toContain('mapping.json');
    expect(paths).toContain('specs/sdui.json');
    expect(paths).toContain('specs/modelo-dados.json');
    expect(paths).toContain('specs/material3-compose/material3-compose.spec.json');
    expect(paths).toContain('specs/notas/notas.spec.json');
    expect(paths).not.toContain('specs/notas/index.ts');
    const sdui: unknown = JSON.parse(readFileSync('examples/specs/sdui.json', 'utf8'));
    expect(JSON.parse(view.get('specs/sdui.json')?.toString('utf8') ?? 'null')).toEqual(
      sdui,
    );
  });

  it('o .gitignore lista examples/exemplo-completo/specs/', () => {
    const lines = readFileSync('.gitignore', 'utf8')
      .split('\n')
      .map((l) => l.trim());
    expect(lines).toContain('examples/exemplo-completo/specs/');
  });
});

describe('folderFiles ignora lixo de sistema (item 69)', () => {
  it('.DS_Store, Thumbs.db e node_modules não entram', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'folderfiles-'));
    try {
      writeFileSync(join(dir, 'mapping.json'), '{}');
      writeFileSync(join(dir, '.DS_Store'), 'x');
      writeFileSync(join(dir, 'Thumbs.db'), 'x');
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'sub', '.DS_Store'), 'x');
      writeFileSync(join(dir, 'sub', 'a.txt'), 'a');
      mkdirSync(join(dir, 'node_modules'));
      writeFileSync(join(dir, 'node_modules', 'm.js'), 'x');
      const files = await folderFiles(dir);
      expect([...files.keys()]).toEqual(['mapping.json', 'sub/a.txt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
