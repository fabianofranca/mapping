> **Relato da rodada 3 (dirigida)**, feita em 2026-10-12 pelo agente do Cowork no computador do dono, sobre o build `2bdb662` (etapa 7 concluída, com os resíduos do PR #121), com o prompt [`etapa-6-testes-cowork.md`](etapa-6-testes-cowork.md) no modo dirigido: R0 e os itens A1 a A3 e G1 a G4 de [`relato-2026-10-12-dirigida.md`](relato-2026-10-12-dirigida.md). Confirmou os sete itens corrigidos (plano em [`PLAN-etapa-7.md`](PLAN-etapa-7.md)): 32 ✅, 0 achados, 0 regressões. As observações O5 a O8 ficaram registradas na seção do marco "Uso real" do [`../ROADMAP.md`](../ROADMAP.md). Guardado como veio, sem edição.

---

# Relato de teste — Mapping

- Modo: dirigido — R0 e os itens A1 a A3 e G1 a G4 de docs/history/relato-2026-10-12-dirigida.md (correções da etapa 7), mais a passada visual pelos diálogos e o R4.1 com uma entrada antiga de `mapping.reviewResume`
- Build id: 2bdb662 · 2026-10-12 (merge do PR #121; já publicado na versão principal no início da rodada)
- Canal (como a app mostra): estável
- Forma de abrir: versão principal (`https://fabianofranca.github.io/mapping/`); R0.5 pelo `index.html` avulso (`file://`) e R0.6 pelo app instalado, ambos pelo dono
- Navegador e versão: Google Chrome 155.0.8059.40 (perfil normal do dono, extensão Claude in Chrome; viewport 1584 × 715 com a janela restaurada)
- Sistema operacional: Windows (x64), máquina `galaxy-book-ff`
- Data: 2026-10-12
- Testador: agente (Claude) no Chrome do dono, com o dono nos passos **[pessoa]**; shell Linux (VM do app Claude) com a pasta `mapping-testes` montada
- MCP: não usado (nenhum dos itens toca o R5)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-12-r3\`

## Resumo

- Passos: 32 linhas (27 passos do guia ou repros dos itens e 5 da passada visual): **32 ✅** (R0.6 parcial, pelo dono; Visual: Detalhes com ressalva), **0 ❌**.
- Itens da etapa 7: **A1, A2, A3, G1, G2, G3 e G4 corrigidos**, e a O2 (seta dupla) também. Foco nunca caiu no `body` ao fechar Exportar, Escolher alvo, Referências vão quebrar e Remover da lista.
- Achados: 0. Regressões fora do alvo: 0. Observações novas: 4 (O5 a O8).
- Impede o uso com pessoas? **Não.**

## Estado do navegador antes da rodada

- Tela inicial com 12+ projetos de rodadas anteriores (pastas `principal`, `importacao`, `principal-reparo`, `loja`, `fumaca-pwa`; neste dispositivo, vários `Loja` e `Local`, `Teste`).
- `localStorage.mapping.reviewResume` com 12 entradas: 5 legadas (chave só com o id da proposta, UUIDs de propostas do MCP) e 7 já com a cópia na chave (`local:…|checkout-figma` ×2, `folder:loja|checkout-figma`, `folder:importacao|…` ×4). **Nenhuma legada para `checkout-figma`** (migrada na rodada 2); para o R4.1 ela foi inserida pelo agente (ver R4.1).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1  |  | ✅ | Tela inicial com **Começar**, **Novo projeto**, **Abrir pasta**, **Abrir zip**; lateral **Projetos**, **Ajuda**, **Configurações**. Configurações › Sobre: `2bdb662 · 2026-10-12`, canal estável, formato 8; diálogo 478/478 (sem barra horizontal). Esc devolveu o foco ao botão **Configurações**. |
| R0.2  |  | ✅ | Seletor e permissão pelo dono. "Criar projeto nesta pasta?" com o campo vazio, `fumaca-web` só como placeholder e o foco no campo. Editor com "Nenhuma imagem ainda" e **Pasta**. Disco: `mapping.json` (revision 0, nome `fumaca-web`), `.gitignore` com `backups/`, sem `images/`. |
| R0.3  |  | ✅ | `cadastro.png` injetado no campo de arquivo de **Adicionar imagens**: `images/cadastro.webp` 484×450. Marcação desenhada e selecionada. Fechar voltou à tela inicial sem perguntar; `fumaca-web` no topo com o selo **Pasta**. Disco: revision 2, 1 imagem, 1 marcação. |
| R0.4  |  | ✅ | F5 (`navigation.type = reload`); **Abrir** na linha `fumaca-web` abriu **sem pedido de permissão** e sem seletor; a aba continuou de pé. Janela restaurada pelo dono e estreitada pela extensão (`innerWidth` 844): só "Abra numa janela maior" ("O Mapping precisa de pelo menos 900 px de largura…"); Delete sem efeito; ao alargar, a marcação lá e selecionada. Disco: revision 2, 1 marcação. |
| R0.5  |  | ✅ | Feito pelo dono: avulso do artefato `index-html` (salvo em `mapping-testes\index.html`; o arquivo traz `2bdb662`), aberto por `file://`, telas relatadas sem problema. Disco: `fumaca-arquivo/` com `mapping.json` (revision 2, nome `fumaca-arquivo`), `.gitignore` com `backups/`, `images/cadastro.webp` 484×450 e 1 marcação. |
| R0.6  |  | ✅ (parcial) | Feito pelo dono no app instalado: abriu e criou o projeto `fumaca-pwa` (disco: `mapping.json` revision 0, `.gitignore` com `backups/`); **o dono não adicionou imagem nem marcação** ("abriu o projeto, achei o suficiente"). Build id do app instalado não registrado. |
| R0.7  | G4 | ✅ | Pasta renomeada pelo shell para `fumaca-web-2`. **Abrir** (pedido de permissão da visita nova, pelo dono): "Pasta indisponível" — "A pasta \"fumaca-web\" não foi encontrada (ou não tem mais o mapping.json)…" e "Remover da lista não apaga nada do disco.", com **Cancelar** (com o foco), **Remover da lista** e **Localizar pasta…**; 478/478. **Localizar pasta…** (dono) abriu o projeto; na lista, `fumaca-web` com `fumaca-web-2` embaixo. **Remover da lista**: a linha saiu e **o foco foi para o botão Abrir da linha seguinte** (`fumaca-pwa`), não para o `body` (G4 corrigido). Disco: `fumaca-web-2` intacta (revision 2, 1 imagem, 1 marcação). Console sem erros. |
| R1.1  | | ✅ | Pasta `principal` (seletor e permissão pelo dono); "Criar projeto nesta pasta?" com `principal` só como placeholder; Enter criou. `cadastro.png` injetado no campo de **Adicionar imagens**: `images/cadastro.webp` 484×450. |
| R1.2  | | ✅ | **Nova camada** › "Camada 2" › `Model` + Enter. Disco: `layers` com `Model`. |
| R1.3  | | ✅ | Especializações injetadas no campo de arquivo do diálogo: "\"SDUI\" aplicada: 3 camada(s) criada(s)." e "\"Modelo de dados\" aplicada: 2 camada(s) criada(s)." (diálogo 558/558). Camadas: linhas de especialização com 54 px e o selo dentro (ex.: Componentes 467–521, selo 495–517), nenhuma cobrindo a de baixo; lista rola. Esc devolveu o foco ao botão **Especializações**. Disco: `specs/sdui.json`, `specs/modelo-dados.json`, `specializations` com as duas. |
| R1.6  | A2 | ✅ | Formulário com Nome, Idade, E-mail e Cadastrar dentro; Título na raiz. Disco: 6 `markings`, filhas com `parentId` do Formulário e `rect` dentro dele. **Com Nome selecionado, a etiqueta "Nome" fica logo abaixo do rótulo "Formulário …", sem cobri-lo, a 61% e a 49%** (A2 corrigido; ver R1.9). |
| R1.7  | | ✅ | User em Model: `name: string`, `age: number`, cada par com `id`. Depois de **+ Par** o foco foi para **Chave** e Enter na Chave levou ao **Valor** (2 vezes). |
| R1.8  | A3 | ✅ | Classe · Contato: `revisadoEm` `2026-10-12` (valor do campo), `atributos` com 1 linha (`email`, `String`, `obrigatório` sim por padrão, `ana@exemplo.com`) com `_id`. Colunas lado a lado: nome 1160–1233, tipo 1233–1306, sim/não 1306–1406, exemplo 1406–1479. **`exemplo` cortado ("ana@exe", `scrollWidth` 126 × `clientWidth` 67) agora com `title` "ana@exemplo.com"; `nome` com `title` "email"** (A3 corrigido). Recolhida: "Classe · Contato — nome: Contato · versão: 1 · revisado em: 2026-10-12". Ver observações O5 (Enter em campo de texto tira o foco) e O6 (tipo "Strin…" sem `title`). |
| R1.9  | A1, A2 | ✅ | Zoom a 49% (`Ctrl+-` por `keydown` sintético) com Nome selecionado: etiqueta "Nome" abaixo de "Formulário …", sem sobrepor (A2). "Escolher alvo de \"dado\"" (aceita: data-field e livres; 598/598) lista só `User.name`, `User.age` e `Contato.email`; o foco abriu em "Buscar alvo". **Enter em `User.name`: o diálogo fechou e o foco voltou ao campo `dado` (botão "dado: User.name", `:focus-visible`)** (A1 corrigido). |
| R1.10 | A1 | ✅ | Idade (`input_idade`, `number`, User.age) e E-mail (`input_email`, `email`, obrigatório sim, Contato.email): **nas duas escolhas por Enter o foco voltou ao campo `dado`** ("dado: User.age", "dado: Contato.email"). Disco: os três `values.dado` são objetos de referência (`annotationId` + `entryId`; `annotationId` + `key` + `rowId` na Classe). |
| R1.13 | | ✅ | "← Input input_nome (Nome)" e "← Input input_idade (Idade)"; clicar no primeiro selecionou o Input no Nome, `.editor` com `scrollLeft` 0 e documento sem barra horizontal (1584/1584). |
| R1.14 | O2 | ✅ | `name` → `nome`: no Nome, `dado` mostra **um ícone de seta e o texto "User.nome"** (sem o "→" no texto; O2 corrigido); `title` "→ User.nome (Model)" + "Escolher  Ctrl+B". |
| R1.15 | A1 | ✅ | A Classe abriu pelo "Mostrar Classe · Contato". Menu "Ações da linha email" › **Remover linha**: "Referências vão quebrar" — "A linha \"email\" é alvo de 1 referência(s), que vão ficar quebradas. Dá para desfazer." (478/478, foco em **Cancelar**). **Cancelar** (Enter): o foco voltou ao botão "Ações da linha email". De novo pelo teclado (menu › Remover linha › Tab › Excluir): **o foco foi para "+ Linha"** (a tabela ficou sem linhas), `:focus-visible` (A1 corrigido). E-mail: "Incompleta: 1 pendência" com "referência quebrada"; Ctrl+Z: a linha voltou e o E-mail sem pendência; disco com o `email` em `atributos`. |
| R1.22 | A1 | ✅ | Exportar pelo teclado (foco no botão + Enter): "principal.zip está pronto." (17,7 KB; 478/478; foco em **Cancelar**). **Esc → foco no botão Exportar; Cancelar (clique) → foco no Exportar.** Pelo dono: "Salvar como" cancelado manteve o diálogo; depois salvo em `principal.zip`, o diálogo fechou e **o foco ficou no botão Exportar** (A1 corrigido). Zip com `mapping.json`, `images/cadastro.webp`, `specs/sdui.json` e `specs/modelo-dados.json`; `mapping.json` do zip igual ao da pasta (revision 43). |
| G3: Enquadrar tudo | G3 | ✅ | Duas vezes no `principal`: fechar a janela de baixo (X) e **um** clique em **Enquadrar tudo** enquadrou no canvas inteiro (30% → 61%; 49% → 61%; a imagem ocupa a altura toda). |
| R2.1  | | ✅ | **Novo projeto** (478/478, foco no campo) › `Local` › Enter. Barra de status: **Neste dispositivo** e **Alterações não exportadas** com o projeto vazio. |
| R2.2  | | ✅ | `cadastro.png` injetado: `images/cadastro.webp`. Formulário e Título desenhados e nomeados. User em Camada 1 com `name` = `string`: depois de **+ Par** o foco foi para **Chave** e Enter levou ao **Valor**. **Alterações não exportadas** continua. |
| R2.3  | A1 | ✅ | "Local.zip está pronto." (13,8 KB). Pelo dono: "Salvar como" cancelado → o diálogo continuou aberto; **Cancelar** do diálogo (clique) → **foco no botão Exportar** e **Alterações não exportadas** continuou. Segundo **Baixar**, salvo pelo dono (`Local.zip`, 14 182 bytes: `mapping.json` e `images/cadastro.webp`): o diálogo fechou, **foco no botão Exportar** e o aviso sumiu. Na tela inicial, `Local` no topo, **Neste dispositivo**, sem o aviso. |
| R2.4  | G2 | ✅ | `Local.zip` injetado no campo de **Abrir zip**: abriu como projeto novo neste dispositivo, com a imagem, Formulário, Título e a User (`name: string`). Fechado: os dois `Local` na lista, o importado **no topo com 15:11** (a hora da importação) e o original embaixo com 15:09. |
| R4.1  | G1, G2 | ✅ | **Antes:** inserida no `localStorage` a entrada legada `checkout-figma` (chave sem a cópia, `view: current`, seleção `item M1`, `knownConflicts: ["c4"]`), além das 12 que já existiam. `proposta-exemplo.zip` injetado no campo de **Abrir zip**: projeto **Loja** neste dispositivo; **a barra de status mostrou "1 proposta(s) nova(s)"** já na primeira importação (G1 corrigido); Propostas: "Checkout a partir do Figma" **Nova** com **Revisar** (11 sem decisão). |
| R4.2  | G1 | ✅ | Cabeçalho → `Topo` (Enter). **Revisar**: "Somente leitura" nas duas barras; **a revisão abriu na visão Proposto** (a legada dizia `current`; a visão não volta, G1); a posição voltou (Topo selecionado) e apareceu "A revisão voltou ao ponto onde você parou." (mantido de propósito pela 7.3 e previsto no R4.2 do guia); filtros limpos. Lista **Nível** com os selos; a mudança do nome como **Conflito**, Detalhes com Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`. Árvore na visão Proposto sem o Banner promoção. `localStorage` depois: a legada saiu e virou `local:79173bd2…|checkout-figma` (`view: proposed`). **Sair da revisão** sem lembrete. |
| G2: zip sem editar | G2 | ✅ | Repro do relato: **Abrir zip** › `proposta-exemplo.zip` (injetado) e fechar **sem editar**: a Loja nova entrou **no topo dos recentes com "12/10/2026, 15:13"**, não com a data de dentro do zip ("09/10/2026, 09:00", que ainda aparece na Loja importada na rodada 1). |
| Visual: diálogos (foco) | A1, G4 | ✅ | Foco ao fechar, conferido por `document.activeElement`: **Exportar** (Esc, Cancelar, salvar pelo dono; 5 vezes) → botão **Exportar**; **Escolher alvo** (Enter, 3 vezes) → campo `dado`; **Referências vão quebrar** (Cancelar → "Ações da linha email"; Excluir → "+ Linha"); **Remover da lista** → **Abrir** da linha seguinte; Configurações, Especializações e Ajuda (Esc) → botão que abriu; "Nova anotação em …" → "Rótulo da instância (opcional)" do tipo criado. Nenhum caso no `body`. |
| Visual: diálogos (barra horizontal) | | ✅ | Nenhum com barra horizontal: Configurações, Criar projeto nesta pasta?, Pasta indisponível, Especializações (558/558), Nova anotação em…, Escolher alvo (598/598), Referências vão quebrar, Exportar, Novo projeto. Na Ajuda, o `pre` do exemplo continua rolando na horizontal (621/569; O3, fora da etapa). |
| Visual: Detalhes | A3, O2 | ✅ (com ressalva) | Sem barra horizontal na página nem em Detalhes; tabela `atributos` sem sobreposição; `title` no `nome` e no `exemplo` da tabela; seta única no valor de referência. Ressalva: a célula `tipo` mostra "Strin…" (cortada pela seta da lista) e não tem `title` (O6). |
| Visual: Camadas | | ✅ | Com as 7 camadas, linhas de especialização com 54 px e o selo dentro; nenhuma barra horizontal (237/237). |
| Visual: Diagnóstico | | ✅ | "Nenhum erro registrado." no `principal` ao fim do R1; sem barra horizontal. Console da aba sem erros durante a rodada. |

## Achados

Nenhum. Os sete itens da etapa 7 (A1, A2, A3, G1, G2, G3, G4) e a O2 estão corrigidos no build `2bdb662 · 2026-10-12`.

## Regressões fora do alvo

Nenhuma.

### Observações (sem severidade)

- **O5. Enter num campo de texto tira o foco do teclado (vai para o `body`).** Em Detalhes, Enter em `versão`, nas células `nome` e `exemplo` da tabela `atributos` leva o foco ao `body`, com ou sem mudança no valor (3 de 3 tentativas no `exemplo`); Tab no mesmo campo leva ao controle seguinte. Não é da etapa 7: o `CommitInput` (`src/ui/CommitInput.tsx`) chama `blur()` no Enter de propósito para gravar. A exceção é a Chave dos pares, que leva ao Valor. Para quem usa só o teclado, o efeito é o mesmo do achado 4 (perde o lugar); vale decidir se o Enter deve manter o foco no campo.
- **O6. Célula `tipo` da tabela `atributos` cortada sem `title`.** Na largura padrão de Detalhes, o `<select>` de `tipo` mostra "Strin…" sob a seta e não tem `title` (o `title` da 7.1 entrou nos campos de texto e de número, não nas listas). O valor dá para ler abrindo a lista.
- **O7. `title` do campo `dado` com espaço duplo:** "→ User.nome (Model)" + "Escolher  Ctrl+B".
- **O8. Aviso "A revisão voltou ao ponto onde você parou." com a entrada legada** (R4.2): continua, como decidido na 7.3 (a posição volta de fato). Se o dono preferir sem o aviso, é a linha em `open` de `src/store/review.ts` indicada no `PLAN-etapa-7.md`.

## O que atrapalhou

- **Arquivos pelos campos da app:** o shell é de uma VM Linux sem a área de transferência do Windows. Imagens, especializações e zips entraram injetados nos `<input type="file">` da app (a ferramenta exige o arquivo copiado antes para a sessão). Num caso a injeção foi no campo errado (o de **Trocar imagem**, sem imagem selecionada) e nada aconteceu, sem erro; refeito no campo de **Adicionar imagens**.
- **Seletores do sistema:** para não depender do foco da janela, o dono clicou ele mesmo em **Abrir pasta**, **Localizar pasta…** e **Baixar** (R0.2, R0.7, R1.1, R1.22, R2.3); o resultado é o mesmo do passo.
- **Janela maximizada:** o redimensionamento pela extensão é ignorado; no R0.4 o dono restaurou a janela e a extensão a estreitou (`innerWidth` 844) e alargou de novo.
- **Aba trocada no meio da rodada:** durante o R0.5/R0.6 do dono, o grupo de abas da extensão sumiu (a aba foi fechada ou saiu do grupo); abri outra aba na versão principal. O R0.7 nela pediu de novo a permissão da pasta (visita nova).
- **Zoom:** `Ctrl+-` por `keydown` sintético (convenção do guia) para ir de 61% a 49% no R1.9; não houve como acertar exatamente os 52% do relato anterior, e a etiqueta foi conferida a 61% e a 49%.
- **R0.6 parcial:** o dono criou e abriu o projeto no app instalado, mas não adicionou imagem nem marcação; o build id do app instalado não foi registrado.
- **G1 sem entrada legada real:** a legada de `checkout-figma` da rodada 1 foi migrada na rodada 2; para o R4.1 a entrada foi recriada à mão no `localStorage` (mesmo formato de antes da 6.5).
- **Estado deixado no navegador do dono:** quatro projetos novos neste dispositivo (`Local` ×2 e `Loja` ×2 desta rodada) e as pastas `fumaca-pwa` e `principal` desta rodada nos recentes (o `fumaca-web` foi removido da lista no R0.7); `mapping.reviewResume` agora com `local:79173bd2…|checkout-figma`. Não apaguei nada (exclusão fica com o dono).
- **Itens fora da lista dirigida:** R1.4, R1.5, R1.11, R1.12, R1.16 a R1.21, R1.23, R1.24, R2.5, R2.6, R3, R4.3 a R4.11, R5, R6, R7, R8 não foram executados (não tocam A1–A3, G1–G4).
