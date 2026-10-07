# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, as da etapa 3a). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1, 1.1, 2, 2.1, 2.2, 2.3 (redesign da interface) e 2.4 (privacidade garantida por CSP) concluídas**; **etapa 2.5 (trava de marcações e imagens) concluída**, detalhada abaixo (sai deste arquivo para `docs/history/` quando o PR for aceito). A **etapa 3a (servidor MCP, base)** está em andamento, detalhada abaixo; as demais (3b e 4) estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **desktop primeiro e utilizável no celular**, com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v5)                                       |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual, 13.9) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 movida para Evoluções) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das etapas (2.5, 3, 4), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |

## Etapa 2.5 — Trava de marcações e imagens

Objetivo: proteger marcações e imagens já revisadas contra alterações acidentais, sem impedir a navegação nem a seleção. Decisões: ver a descrição do PR.

- [x] **F1. Schema v5 e modelo** — `locked` em imagens e marcações, migração (`false`), regras em `src/model/locks.ts` (mover, redimensionar e excluir bloqueados; pai trancado trava a geometria dos descendentes; descendente trancado não impede o pai: mover o leva junto e excluir o pai o exclui), testes.
- [x] **F2. Store e estado derivado** — actions de trancar/destrancar (uma entrada de desfazer, inclusive "trancar todas") e conjunto derivado de marcações com geometria trancada.
- [x] **F3. Canvas** — sem alças no item trancado, cadeado na seleção e sob o cursor, cursor "não permitido", segurar no celular não pega o item trancado.
- [x] **F4. Interface** — cadeado na Árvore e em Detalhes, "Trancar todas as marcações desta imagem", atalho de teclado na Ajuda, textos pt-BR/en-US.
- [x] **F5. Ajustes** — `.gitignore` com `backups/` ao criar projeto em pasta, texto sobre git na tela inicial, ajuda e lista vazia em "Pertence a", testes de `useEditorShortcuts`.
- [x] **F6. Documentação e verificação** — `FORMAT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, e2e e PR.

## Fases pendentes — Etapa 3a

> Pré-requisito: renomeação para **Mapping** concluída (o prompt dela também registra as decisões técnicas no `docs/ROADMAP.md`).
>
> A etapa 3b (referências de código: plataformas e `code` nas especializações, campo `codeRef`, repositório por plataforma) fica para um plano próprio, depois desta.

### Objetivo

Um agente (Claude Code, Claude Desktop ou outro cliente MCP) consegue ler e alterar projetos Mapping guardados em pasta, com as mesmas regras da app. O dev cola uma referência copiada da app no chat, e o agente encontra a marcação, entende suas anotações e vê o recorte da imagem.

### Decisões

- **Servidor local em TypeScript**, por stdio, rodando no Node (≥ 20 LTS). Lê e grava direto na pasta do projeto, **sempre pelo `src/model/`** (invariantes, migrações, travas, referências, especializações).
- **Mapeamentos dentro do repositório do app** (ex: `design/mapeamentos/`). Um `.mcp.json` versionado registra o servidor:

  ```json
  {
    "mcpServers": {
      "mapping": {
        "command": "node",
        "args": ["tools/mapping-mcp.js", "--root", "design/mapeamentos"]
      }
    }
  }
  ```

  `--root` pode se repetir. Caminhos relativos ao diretório de trabalho do cliente.
- **Distribuição**: arquivo único `mapping-mcp.js` (com as dependências e o WebAssembly embutidos), publicado nas Releases do GitHub. Cada repositório de app guarda uma cópia em `tools/`.
- **Só projetos em pasta** ficam ao alcance do MCP. Projetos guardados no navegador, não.
- **Segurança**: o servidor só lê e grava dentro das raízes configuradas (rejeita `..`, links simbólicos para fora e caminhos absolutos fora das raízes), não faz nenhuma requisição de rede e grava de forma atômica (arquivo temporário + renomear).
- **Seleção única** para "Copiar referência". Seleção múltipla não faz parte desta etapa.

### Referências copiáveis

Formato: `mapping://<projeto>/<m|i|a>/<código> (<caminho legível>)`

