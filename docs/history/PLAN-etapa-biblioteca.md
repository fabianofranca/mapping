# Histórico — Etapa Biblioteca (seção do antigo PLAN.md)

> **RASCUNHO do Fechamento (parte 1).** Fases B1 a B5 mescladas em `epic/biblioteca` (PRs #169 a #175). Falta a rodada do Cowork nos roteiros R3, R9, R10 e A18; quando o relato chegar, os achados entram em "Rodada do Fechamento", a seção do plano (B1 a B5 e Fechamento, com os checkboxes) é movida do `PLAN.md` para cá sem alterações de conteúdo, e o arquivo deixa de ser rascunho.

---

## Decisões consolidadas dos PRs

### #169 — Plano da etapa (B1 a B5) e laboratório no histórico

- Motor puro em `src/model/components/` (B1); partes com Konva ou navegador em `src/canvas/components/` e `src/storage/fonts.ts` (B3).
- Parser do componente escrito à mão (estrito), não com zod; devolve o formato do `parseSpec`.
- Chaves novas da `formatVersion` 4: `component`, `doc`, `examples`, `fonts`, `origins`, `migrations`; `path`, `slot` e `ignore` em `sources`.
- Aplicar uma biblioteca copia a pasta inteira para `specs/<id>/`; as versões 1 a 3 seguem em `specs/<id>.json`.
- Contrato de versão: mudança aditiva ou quebra; `migrations` declarativas; toda quebra exige migração.
- Conteúdo maior que o slot ou a tela só **avisa** (pendência derivada), sem recortar nem recusar.
- Ordem entre irmãs = ordem do array `markings`, com ação de reordenar e sem campo novo.
- Markdown próprio e restrito (`src/model/markdown.ts`, sem `innerHTML`); `TypedForm` extraído; o Material 3 vira `examples/libraries/material3/`, gerado e conferido por teste.
- Dúvidas ao dono: avisar ou recusar; ordem B2 antes de B3; teste com o JSON real do backend (pendente).

### #170 — B1: formato da biblioteca

- `arrange.ts` e `screen.ts` foram junto para `src/`; `renderScene.ts` e `fonts.ts` ficaram no laboratório até a B3.
- `origins` com fonte única da verdade (`parseOrigins` num `superRefine` do `spec.ts`); `dist/index.html` +51 kB (1.049.712 → 1.100.792 B), 460 KiB de folga no orçamento de 1,5 MiB.
- `isPackagePath` em `src/model/packagePaths.ts` (evita ciclo).
- Exemplos em dois modos (`values`, ou `system` + `file`); tela de exemplo em `origins[].examples`; `table` e `ref` não são aceitos em exemplo.
- Fora do contrato de versão: camada, `labelField`, `allowedChildren`, `requiresOwner`, `description`, `tags`, `code`, `platforms`, `sources`, `doc`.
- Material 3: 0 erros e 42 avisos fixados por teste (2 fontes ausentes, 40 de conteúdo maior que a caixa; a medida fora do navegador é aproximada).
- Motor e validador não exportados por `src/model/index.ts` até B2/B3; ESLint com bloco por profundidade para `src/model/components/`.
- Defeitos achados: preview dos containers citava campos inexistentes (corrigido); mudança de coluna de `table` era quebra impossível de cobrir (passos aceitam `tabela.coluna`).
- Para a B3: o aviso "fill dentro de hug" só em column hug; uniformizar.

### #171 — B2: validação pelas três portas (app, MCP 0.5.0, skill)

- `.json` v4 isolado só é validado, não aplicado (pede pasta ou zip); idem `apply`/`update_specialization` em propostas (`package-spec-unsupported`); pacote por proposta ficou para a B4.
- Layout em disco: pacote → `specs/<id>/<nome>`; arquivo único → `specs/<id>.json`.
- Cache do pacote na sessão por `id@versão`; troca de pasta = `removeSpecDir` + regravação (falha no meio deixa pasta incompleta, sem gravar o `mapping.json`).
- Seletor de pasta em modo leitura; ocultos e `__MACOSX` ignorados; pasta-raiz única removida.
- Os 40 avisos de desenho aparecem só na revisão do pacote; o Diagnóstico usa os níveis 1 e 2.
- Limites: app 500 arquivos / 64 MB; MCP 2000 arquivos / 32 MB de texto.
- Pendente: teste com o JSON real do backend (o aceite do marco depende dele); e2e e seletor de pasta em Chrome real não rodados.

### #172 — B3: telas com componentes na app (schema v10; MCP 0.5.0)

- Desenha a primeira anotação tipada própria cujo tipo tem componente; herdadas não desenham. O filtro "sem anotação" não se aplica a marcação que desenha.
- Ordem entre irmãs: `reorderMarking` / `move_marking`; a trava não impede; na proposta, `position` só aparece se a ordem relativa muda (criada antes de irmã gera `position` com `from: null`).
- Arrumar: container escolhido e internos; `hug` remedidos (nunca abaixo de `minSize`), fixas/`fill` mantêm o eixo principal, `stretch` estica o cruzado; a trava impede; sem mudança, sem undo; nunca na carga, no MCP ou ao aplicar proposta.
- `minSize`: criar e definir retângulo recusam abaixo; ajuste fino e gesto prendem.
- "Não cabe" = pendência `component-overflow`, só avisa. Medidor aproximado até o canvas montar, Konva depois; o MCP é sempre aproximado.
- Tela em branco: cor e tamanho editáveis, não troca por foto, sem "Copiar recorte", só criada no editor; `get_marking_image` devolve desenho simplificado.
- Janela Biblioteca à esquerda (atalho 8), que vira aba do Catálogo na B5. Zoom semântico sem cartão nem nome.
- **Decisões do dono:** uma versão do MCP por épico (0.5.0); snapshot por PR; rc só na última fase via rótulo `mcp-rc`; preview automático a cada PR pelo Deploy existente (Pages só aceita deploy da `main`); roteiros principais executáveis pelo Cowork sozinho, R0.5 e R6.2 viraram sob demanda (RF/RA, RA com e2e); limite de passo do guia 1.200 → 1.300.
- Orçamentos: quadro inteiro 24 ms; editar campo e zoom 16 ms.
- Em aberto (levados adiante): especialização aplicada no mesmo lote MCP não enxerga componentes; hover só com a roda; preview com build antigo (não reproduzido); `click_button` do dialog-pilot acerta botões de outras abas; observações de layout a 1098 px; `move_marking` para o índice atual é silencioso; temporário `.proposal.json.*.tmp`; `csp.spec.ts` oscila localmente.
- Achados do Cowork (3 rodadas) corrigidos: componente desenhado com "Ocultar sem anotação", Arrumar remede `hug`, slot do Row sem tracejado, sem sobreposição nem rolagem horizontal a 1098 px, plural "1 mudança aplicada".

### #174 — B4: atualização da biblioteca (migrações, impacto, `plan_library_update`)

- Contrato só na v4 com cópia aplicada; v1–v3 sem `migrations` (inválido vira pendência); sem cópia aplicada não compara, mas a cadeia roda.
- Pendência em vez de perda: `map-values` deixa `unknown-option`; `fill-field` troca por `default` só o valor inválido (`invalid-value`, conta como perda).
- `rename-field` reescreve as refs em todo o projeto; entre formas diferentes apaga a origem e conta perda.
- `rename-type` não troca a camada (pendência `layer-mismatch`); `remove-type` com `delete` apaga as anotações vinculadas, cada uma é perda.
- Atualização aditiva mantém o diálogo do pacote (validação), sem seção de impacto.
- Pacote copiado, não movido (fica na pasta da proposta; o zip só leva enquanto não aplicada).
- A visão Proposto não desenha componentes novos (limitação conhecida).
- `readSpecInput` do MCP procura primeiro na pasta do projeto, depois nas raízes.
- MCP segue 0.5.0; ferramenta nova `plan_library_update`; erros `invalid-library` e `spec-missing-migrations`; sai `package-spec-unsupported`.
- Pedidos do dono: o Deploy grava `deploy.json` com o commit da `main` publicado, roda os checks da `main` só se mudou e, se falharem, republica a produção do commit publicado e o preview sai (sem `deploy.json`, falha bloqueia como antes); guia do testador com aba em foco via link clicado de aba de apoio e `relato.md` sempre em disco e anexado no fechamento.

### #175 — B5: Catálogo

- A janela `library` foi substituída por `catalog` (Ctrl+Shift+9; o 8 ficou vago; layouts salvos migram; trocar = constante em `src/store/toolWindows.ts` + textos).
- Links nos documentos: `mapping://<specId>/<typeId>` (ou `mapping://<typeId>`); destino desconhecido avisa e não navega.
- Playground e galeria seguem o `sizing`: `hug` medido (de `minSize` ao dobro de `size`); `fill` e números ficam no `size`. Fora de projeto, campos `ref` desabilitados.
- Página do componente em diálogo grande no editor; na tela inicial, lista e página lado a lado; mais de um pacote → seletor de biblioteca. Textos em `src/i18n/catalog.ts`.
- Rodada R10 do Cowork: 8/8 ok, 2 achados baixos corrigidos (rótulo cortado no playground: largura ou altura digitada fixa o eixo até "Restaurar valores"; tabelas do Catálogo sem palavras partidas e com rolagem horizontal). Observações: navegar abre no topo; "Destino não encontrado" fixo no topo.
- Guia do testador: link da aba em foco fixo (`elementFromPoint`), "Disco primeiro", regra do navegador e do link de PR, "Primeiros 10 minutos", preparo do R10 sem projeto telas, console lido ao abrir a aba. Sugestão ao Fechamento: Cowork com modelo mais leve, só com o link do PR, para validar "Primeiros 10 minutos".

---

## Rodada do Fechamento (R3, R9, R10 e A18)

_A preencher quando o relato chegar (parte 2): build testado, resultado por roteiro, achados e destino de cada um (fase, etapa de correção ou "sob demanda")._

## O que ficou para depois

_A preencher na parte 2, a partir do relato e das pendências acima (JSON real do backend, campos de tabela, props no próprio nó, vários slots por componente)._
