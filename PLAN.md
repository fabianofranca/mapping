# Mapeador de Imagens — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes**. Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1, 1.1, 2 e 2.1 concluídas**; **etapa 2.2 (segunda revisão técnica)** em andamento, fases abaixo. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **desktop primeiro e utilizável no celular**, com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v4)                                       |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual, 13.9) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |

## Etapas futuras (não implementar ainda)

- **Etapa 3 — Servidor MCP:** servidor em Node/TypeScript, no mesmo repositório, que reutiliza `src/model/` para um agente criar projetos, aplicar especializações e adicionar imagens, camadas, marcações e anotações direto na pasta. WebMCP pode vir depois, como adaptador sobre as mesmas funções.
- **Etapa 4 — Editor de especializações:** criar e editar especializações dentro da app.

## Fases pendentes — Etapa 2.2: segunda revisão técnica

> Revisão feita com a etapa 2.1 concluída: lint, typecheck, 946 testes e build passando; orçamentos de desempenho estáveis em execuções seguidas; `npm audit` sem vulnerabilidades; `dist/index.html` com 607 kB (178 kB gzip). Cobertura de linhas: 76% no total (model 97%, canvas 96%, store 93%, storage 71%, ui 56%, **app 7%**).
>
> Regra da etapa: **nenhuma mudança de comportamento visível**, exceto a indicada na Fase 26. Todos os testes verdes e o roteiro da 13.9 (`docs/history/PLAN-etapas-1-2.md`) continuam passando.

### Achados

1. **(P1) A interface inteira renderiza de novo a cada movimento de um gesto.** `store.updateGesture` troca `store.project` a cada `pointermove` (prévia do arrastar/redimensionar). `EditorScreen`, `EditorTopBar`, `EditorPanel`, `EditorDialogs` e `CanvasNotices` leem `store.project.value` diretamente, então renderizam a cada evento do dedo (o canvas está limitado a um quadro por `requestAnimationFrame`, a árvore Preact não). Os `computed` de `store/derived.ts` que dependem do projeto (pendências, indicadores, visibilidade e a Lista, quando aberta lado a lado no desktop) também são recalculados a cada evento, embora mover ou redimensionar não mude nenhuma anotação. O teste `renderPerformance` mede só o canvas, então esse custo não aparece nos orçamentos.
2. **(P2) `src/app/` sem testes unitários (7% de linhas).** `controller.ts` (abrir pasta/local/zip, migração com backup, exportar, fechar) e `useImageIntake.tsx` (adicionar, colar, arrastar, trocar) estão em 0%. O Playwright cobre só caminhos felizes, e só no CI. O caminho "abrir projeto antigo → backup antes de gravar" passa pelo `controller.ts`.
3. **(P2) Desempenho nunca medido num aparelho real.** Os orçamentos rodam em Node e jsdom, e não há como carregar o projeto grande de teste dentro da app.
4. **(P3) Playwright só com Chromium**: toque e armazenamento do Safari do iOS não são exercitados.
5. **(P3) Atualizações maiores disponíveis** (Preact 11, TypeScript 7): **não** atualizar nesta etapa; avaliar depois, num branch próprio.

#### Fase 26 — Projeto confirmado durante gestos (achado 1)

- O store passa a expor **`committed`**: o projeto sem as prévias de gesto. Fora de um gesto, `committed` e `project` são o mesmo objeto; durante o gesto, `committed` fica no projeto do início (`gestureBase`) e só muda no `commitGesture`/`cancelGesture`.
- A **interface** (`Editor*`, painéis, lista, diálogos, avisos) e os `computed` de `derived.ts` que **não dependem de geometria** (pendências, anotações por marcação, indicadores, visibilidade, listagem) leem `committed`. O **canvas** continua lendo `project` para a geometria durante o gesto.
- Componentes que só precisam de uma fatia (ex: "há projeto?", "há seleção?") usam `useComputed`, sem assinar o projeto inteiro.
- **Única mudança visível da etapa:** os campos x/y/largura/altura do painel passam a atualizar **ao soltar**, não durante o arrasto.

- [x] `committed` no store + testes (gesto, commit, cancel, desfazer/refazer)
- [x] `derived.ts` e componentes da interface lendo `committed`; `useComputed` nas fatias
- [x] Teste de contagem de renderizações: arrasto simulado com 30 movimentos renderiza `EditorScreen`, `EditorPanel` e `EditorTopBar` no máximo 2 vezes cada
- [x] `docs/ARCHITECTURE.md` atualizado (projeto confirmado × prévia)

**Aceite**: teste de contagem verde; orçamentos de desempenho mantidos; roteiro 13.9 sem diferenças além dos campos numéricos atualizando ao soltar.

#### Fase 27 — Testes de `src/app/` (achado 2)

- `controller.ts`: abrir projeto v1 em pasta e em local (fixture `tests/fixtures/mapping-v1.json`) → backup gravado antes do primeiro salvamento; zip inválido e zip sem `mapping.json` → erro correto; exportar → zip com `specs/` e sem `backups/`; fechar → `flush` antes de liberar. Usar `memoryFs`, `fake-indexeddb` e os helpers existentes.
- `useImageIntake.tsx`: vários arquivos (progresso e falhas), colar sem imagem, soltar sobre imagem (troca), em área vazia (adiciona) e vários sobre imagem (adiciona todos).

- [ ] Testes do `controller.ts`
- [ ] Testes do `useImageIntake.tsx`

**Aceite**: `src/app/` acima de 60% de linhas no resumo de cobertura do CI.

#### Fase 28 — Ferramentas do preview e medição no aparelho (achados 3 e 4) — opcional

> Opcional desde que o desktop passou a ser o uso principal: fazer só se houver lentidão perceptível no celular.

- Só no canal `preview` (`isPreview`), um item de menu **"Ferramentas"**:
  - **Carregar projeto grande**: cria um projeto local com o fixture de desempenho (500 marcações, 1.500 anotações, 500 referências) e imagens geradas na hora (retângulos coloridos, sem arquivos no repositório);
  - **Medidor**: sobreposição com quadros por segundo do canvas e contagem de renderizações por componente do editor nos últimos 2 s.
- Nada disso entra no build principal (removido em tempo de build via `isPreview`).
- Roteiro de medição no README: com o projeto grande, fazer pan, zoom, arrastar e redimensionar uma marcação, e anotar quadros por segundo e contagens.

- [ ] "Ferramentas" só no preview: projeto grande e medidor + teste garantindo que o build principal não os contém
- [ ] Roteiro de medição no README + resultados do aparelho registrados no PR
- [ ] (Opcional) Projeto `webkit` (celular emulado) no Playwright do CI, com `continue-on-error`

**Aceite**: o menu não existe no build principal; no celular, o projeto grande carrega pelo preview e os números ficam registrados no PR.

> **Dependências**: 26 e 27 são independentes e podem rodar em paralelo. 28 depois da 26 (para medir já com a correção).

## Próximo: redesign da interface

Depois da Fase 26, a interface será redesenhada com o Claude Design (desktop primeiro, utilizável no celular). As fases de implementação serão definidas a partir do resultado do design.