- `<projeto>`: nome da pasta do projeto. O MCP procura a pasta em todas as raízes (em qualquer profundidade); se houver mais de uma com o mesmo nome, devolve as candidatas e pede o caminho.
- `<m|i|a>`: marcação, imagem ou anotação.
- `<código>`: os 8 primeiros caracteres hexadecimais do id (sem hífens). Se dois itens do mesmo tipo no projeto começarem igual, usa 12, depois 16, até ficar único. Função pura `shortCode(project, kind, id)` no `src/model/`, usada pela app e pelo MCP.
- `(<caminho legível>)`: só para leitura humana (ex: `Lateral › Porta dianteira`). O MCP ignora.
- Funções puras `formatRef` e `parseRef` no `src/model/`. Toda tool que recebe um item aceita a referência completa, só `m/3f2a9c1e` com o projeto informado à parte, ou o id completo.

Na app:
- **Ctrl+C (Cmd+C no macOS) copia a referência** do item selecionado (imagem ou marcação), quando o foco não está num campo de texto e não há texto selecionado na página. Nesses casos, o copiar continua o nativo. Se o foco estiver num cartão de anotação nos Detalhes (fora dos campos), copia a referência da anotação. Aviso curto: "Referência copiada".
- O Ctrl+C grava na área de transferência o texto da referência (`text/plain`) e, além dele, os dados do item num formato próprio da app (formato web personalizado, ignorado por outros programas), para permitir no futuro duplicar itens com Ctrl+C / Ctrl+V dentro da app. Nesta etapa, o Ctrl+V da app continua só colando imagens.
- **"Copiar referência"** também no menu da linha da Árvore, ao lado do id nos Detalhes e no menu de contexto do canvas (para o celular e para quem prefere clicar).
- **"Copiar recorte"** (atalho **Ctrl+Alt+C**, e nos mesmos menus): copia como PNG o recorte da marcação selecionada (em pixels da imagem original, reduzido a no máximo 2048 px no lado maior). Não usar Ctrl+Shift+C, que abre as ferramentas de desenvolvedor no Chrome. O recorte não vai junto no Ctrl+C, para o resultado ao colar ser previsível (texto no terminal e no chat).
- Os dois atalhos aparecem na Ajuda → Atalhos.
- Disponível só em projetos abertos de uma pasta (é o que o MCP alcança).

### Revisão e mudanças externas (schema v6)

- `mapping.json` ganha `revision` (inteiro). Migração v5 → v6 com `revision: 0` (com o backup que já existe).
- **Toda gravação** (app ou MCP) relê a `revision` do arquivo antes de gravar. Se for igual à que foi carregada, grava com `revision + 1`. Se for diferente, alguém mudou o arquivo por fora:
  - **MCP**: recusa a gravação com um erro claro ("o projeto foi alterado por outro processo; releia e gere um novo plano").
  - **App**: abre o diálogo "Projeto alterado fora da app" com **Recarregar** (descarta as alterações locais ainda não gravadas) ou **Manter as minhas** (grava por cima, com a revisão nova).
- **A app percebe mudanças externas** mesmo sem gravar: em projetos de pasta, confere `lastModified` e `revision` do `mapping.json` a cada ~3 s enquanto a janela estiver visível, e ao voltar o foco. Sem alterações locais pendentes, recarrega sozinha e mostra um aviso discreto ("Projeto atualizado por fora"), preservando seleção, camadas visíveis e viewport quando os itens ainda existirem.
- Imagens adicionadas ou trocadas por fora são recarregadas (invalidar o cache de bitmaps dos arquivos alterados).

### Ferramentas do MCP

Nomes em inglês. Respostas em JSON compacto, sempre com as referências `mapping://` dos itens retornados.

