# Mapeador de Imagens — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes**. Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1, 1.1 e 2 concluídas**; **etapa 2.1 (revisão técnica)** concluída, exceto a fase 25 abaixo. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), mobile-first, com tema claro/escuro e pt-BR/en-US.

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

## Fases pendentes

#### Fase 25 — Documentação e organização
- [x] `README.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md` completo
- [x] `PLAN.md` enxuto + histórico em `docs/history/`
- [x] Teste de consistência entre a ajuda e o `SPEC-FORMAT.md`
- [x] `global.css` dividido por área

**Aceite**: um agente sem acesso ao histórico consegue entender o schema atual só pelo `docs/FORMAT.md`; o visual da app não muda.
