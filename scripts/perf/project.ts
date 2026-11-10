// Projeto do `npm run perf:canvas`: a mesma receita do cenário "projeto inteiro à vista" dos testes
// (tests/model/scenarioProject.ts), com containers de fundo sem arquivo, para a app abrir a pasta sem
// imagens. Empacotado pelo esbuild em `scripts/perf/canvas.mjs`.
import { serialize, type Project } from '../../src/model';
import { material3Files, scenarioProject } from '../../tests/model/scenarioProject';

export interface PerfOptions {
  /** Número de setas (padrão: metade das marcações). */
  readonly arrows?: number;
  /** Acrescenta a tela `M3_SCREEN` em cada container. */
  readonly components?: boolean;
}

export function perfProject(size: number, options: PerfOptions = {}): Project {
  return scenarioProject({ size, backgrounds: true, ...options });
}

/** `mapping.json` do projeto, com a revisão 1 que a app espera de um arquivo já gravado. */
export function perfMappingJson(size: number, options: PerfOptions = {}): string {
  return serialize({ ...perfProject(size, options), revision: 1 });
}

/** Arquivos da biblioteca do Material 3 (`specs/material3/...`), em base64, para gravar na pasta. */
export function perfLibraryFiles(): { path: string; base64: string }[] {
  return material3Files().map((f) => ({
    path: f.path,
    base64: Buffer.from(f.bytes).toString('base64'),
  }));
}