**Leitura**
- `list_projects()` — projetos encontrados nas raízes: nome, caminho relativo, contagens, especializações aplicadas.
- `create_project(path, name)` — cria a pasta (dentro de uma raiz) com `mapping.json`, `images/` e `.gitignore`.
- `get_project(project)` — resumo: imagens, camadas, especializações, contagens, pendências.
- `list_markings(project, filtros)` — filtros por imagem, camada, tipo de anotação, incompletas, texto (nome, chaves e valores). Linhas compactas com referência e caminho.
- `get_marking(ref)` — tudo sobre a marcação: caminho, imagem, `rect` em pixels, trava, filhas, anotações por camada (próprias, herdadas com a origem, árvore de vínculos), referências de saída resolvidas, backlinks e pendências.
- `get_annotation(ref)`, `get_image(ref)`, `resolve(ref)`.
- `get_specialization(project, specId)` — o JSON completo da especialização aplicada (inclui descrições e orientações), para o agente aprender os tipos.

**Imagens** (biblioteca de imagem em WebAssembly, embutida no arquivo único)
- `get_marking_image(ref, { padding, mode, outlineChildren, maxSize })`
  - `mode: "crop"` (padrão): só o recorte, com `padding` opcional em pixels;
  - `mode: "context"`: a imagem inteira com a marcação destacada;
  - `outlineChildren`: contorna as filhas com cores diferentes e devolve, em texto, a legenda cor → nome → referência;
  - `maxSize` (padrão 1568 px no lado maior) para não gastar contexto do agente à toa.
- `get_image_file(ref, { maxSize })` — a imagem inteira, reduzida.

**Escrita em lote, com prévia**
- `plan_changes(project, operations[])` valida todas as operações juntas contra o `src/model/` (sem gravar nada) e devolve: válido ou não, erros por operação, um resumo legível do que vai mudar e um `planId` (vinculado à `revision` atual; expira em 10 min).
- `apply_changes(planId)` aplica tudo de uma vez, grava com a revisão nova e devolve as referências dos itens criados.
- Operações: camadas (criar, alterar, excluir, reordenar); especializações (aplicar a partir de um arquivo dentro das raízes, atualizar versão, remover com `delete` ou `convert`); imagens (adicionar a partir de um arquivo ou base64, com a mesma otimização da app — lado maior 2560 px, WebP —, alterar nome e posição, trocar, excluir); marcações (criar com `rect` em pixels da imagem e pai opcional, alterar, excluir, trancar); anotações livres e tipadas (criar, alterar nome, pares ou valores, vínculo com dona, herança, excluir).
- Dentro de um lote, itens criados podem ser referenciados por apelidos temporários (`"$porta"`), para criar marcação, anotação e evento vinculado numa chamada só.
- Itens trancados seguem as regras da trava: o lote é recusado se tentar mover, redimensionar ou excluir um item trancado.

**Recursos MCP** (documentação para o agente)
- `docs/FORMAT.md`, `docs/SPEC-FORMAT.md` e um novo `docs/AGENT-GUIDE.md` (como usar as tools: fluxo típico, referências, lote com prévia, boas práticas de recorte).

### Estrutura no repositório

- Código do servidor em `mcp/` (fora de `src/`), com tsconfig próprio. Pode importar `src/model/`; **não pode** importar `src/ui`, `src/canvas`, `src/app` nem `src/storage` (regra no ESLint).
- Lógica pura que hoje está fora do `src/model/` e o MCP precisa (ex: decisão de tamanho e formato da otimização de imagens) vai para o `src/model/`, sem mudar comportamento.
- Build do servidor com esbuild (ou tsup) para `dist-mcp/mapping-mcp.js`, alvo Node 20, arquivo único com o WebAssembly embutido.

### Fases

#### 3a.1 — Base compartilhada (modelo)
- [ ] Schema v6 com `revision` + migração
- [ ] `shortCode`, `formatRef`, `parseRef` no `src/model/` + testes (colisões, os três tipos, formatos aceitos)
- [ ] Lógica pura de otimização de imagem movida para o `src/model/` (se ainda não estiver)
- [ ] Estrutura `mcp/` com tsconfig, regra de ESLint de importação e build do arquivo único (servidor vazio respondendo `list_projects`)

