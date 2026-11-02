# Histórico — Etapa Sincronia do design system (seção do antigo PLAN.md)

> Fases DS1 e DS2 concluídas no épico `epic/sincronia-ds` (o épico é o PR #287, a DS1 o #290, a DS2 o #292 e o fechamento um PR sem número). Origem: pedido do dono em 2026-11-02. Sem schema, formato de especialização, de proposta nem de componente novos, e sem MCP novo (schema v13 e MCP 0.12.0 continuam).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa) e o tempo verbal do título. Depois dela vêm as decisões consolidadas dos PRs, os números conferidos, os erros que a própria etapa corrigiu, os achados colaterais e o que ficou para depois.

---

## Etapa — Sincronia do design system (épico `epic/sincronia-ds`)

- **Objetivo:** o dono pediu (2026-11-02) um processo em que os planos verifiquem, fase a fase, se o design system precisa de atualização. O DS do projeto é o artefato **Mapping** do Claude Design (<https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9>), curado à mão: 63 componentes com guia e preview (mais a capa), 6 seções (Canvas, Layouts, Atalhos, Contraste, Conceitos, Revisão), os tokens e 85 ícones. Hoje ele não tem dono no repositório — a URL só aparece em três documentos históricos do `docs/redesign/` — e sua última alteração é de 2026-10-24, quatro etapas atrás. A etapa dá ao DS um registro vivo no repositório, uma verificação por fase, uma atualização por épico, e o põe em dia.
- **Depende de:** nada. O branch do épico nasce da `main` atualizada, que já tem as etapas Proposto com componentes, Sugestões no campo, Imagens remotas e Biblioteca Material 3 (PR #260), além do `wrapItems` da Marcação pai.
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e **sem MCP novo** (a versão do servidor não muda). É processo, documentação e a atualização do artefato do DS, que vive fora do repositório.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](../../CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                               |
| ---- | ----------- | ---------------------- | ------------------------------------------------------------------------ |
| DS1  | Opus        | medium                 | Sonnet medium (mapa, um subsistema por subagente); Haiku low (mecânicos) |
| DS2  | Opus        | high                   | Sonnet medium (um grupo de componentes do DS por subagente)              |

### Decisões

1. **O DS é curado à mão, não é gerado do código.** A skill `/design-sync` do Claude Code **não se aplica**: ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build. Fica registrado para nenhuma sessão futura tentar.
2. **Dono no repositório:** `docs/DESIGN-SYSTEM.md`, documento vivo, com a URL e o nome do artefato, a natureza dele (decisão 1), o **mapa** (componente, seção, token e ícone do DS → origem no código), os **gatilhos** (decisão 6), as **pendências** abertas e o **histórico de sincronização**. Os quatro documentos do `docs/redesign/` continuam como referência histórica e passam a apontar para ele.
3. **Verificação por fase:** a descrição de todo PR ganha um quarto item, **Impacto no DS**: "nenhum", ou o que muda (componentes, seções, tokens, ícones). O que não for "nenhum" vira bullet na seção de pendências do `docs/DESIGN-SYSTEM.md`, no mesmo PR. A fase decide isso cruzando o "Toca em:" dela com os gatilhos; é leitura, não exige abrir o artefato.
4. **Atualização por épico, no fechamento:** a fase de Fechamento que toda etapa já tem ganha o checkbox do DS, ao lado do `CHANGELOG.md`: aplicar as pendências no artefato, esvaziar a lista e registrar a sincronização (data, épico, o que mudou). **Não há gravação no artefato no meio do épico** — o DS é editado ao vivo por pessoas e o índice precisa ser lido imediatamente antes de cada gravação, então uma gravação por épico evita conflito e idas e vindas.
5. **Trava no CI:** o job `epic` do `ci.yml` ganha o passo "Design system registrado", irmão do "Changelog atualizado": o PR de `epic/*` para a `main` precisa tocar o `docs/DESIGN-SYSTEM.md`. O artefato o CI não alcança; o registro no repositório, sim.
6. **Gatilhos** (o que obriga a verificação): `src/ui/**`, `src/theme/tokens.ts`, `src/ui/icons.tsx`, `src/canvas/**`, e `src/i18n/**` só quando muda um rótulo que aparece num preview ou num guia do DS. Mudança só em `src/model/`, `src/storage/`, `mcp/`, testes, exemplos, `libraries/`, `lab/` ou documentação **não** mexe no DS.
7. **O código é a fonte da verdade; o DS descreve.** Nenhuma divergência entre os dois se resolve mudando a app para casar com o DS: o DS é que se corrige. Divergência que pareça defeito da app vira achado registrado na pendência, para o dono decidir.
8. **Recuperação (DS2):** entram numa única sincronização as quatro etapas depois de 2026-10-24 — Proposto com componentes, Sugestões no campo de texto, Imagens remotas e Biblioteca Material 3 — e o **Envolver** da Marcação pai, com uma entrada de histórico por etapa.

### Fora (de propósito)

- Usar a `/design-sync` ou gerar qualquer parte do DS a partir do código (decisão 1).
- Reescrever o conteúdo autoral das seções do DS além do que as entregas exigem: as seções e os guias têm autores, e a etapa ajusta só o que mudou.
- Criar componente no DS para o que não existe na app, ou apagar o que a app ainda tem.
- Mexer no `index.html`, nos tokens ou nos controles da app para casar com o DS (decisão 7).
- Script que compare o DS com o código automaticamente; o mapa é lido por pessoas e agentes. Fica para depois, se a verificação por fase se mostrar cara.

### Fases

#### DS1 — Dono no repositório, verificação por fase e trava no CI

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium (mapa, um subsistema por subagente) e Haiku low. Decisões 1 a 7.

**Toca em:** `docs/DESIGN-SYSTEM.md` (novo), `CLAUDE.md`, `.github/workflows/ci.yml`, `PLAN.md`, `CHANGELOG.md`, `docs/redesign/HANDOFF.md`, `docs/redesign/HANDOFF-PROPOSALS.md`, `docs/redesign/BRIEF-REVIEW-DETAILS.md`, `docs/redesign/HANDOFF-REVIEW-DETAILS.md`.

- [x] `docs/DESIGN-SYSTEM.md` com a URL e o nome do artefato, a natureza dele (decisão 1), os gatilhos (decisão 6), a regra da fonte da verdade (decisão 7), a seção de pendências e o histórico de sincronização
- [x] Mapa no mesmo documento: cada um dos 63 componentes, das 6 seções, dos tokens e dos 85 ícones do DS aponta para a origem na `main`; o que o DS não acompanha fica numa lista à parte, com o motivo
- [x] Mapa conferido nos dois sentidos: todo componente do DS aponta para arquivo que existe, e todo arquivo de `src/ui/` com forma visível aparece no mapa ou na lista do que o DS não acompanha
- [x] Registrar que o índice do artefato se chama **Mapping** e que os documentos do `docs/redesign/` o chamam de "Mapeador de Imagens 2.0" (sem renomear nada nesta fase)
- [x] `CLAUDE.md`: item **Impacto no DS** na descrição do PR (decisão 3), o checkbox do DS no Fechamento de todo épico (decisão 4) e a linha do `docs/DESIGN-SYSTEM.md` na tabela de documentação; a mesma linha na tabela do `PLAN.md`
- [x] Passo "Design system registrado" no job `epic` do `ci.yml` (decisão 5), no molde do passo "Changelog atualizado"
- [x] Os quatro documentos do `docs/redesign/` apontam para o `docs/DESIGN-SYSTEM.md` como o registro vivo (decisão 2)
- [x] Pendências preenchidas com as cinco entregas da decisão 8, cada uma com os componentes e seções candidatos
- [x] `CHANGELOG.md`: a seção `[Não lançado]` do épico conferida contra o que a fase entregou
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### DS2 — Pôr o DS em dia

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (um grupo de componentes do DS por subagente). Decisões 4, 7 e 8.

A fase grava no artefato do DS, fora do repositório: o índice (`project/design-system.json`) é lido imediatamente antes e gravado **por último**, numa chamada só, com `lastChange`. Nenhum arquivo do DS é apagado.

- [x] Triagem: comparar o DS com a `main` pelo mapa da DS1 e fechar, por pendência, o que muda em cada componente, seção, token e ícone
- [x] Proposto com componentes: a visão Proposto desenha os componentes criados com a marca de criada e a criação rejeitada vira fantasma pontilhado (guias de `ComponentDrawing`, `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader` e `OtherChanges`, mais as seções `Revisao.md` e `Canvas.md`)
- [x] Sugestões no campo de texto: `suggestions` e `linkedRef` (`TextField` com preview, `PropertyGrid`, `DataGrid`, `ReferenceField`; o `KeyValueGrid` ganhou o esclarecimento de que a anotação livre não tem lista)
- [x] Imagens remotas: nó `image` no componente e aba Privacidade (`ComponentDrawing` com preview, `Canvas.md`, `SettingsDialog` com preview)
- [x] Biblioteca Material 3: `variants` no `code`, com a definição da anotação e a tabela de variantes no Catálogo (`CodeDefinitions` e `CatalogPage`, com preview)
- [x] Marcação pai: botão **Envolver** no resumo da seleção múltipla e a dica nos nomes cortados (`MultiSelectionPanel` com preview, `LayerGroup` e `Breadcrumbs`; o `TreeRow` já estava correto)
- [x] Tokens e ícones conferidos contra `src/theme/tokens.ts` e `src/ui/icons.tsx`: os ícones já estavam 1:1; entraram no `tokens.json` o `size-grid-col-min` e seis papéis de controle, e os cinco alias `t-text*` ficaram fora por limite do formato (registrado)
- [x] Contraste: o texto novo usa só tokens existentes e nenhuma regra de contraste mudou, então a seção `Contraste.md` ficou como estava; a conferência visual dos previews nos dois temas não foi feita e está registrada nas pendências do `docs/DESIGN-SYSTEM.md`
- [x] `docs/DESIGN-SYSTEM.md`: pendências esvaziadas e uma entrada de histórico de sincronização por etapa (decisão 8)
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-sincronia-ds.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md`

---

## Decisões consolidadas dos PRs

- **Plano e épico (PR #287):** o épico nasce com o plano da etapa (commit "PLAN: etapa Sincronia do design system (planejada)") e fica aberto até o fim; as duas fases são PRs com base nele. A etapa foi pedida pelo dono em 2026-11-02 e não tem versão de MCP nem rótulo `mcp-rc`.
- **A atualização do DS acontece no fechamento do épico, não a cada fase.** O DS é editado ao vivo por pessoas e o índice do artefato precisa ser lido imediatamente antes de cada gravação; uma gravação por épico evita conflito e idas e vindas. Nesta etapa a única gravação no artefato foi a da DS2.
- **O registro vai num documento novo, com trava no CI.** O job `epic` passa a exigir o `docs/DESIGN-SYSTEM.md` no PR do épico, como já exigia o `CHANGELOG.md`. O artefato o CI não alcança; o registro no repositório, sim.
- **O atraso de quatro etapas entrou na mesma etapa**, como fase de recuperação (DS2), para o processo nascer testado em vez de ser só escrito.
- **A skill `/design-sync` não se aplica a este DS** (decisão 1): ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build.
- **DS1 (PR #290):** `docs/DESIGN-SYSTEM.md` com o mapa, os gatilhos e as pendências; o item **Impacto no DS** na descrição do PR e o checkbox do DS no Fechamento (`CLAUDE.md` e `PLAN.md`); o passo "Design system registrado" do `ci.yml`; os quatro documentos do `docs/redesign/` apontando para o registro. Nenhuma fase grava no artefato.
- **DS2 (PR #292):** a triagem das cinco entregas, a gravação no artefato (versões 14, conteúdo, e 15, índice), a conferência de tokens e ícones e a primeira entrada do histórico de sincronização, com uma linha por etapa.
- **O que tem forma visível e não tem componente no DS ficou como achado, não pendência.** São cerca de 30 arquivos (diálogos, barras e faixas, partes da revisão, editores de campo, configurações e janelas), listados em "Com forma visível e sem componente no DS" do `docs/DESIGN-SYSTEM.md`. Criar componente novo está fora do escopo, e entrar ou não no DS é decisão do dono.
- **Um componente do DS pode ser uma função local não exportada, ou vários arquivos sob um nome.** `ToolStripButton` é o `StripButton` de `src/ui/ToolStrip.tsx`; `LayerGroup` é função interna de `src/ui/AnnotationsPanel.tsx`; `ReferenceField` é o `RefField` de `src/ui/TypedFields.tsx`. Em sentido contrário, `Menu` cobre três menus e `DataGrid` cobre `TableField` e `ListView`. O mapa registra isso na coluna "Observação" em vez de forçar correspondência de um para um.
- **Os papéis de controle entraram no `tokens.json` com valor literal.** O formato do artefato só aceita alias (`{token}`) em cor, então `control-height`, `control-height-sm`, `control-icon`, `control-check`, `row-height` e `control-radius` entraram com o valor, e o `usage` diz qual token cada papel representa. Importam porque o `CLAUDE.md` manda o CSS usar só os `--control-*`. Os cinco alias de texto `t-text`, `t-text-small`, `t-text-heading`, `t-text-title` e `t-text-input` **não entraram**: a família `type` só aceita `fonts`, `families` e `groups.styles`, com valores reais de fonte.
- **Escopo dos previews (decisão do dono):** os guias de todos os componentes afetados foram corrigidos, e o estado novo entrou no preview só dos seis em que ele é elemento visível (`TextField`, `SettingsDialog`, `CodeDefinitions`, `CatalogPage`, `MultiSelectionPanel` e `ComponentDrawing`). O resto ficou registrado como pendência.

## Números conferidos

Conferidos contra a `main`, não copiados do artefato:

- **63 componentes** com guia, mais a capa `Cover` (o plano dizia 49).
- **85 ícones**, em correspondência 1:1 com `src/ui/icons.tsx`, sem sobra de nenhum lado (o plano dizia 82). A única diferença é a convenção de nome: kebab-case no DS, camelCase no código.
- **Tokens** batendo por nome e valor nos dois temas, sem nenhuma divergência de valor. Sete tokens de cor só diferem na notação do alias (`{x}` no DS, `var(--x)` no código) e resolvem para o mesmo valor. Faltavam no DS sete tokens (`size-grid-col-min` e seis papéis de controle), que entraram na DS2; só os cinco alias de texto continuam de fora.

## Erros que a própria etapa corrigiu

A DS2 achou três erros na lista de pendências que a DS1 montou. É o argumento a favor de registrar por escrito e conferir antes de gravar:

- A dica (`title`) no nome cortado foi atribuída ao `TreeRow`, que já estava correto (lá só a linha da seta tem `title`). O componente certo é o `Breadcrumbs`, o caminho acima do canvas.
- O `KeyValueGrid` foi listado como afetado pelo vocabulário sugerido, mas as células de chave e valor da anotação livre **não** têm lista: o vocabulário é dos campos e colunas `string` da especialização. O guia ganhou esse esclarecimento.
- A pendência dizia que `review.legend.rejected` não existia mais em `src/`. A chave existe (`src/i18n/review.ts`); o que saiu do texto dela foi o "(só em Atual)".

## Achados colaterais

- Um `}` sobrando no `<style>` de dois previews, `MultiSelectionPanel` e `CodeDefinitions`, nos dois no fim do bloco de regras de hover. Corrigidos; os outros previews não foram varridos.
- `docs/COMPONENT-FORMAT.md` dizia que o consentimento de imagem remota vinha "a partir da próxima versão da app", e ele já estava publicado. Corrigido na DS2.
- Uma suspeita descartada: `semanticCard.ts` e `semanticText.ts` pareciam código morto depois da etapa Canvas limpo, mas `src/canvas/renderers/markings.ts` ainda os importa.
- **No fechamento**, a verificação apanhou o primeiro caso vindo de fora: o épico `epic/exemplos-enxutos` **removeu o botão "Abrir projeto de exemplo" da tela inicial** (`src/app/Home.tsx` e as chaves `home.openExample*`) e entrou na `main` sem declarar Impacto no DS, porque a regra ainda não estava lá. O guia e o preview do `Home` foram corrigidos no fechamento desta etapa.

## O que ficou para depois

Tudo isto está na seção "Pendências" do `docs/DESIGN-SYSTEM.md` e é aplicado no fechamento do próximo épico que tocar o DS, salvo o último item, que é do dono.

- **Previews que não mostram o estado novo:** `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader` e `OtherChanges` (componentes criados e fantasma; em parte é comportamento do canvas, que o preview não desenha); `PropertyGrid`, `KeyValueGrid`, `DataGrid` e `ReferenceField` (vocabulário sugerido); `LayerGroup` e `Breadcrumbs` (dica no nome cortado).
- **Classes que faltam no `bundle.css`:** os previews de `TextField`, `SettingsDialog` e `CatalogPage` declaram no próprio `<style>` `.suggestions`, `.suggestion`, `.suggestion-label`, `.suggestion-detail`, `.privacy-*` e `.catalog-variants-caption`. O certo é o bundle ganhar essas classes quando for regerado.
- **Alias de texto:** os cinco papéis `t-text*` seguem fora do `tokens.json`, por limite do formato.
- **Varredura de chaves nos previews:** conferir o balanceamento de chaves em todos, já que dois tinham um `}` sobrando.
- **Alturas e contraste sem conferência visual:** os `height=` dos seis previews alterados foram estimados (`TextField` 710 → 1010, `SettingsDialog` 2800 → 6000, `CodeDefinitions` 230 → 640, `CatalogPage` 1800 → 2300, `MultiSelectionPanel` 662 → 860, `ComponentDrawing` 620) e o contraste do texto novo não foi visto num navegador nos dois temas.
- **A conferir:** o guia do `ReviewHeader` ("Aceitar remoção" e "+ N anotações criadas") contra `ReviewHeader.tsx`; as razões de contraste de `Contraste.md`, que não foram recalculadas; o guia do `Notice`, que diz que `.notice-error` e `.notice-success` não têm uso na app, sem conferir o CSS; e o efeito de Revogar uma origem no `SettingsDialog`, contra `src/store/imagePermissions.ts`.
- **Cerca de 30 arquivos com forma visível e sem componente no DS:** decisão do dono, não pendência.
- **Fora do épico:** o script que compare o DS com o código automaticamente, que só vale se a verificação por fase se mostrar cara.