**Aceite**: testes do modelo verdes; `npm run build:mcp` gera `dist-mcp/mapping-mcp.js` que inicia por stdio.

#### 3a.2 — App: revisão, mudanças externas e cópias
- [ ] Gravação com conferência de `revision` + diálogo "Projeto alterado fora da app"
- [ ] Detecção de mudança externa em projetos de pasta, recarga automática sem pendências locais e invalidação de bitmaps
- [ ] Ctrl+C / Cmd+C copiando a referência (imagem, marcação, anotação em foco), sem interferir no copiar de campos de texto e de texto selecionado; formato próprio da app gravado junto
- [ ] "Copiar referência" nos menus (Árvore, Detalhes, canvas) e "Copiar recorte" (Ctrl+Alt+C e menus)
- [ ] Textos pt-BR/en-US e Ajuda → Atalhos

**Aceite**: editar o `mapping.json` por fora com a app aberta faz a app recarregar; editar dos dois lados abre o diálogo; com uma marcação selecionada, Ctrl+C e colar num editor de texto produz a referência no formato definido; com o foco num campo de texto, Ctrl+C copia o texto do campo; o recorte colado num chat aparece como imagem.

#### 3a.3 — MCP: leitura
- [ ] Raízes, segurança de caminhos e descoberta de projetos
- [ ] `list_projects`, `create_project`, `get_project`, `list_markings`, `get_marking`, `get_annotation`, `get_image`, `resolve`, `get_specialization`
- [ ] Recursos MCP com a documentação + `docs/AGENT-GUIDE.md`

**Aceite**: testes de integração que sobem o servidor por stdio com o cliente do SDK MCP, sobre uma pasta temporária com o projeto de teste do roteiro 13.9, e conferem cada tool, inclusive herdadas, vínculos, referências e backlinks em `get_marking`; caminhos fora das raízes são recusados.

#### 3a.4 — MCP: imagens
- [ ] Decodificação, recorte, destaque, contorno das filhas e codificação em WebAssembly
- [ ] `get_marking_image` e `get_image_file`

**Aceite**: testes com imagens de fixture (PNG, JPEG, WebP) conferindo dimensões, `padding`, `maxSize` e a legenda das filhas; o arquivo único continua funcionando sem instalar nada além do Node.

#### 3a.5 — MCP: escrita em lote
- [ ] `plan_changes` e `apply_changes` com todas as operações, apelidos temporários e conferência de `revision`
- [ ] Adição de imagens com a otimização da app

**Aceite**: testes criando, pelo MCP, o projeto inteiro do roteiro 13.9 (imagens, especializações, marcações, anotações tipadas, eventos vinculados, referências); o resultado abre na app sem pendências inesperadas; um lote com uma operação inválida não grava nada; um lote sobre uma `revision` desatualizada é recusado.

#### 3a.6 — Distribuição e documentação
- [ ] Workflow que, ao criar uma tag `mcp-v*`, gera o `mapping-mcp.js` e o anexa à Release
- [ ] `docs/MCP.md`: instalação, `.mcp.json`, raízes, referência das tools, formato das referências, solução de problemas
- [ ] README e ROADMAP atualizados

**Aceite**: num repositório de teste, copiar o arquivo da Release para `tools/` e o `.mcp.json` de exemplo basta para o Claude Code listar as tools e ler um projeto.

> **Ordem e paralelismo**: 3a.1 primeiro. Depois, em paralelo, 3a.2 (app) e 3a.3 (MCP leitura). Depois, em paralelo, 3a.4 e 3a.5. Por último, 3a.6.

## Etapas futuras

A ordem das próximas etapas está em [`docs/ROADMAP.md`](docs/ROADMAP.md). O detalhamento das fases entra aqui quando a etapa começar (a 3a já está detalhada acima).
