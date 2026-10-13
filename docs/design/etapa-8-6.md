# Nota de desenho — fase 8.6: guia do testador e prompt do Cowork

> Nota de desenho da fase 8.6 da etapa 8 (`PLAN.md`), escrita antes de qualquer mudança no guia. Origem: achados **G1 a G16** da seção 6 de [`docs/history/revisao-tecnica-2026-10-12.md`](../history/revisao-tecnica-2026-10-12.md). Fase editorial: não muda código da app, schema nem formato da proposta.

## 1. O "subsistema" e o problema

São dois documentos com dois leitores:

| Documento         | Leitor                                                                                                      | Hoje                                                                                                                      | Depois                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/TESTING.md` | **pessoa** que testa à mão (o dono no teste manual avançado, quem for usar a app) e, por apêndice, o agente | fala com os dois ao mesmo tempo (12 ocorrências de "Agente…" no corpo, convenções com 15 bullets de até 1.500 caracteres) | corpo só para a pessoa; tudo do agente no **apêndice A**                   |
| prompt do Cowork  | **agente** com controle do computador                                                                       | `docs/history/etapa-6-testes-cowork.md` (vivo dentro de `history/`, preso à etapa 6, repete o guia)                       | `docs/TESTING-COWORK.md` (vivo, sem número de etapa, só o que é do agente) |

Estados e transições, numa fase editorial, são os **caminhos de leitura**:

- **Pessoa:** Comece aqui → 1 a 5 (pegar a app, requisitos, versão, como grava, mapa da interface) → 6 só se for usar o MCP → roteiros na ordem do quadro "Comece aqui" → templates. Nunca precisa ler os apêndices.
- **Agente (Cowork):** mensagem do dono → `docs/TESTING-COWORK.md` (papel, modo, [pessoa], relato) → `docs/TESTING.md` inteiro, **com o apêndice A** (como agir na interface por uma extensão + shell) → apêndice B quando o passo pede operação de disco.

O guia **reflete a `main`** de hoje. As mudanças de comportamento das fases 8.1 (sessão), 8.3 (foco/teclado) e 8.5 (MCP 0.3.3), em paralelo nesta onda, **não** entram agora; o coordenador repassa à 8.7 o que o guia precisa refletir. Onde a mudança da 8.5 já está no plano, o texto fica neutro (seção 7).

## 2. Estrutura nova do `docs/TESTING.md`

| #   | Seção                                           | De onde vem                                                                                                 | O que muda                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | **Comece aqui** (novo, ~meia página)            | `:3-7` + "Ordem e dependências" `:122`                                                                      | O que é a app (3 linhas); "para quem testa à mão: leia 1 a 5, pule 6 se não for usar o MCP"; **quadro da ordem** com tempo aproximado por roteiro; o que não é testado (usabilidade); uma linha: "um agente com controle do computador começa pelo `docs/TESTING-COWORK.md` e pelo apêndice A". **G8**                                                                       |
| 1   | Onde pegar a app                                | igual                                                                                                       | sem mudança                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Requisitos                                      | igual + `:110` + prompt `:27`                                                                               | **+ "Permitir em todas as visitas"** (item próprio: vale para todos); **+ "perfil limpo ou registre o estado prévio"** (o que a tela inicial já mostra; a nota "o primeiro Revisar pode dizer 'A revisão voltou ao ponto onde você parou.'" sai do R4.2 e vem para cá); `:28` sem a frase do agente; `:34` "R3 (repositório de teste) e R3.6/R5 (MCP)" (**G16**). **G2, G5** |
| 3   | Conferir a versão                               | igual                                                                                                       | `:40` cita o texto visível da barra de status (`schema v8`, canal) e a dica ("Versão do formato: 8") (**G16**)                                                                                                                                                                                                                                                               |
| 4   | Como a app grava                                | igual                                                                                                       | sem o "Agente:" de `:61` (vai para o apêndice A); "se a proposta não aparecer em ~3 s, use **Verificar a pasta agora** na janela Propostas" (**G10**)                                                                                                                                                                                                                        |
| 5   | **Mapa da interface** (novo)                    | `:112`, `:113`, `:115`, `:116`, `:118`, `:119`                                                              | **tabela ícone → nome (dica) → atalho** da barra principal, da janela Camadas e da barra do canvas; lista das sete janelas com atalho; zoom e Árvore (centraliza/aproxima); três jeitos de adicionar imagem; Exportar › Baixar; criar marcação; criar anotação; tela inicial com a coluna **Origem** (selos **Pasta** / **Neste dispositivo**) (**G9**). **G3**              |
| 6   | Instalar o servidor MCP (era 5)                 | `:66-91`                                                                                                    | passo 1 com conferência do `sha256` e versão **neutra** (seção 7 abaixo); aviso "repositório com `"type": "module"`" apontando para `docs/MCP.md`; o "Agente testador sem o Claude Code" (`:89`) vai para o apêndice A. **G10**                                                                                                                                              |
| 7   | Como relatar um problema (era 6)                | igual                                                                                                       | aponta para o template e define a escala de severidade                                                                                                                                                                                                                                                                                                                       |
| 8   | Roteiros (era 7)                                | `:105-133` + tabelas                                                                                        | convenções em **≤ 6 bullets curtos** (abaixo); rodada completa × dirigida em um parágrafo curto (o detalhe do modo dirigido é do agente: vai para o prompt); **R5 passa a ficar entre R7 e R8 no texto** (o código continua R5), para quem lê de cima para baixo executar na ordem certa                                                                                     |
| 9   | **Teste manual avançado** (novo)                | revisão, "Teste manual avançado" A1 a A18                                                                   | seção 6 abaixo                                                                                                                                                                                                                                                                                                                                                               |
| 10  | Templates (era 8)                               | `:284-371`                                                                                                  | seção 5 abaixo. **G15**                                                                                                                                                                                                                                                                                                                                                      |
| A   | **Apêndice A — Para o agente testador**         | `:61`, `:89`, `:110`, `:111`, `:114`, `:117`, `:137`, e os ramos de agente em R1.8, R1.20, R5.1, R6.2, R3.6 | seção 3 abaixo. **G1, G2**                                                                                                                                                                                                                                                                                                                                                   |
| B   | **Apêndice B — Operações de disco por sistema** | ramos de R6.8 a R6.11, R7.2, R0.4                                                                           | `chmod a-w` × `attrib +R`, o one-liner Python do R6.10, mover/renomear pasta com o projeto fechado, `git init` do repositório de teste, ler `revision` sem editor. **G7**                                                                                                                                                                                                    |

**O que some:** `:120` ("Os passos de celular dos roteiros antigos saíram") (**G6**); o detalhe de implementação do R1.16 ("no onClick a ação é uma lista suspensa…") (**G16**); toda menção a `localStorage`, `title`, `aria-label`, `keydown` sintético e `<select>` no corpo (vão para o apêndice A).

**Códigos estáveis.** Nenhum código de passo muda de número: relatos e planos em `docs/history/` citam R6.10, R4.1 etc. Passo dividido ganha sufixo de letra (`R5.4a`, `R5.4b`); passo de preparação vira `R6.8a` (prep) + `R6.8b`; a ordem no texto continua a numérica.

### Convenções dos roteiros (≤ 6 bullets)

1. Cada passo tem um código, a **Ação** e o **Esperado** em **Tela** (o que aparece) e, quando grava, **Disco** (o que fica no `mapping.json` ou na pasta). No relato, marque cada código com ✅, ❌ ou "não executado (motivo)".
2. Texto em **negrito** ou entre aspas é o texto exato da interface em português; nomes de ícone são os da dica (seção 5, Mapa da interface). Uma dica aparece com o mouse parado sobre o controle.
3. Campos de texto gravam com **Enter** ou ao sair do campo; espere **Salvo** antes de ler o disco (seção 4).
4. Marcações e anotações: como criar está na seção 5; "desenhe X" é sempre no modo **Desenhar**.
5. _Itálico no fim do Esperado_ marca uma **regressão conhecida**: uma verificação de algo que já quebrou numa rodada anterior, não o objetivo do passo. **G6**
6. **[pessoa]** marca os passos que um agente não faz sozinho (apêndice A). Quem testa à mão pode ignorar a marca.

## 3. Apêndice A — Para o agente testador

Tudo que hoje está como "Agente: …" no corpo, reorganizado. A convenção [pessoa] em **quatro bullets** (G2):

1. **O que é [pessoa]:** diálogo do sistema ou do navegador que a extensão não opera (seletor de pasta/arquivo, permissão da pasta, "Salvar como", instalar o app, "Sair da página?").
2. **Passos inteiros da pessoa:** R0.6 (app instalado) e R6.2 (fechar a aba); o agente confere o disco depois.
3. **Seletor de pasta só na primeira abertura:** depois, **Abrir** na linha dos recentes; **Abrir pasta** e **Localizar pasta…** são dois diálogos seguidos (seletor + permissão).
4. **Antes de cada seletor**, peça à pessoa para clicar na janela do Chrome; se nada abrir, repita e não registre como achado.

Depois: o que o guia supõe (extensão + shell; sem shell, disco vira [pessoa]); arquivos (colar por `Set-Clipboard`, injeção em `<input type=file>` e o risco de injetar no campo errado, como na rodada 3); esperar o campo aparecer; `<select>` nativo; `keydown` sintético para `Ctrl+=`/`Ctrl+-`; dicas pelo `title`/`aria-label`; janela maximizada (a extensão não redimensiona; peça para restaurar); `file://` não navegável pela extensão (R0.5 é da pessoa); captura headless do `cadastro.png`; cliente MCP próprio por stdio (R3.6/R5) e o R5.1 com a pessoa no Claude Code; pasta montada que pede permissão para apagar (EPERM do MCP); segunda raiz para `add_image`/`apply_specialization`; estado prévio do navegador (`localStorage.getItem('mapping.reviewResume')`, prefixo `preview:`, `file://` × Pages com `localStorage` separados). Cada item cita o passo e, quando veio de um relato, o relato.

## 4. Passos (G4, G5, G6, G7, G9, G10, G16)

- **G4 (observável por humano):** R1.4 "qualquer cor diferente da atual; Disco: `color` mudou em relação à leitura anterior" (sem código no `aria-label`); R4.5 "o ícone de rejeitar na linha da mudança (dica 'Rejeitar Marcação Campo Cupom criada')"; R1.4, R1.14, R4.4, R5.6 "passe o mouse e confira a dica". **R3.6 e R5:** o rótulo `**Agente:**` (que ali é o **Claude Code sob teste**, não o testador) vira `**Claude Code:**`, com a **leitura em prosa primeiro** ("o Claude diz que a proposta anterior já estava aplicada e continua assim") e o JSON depois, entre parênteses, com "para conferir, peça 'mostre a resposta bruta da tool'".
- **G5 (uma leitura, ação na Ação):** R1.20 nomeia os dois "Mostrar todas" (ícone de olho na Camadas; opção da lista **Marcações sem anotação**); R1.13 põe o clique na Ação; R4.6 separa Ação de Esperado; R4.2 sem a nota de rodada anterior (foi para a seção 2); R6.1 diz o objetivo (arrastar durante a gravação de ~250 ms) e "repita até 3 vezes"; R0.7 diz qual das três mensagens é a certa para pasta renomeada (**folderMissing**) e que "O navegador não deu acesso…" indica permissão, outra coisa; R1.23 escreve a chave achatada como aparece na interface.
- **G6 (resíduos):** R0.4 (aba que cai), R4.10 (`drawImage`), R5.3 (caixa do tipo; "numa importação nova…"), R6.10 (sem X, Esc e clique fora), R1.3 (selo inteiro), R1.8 (colunas lado a lado) ficam como _regressão conhecida_ em itálico no fim do Esperado.
- **G7 (divididos):** R5.4 → R5.4a (substituição de proposta concluída) + R5.4b (substituição antecipada; o aviso de **Aceitar tudo** e o "Em lote abaixo de 1200 px" ficam aqui); R6.8 → R6.8a (preparação; ramos por sistema no apêndice B) + R6.8b; R0.4 → R0.4a (reabrir pelos recentes e permissão) + R0.4b (janela estreita e Delete); R7.2 com os 8 subpassos em passos R7.2a… ou numa lista curta fora da tabela, com o comando no apêndice B; R6.10 com o one-liner Python e o `attrib` no apêndice B. Também ficam abaixo do limite da regra (seção 8): R5.2, R5.3 e R8.1 (enxugados, sem mudar o que conferem).
- **G9:** "lista **Nível**" → "na janela Propostas, lista da revisão (coluna **Nível**)" em R4.2, R4.6, R4.9, R5.4; tela inicial cita a coluna **Origem**.
- **G10:** seção 6 com `sha256`, aviso ESM, **Verificar a pasta agora** nas convenções/seção 4.
- **G16:** os seis itens pequenos (`:34`, `:40`, R1.16, R6.6 "leia `width` da imagem e do `rect` e escolha x > largura da imagem − largura do `rect`", ponteiros do README/CLAUDE.md).

## 5. Templates (G15)

- **Relato de uma rodada** (um template, com o modo no cabeçalho; o da dirigida deixa de ser "o mesmo com duas diferenças" e vira campos opcionais marcados):
  - Cabeçalho: Modo (completo | dirigido — alvo), Build id, Canal, Forma de abrir, Navegador e versão, SO, **DPR e viewport** (e janela maximizada/restaurada), **Pasta de trabalho**, **Ferramenta** (pessoa | agente + extensão + shell, qual shell), **Estado prévio do navegador** (perfil limpo | projetos pré-existentes, quais), MCP (versão, origem, sha256 conferido?), Data, **Tempo por roteiro**.
  - **Resumo** (obrigatório): passos, ✅, ❌, não executados; achados por severidade; **"Impede o uso com pessoas? sim/não e por quê"**.
  - Passos (com a coluna **Achado de origem** na dirigida), Achados, **Regressões fora do alvo** (dirigida), **Observações (sem severidade)**, O que atrapalhou.
  - **Escala de severidade** definida uma vez (seção 7): **bloqueia** = perda de dados, projeto não abre ou gravação falha em silêncio; **alta** = impede concluir um fluxo sem contorno; **média** = há contorno, mas quem não leu o guia tropeça; **baixa** = cosmético ou texto.
- **Registro do marco "Uso real"** (nome mantido, o `docs/ROADMAP.md` cita): tabela "Telas mapeadas" ganha **Tempo**, **Navegador/SO**, **Modo (pasta/dispositivo)** e **Tamanho do projeto (imagens/marcações)**; tabela nova **Sessões** (data, build, duração, gravações com erro, quantos "Projeto alterado fora da app").

## 6. Seção nova "Teste manual avançado" (A1 a A18)

Para o dono, depois do portão (8.7). Uma tabela com **Passo | O que fazer | Como saber se passou | Risco que sonda**, com os 18 itens da revisão (sessão longa, projeto grande, app + MCP simultâneos, duas abas em pasta, duas abas neste dispositivo, fechar o navegador, reinício/tela bloqueada, `file://` × Pages × preview, Edge, DPR e zoom, offline, imagens-limite, pasta sincronizada, git, undo profundo, só teclado, zip grande, especialização evoluindo). "Como saber se passou" é escrito em termos observáveis por uma pessoa (nada de `localStorage` ou prefixo `preview:`; o A8 vira "o projeto criado numa origem não aparece nos recentes da outra"). Achado aqui vira etapa seguinte (PLAN, "Fora desta etapa"), não correção nesta. O template usa o mesmo relato, modo "avançado".

## 7. Contrato com as fases vizinhas (texto neutro)

- **8.5 (MCP 0.3.3):** a seção 6 deixa de fixar `mcp-v0.3.2`/`0.3.2`: "baixe o `mapping-mcp.js` da Release `mcp-v…` mais recente; `node mapping-mcp.js --version` deve imprimir a versão em `mcp/version.ts` da `main` (e a Release com o mesmo número)"; "não use versão anterior à 0.3.2" continua verdadeiro com a 0.3.3. Onde o guia diz que `create_project` cria `images/` (se disser), escrevo "a pasta do projeto com o `mapping.json`" sem afirmar `images/` vazia. `root` relativo: o exemplo do `.mcp.json` já usa caminho relativo e continua igual.
- **8.1 (sessão) e 8.3 (foco/teclado):** nada muda agora. Passos que dependem do comportamento que elas vão mudar (Enter tira ou mantém o foco; `mapping.json` vazio) não são reescritos; a 8.7 recebe a lista.
- **8.7:** usa `docs/TESTING-COWORK.md` na rodada do portão e incorpora no guia o que 8.1/8.3/8.5 mudarem.

## 8. Prompt `docs/TESTING-COWORK.md` (esboço)

Cabeçalho (fora do prompt): o que é; como iniciar, com três mensagens-modelo: **completa** ("Leia `docs/TESTING-COWORK.md` e execute."), **dirigida** (por achados de um relato, por lista de passos, ou pelas fases de um `PLAN-etapa-*.md`), e o acréscimo opcional "passada visual: Detalhes, Propostas"; o que o dono prepara (sem fixar versão do MCP); o que não é coberto. `docs/history/etapa-6-testes-cowork.md` ganha só o aviso "histórico; o prompt vivo é `docs/TESTING-COWORK.md`" e o `history/` passa a guardar cópia por rodada quando o dono quiser.

1. **Papel e limites** (3 linhas): testador, não corrige; tela **e** disco; nunca ajusta um passo para passar.
2. **Antes de começar:** modo e alvo; **uma pergunta só** ao dono com o que ele preparou (URL/`index.html`, `mapping-mcp.js` e `--version`, Claude Code, shell, extensão de senha desativada); pasta de trabalho `~/mapping-testes/<data>/`; janela à vista, com foco e desbloqueada; build id; **estado prévio em uma frase**: "registre o que a tela inicial já mostra e, se souber, a chave `mapping.reviewResume`; não apague nada" (**G14**).
3. **Passos [pessoa]:** um bloco por roteiro (como hoje) **e**, em cada [pessoa], **uma mensagem com pergunta explícita** que termina com **"Estou esperando você fazer isto; me avise quando terminar."**; não faz nada até a resposta. **Qualquer espera de mais de 30 s** (captura, recarga, varredura) é avisada em uma linha. (**G11**)
4. **Como agir:** "siga o apêndice A do guia"; o prompt não repete convenções do guia. (**G14**)
5. **O que executar:** completa = ordem do quadro "Comece aqui" do guia (sem repetir a lista); **dirigida** com três alvos (**G12**): (a) achados de um relato (números ou códigos tipo A/G/O), (b) lista explícita de passos ("R0, R4.1 a R4.5, R6.8 a R6.11"), (c) fases de um `docs/history/PLAN-etapa-*.md`; o agente **monta a lista, mostra ao dono e pede confirmação** antes de começar; R0 sempre primeiro; dependências executadas e marcadas. **Passada visual** (**G13**): a lista de janelas que o dono der; sem lista, o padrão fixo: as sete janelas (Árvore, Camadas, Detalhes, Lista, Incompletas, Diagnóstico, Propostas) e os diálogos **Configurações**, **Exportar**, **Especializações**, **Pasta indisponível** e **Sair da revisão?**.
6. **Conferir e registrar** (como hoje: repro dupla, anexos, o que conta como achado).
7. **Relato incremental e fechamento** (como hoje, com o template novo: Resumo obrigatório e severidade pela escala do guia).
8. **Nunca** (como hoje).

## 9. Como cada achado fica verificável

| Achado          | Verificação                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1              | regra automática: nenhuma linha fora do apêndice A com rótulo `Agente:` / `Agente do Cowork` / `agente testador` / `Cowork`, nem com `aria-label`, `title`, `keydown`, `localStorage`, `<select>`, `<input` |
| G2              | o bloco [pessoa] do apêndice A tem 4 bullets; regra: nenhum bullet do guia (fora dos blocos de código) passa de 600 caracteres                                                                              |
| G3              | seção "Mapa da interface" existe com a tabela; regra: o título da seção existe                                                                                                                              |
| G4              | regra do G1 (DOM fora do apêndice); `**Agente:**` nos passos vira `**Claude Code:**` com prosa antes do JSON (aceite do agente novo)                                                                        |
| G5, G6, G9, G16 | lista de passos do PR, item a item, com o texto antes/depois; aceite do agente novo (R0 e R1 "de cabeça")                                                                                                   |
| G7              | regra: nenhuma linha de passo (Ação + Esperado) passa de 1.200 caracteres (hoje falham R5.4, R7.2, R5.2, R5.3, R8.1, R0.4)                                                                                  |
| G8              | regra: "Comece aqui" vem antes da seção 1 e cita a ordem; R5 aparece no texto depois de R7                                                                                                                  |
| G10             | regra: o guia cita `sha256` e **Verificar a pasta agora**, e não fixa `mcp-v0.` nem uma versão `0.3.x` como a esperada                                                                                      |
| G11             | regra: `docs/TESTING-COWORK.md` contém "Estou esperando" e "30 s"                                                                                                                                           |
| G12, G13        | regra: o prompt cita os três alvos e a lista padrão da passada visual; não contém "etapa 6"                                                                                                                 |
| G14             | aceite do segundo agente (só apêndice A + prompt cobrem "O que atrapalhou" dos relatos)                                                                                                                     |
| G15             | regra: o template tem **Resumo**, **Observações (sem severidade)**, **Pasta de trabalho**, **DPR**, **Estado prévio**, e a escala com as quatro severidades                                                 |

## 10. Regra automática

Um teste barato, `tests/tooling/testingGuide.test.ts` (ambiente node, roda no `npm test`), que lê `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `README.md` e `CLAUDE.md` e falha se:

1. houver, **fora do apêndice A** (do título "Apêndice A" até o "Apêndice B"), um rótulo de agente testador (`/\bAgente( do Cowork| testador)?\s*:|agente testador|\bCowork\b/`) ou um termo de DOM (`aria-label`, `` `title` ``, `keydown`, `localStorage`, `<select>`, `<input`);
2. um bullet passar de 600 caracteres ou uma linha de passo `| R…` passar de 1.200;
3. faltar no guia: "Comece aqui", "Mapa da interface", "Teste manual avançado", "Apêndice A", "Apêndice B", `sha256`, **Verificar a pasta agora**, e no template: **Resumo**, **Observações (sem severidade)**, a escala das quatro severidades; ou o guia fixar `mcp-v0.\d`;
4. o prompt não tiver "Estou esperando" e "30 s", ou citar "etapa 6";
5. `README.md` ou `CLAUDE.md` apontarem para `etapa-6-testes-cowork.md` como prompt em vez de `docs/TESTING-COWORK.md`.

As funções de checagem ficam no próprio teste e são exercitadas também contra **trechos do padrão antigo** (ex.: um bullet "Agente: confira o atributo `title` do elemento" fora do apêndice; o R5.4 de 2.200 caracteres), para provar no PR que a regra falha; o PR também mostra a saída da regra contra o `docs/TESTING.md` da `main` atual.

## 11. Perguntas ao coordenador

1. **`tests/tooling/testingGuide.test.ts`** está fora do "Toca em" da fase (que só lista docs). Proposto: incluir este único arquivo de teste (sugestão da própria ordem do coordenador).
2. **Códigos A1 a A18** do teste avançado colidem com os achados "A1 a A3" do relato da rodada 2 e com o nome "Apêndice A". Proposto (conservador): manter **A1 a A18** como no `PLAN.md`; os apêndices não numeram itens, e a seção avançada diz "não confundir com os achados A1–A3 do relato da rodada 2".
3. **Ordem:** proposto mover o texto do R5 para depois do R7 (código igual) **e** pôr o quadro "Comece aqui"; alternativa: só o quadro, sem mexer na ordem do texto.
4. **Tempo por roteiro** no quadro: não há medição nos relatos; proposto escrever estimativas marcadas como "aproximado" (pelo número de passos) e o template passar a registrar o tempo real para calibrar.
5. O aceite fala em "**quatro** relatos"; em `docs/history/` há três (`relato-2026-10-11.md`, `relato-2026-10-12-dirigida.md`, `relato-2026-10-12-dirigida-r3.md`). Proposto: o segundo agente usa os três (e o quarto, se o coordenador indicar onde está).

## 12. Respostas do coordenador (nota aprovada)

1. `tests/tooling/testingGuide.test.ts` entra no escopo (roda no projeto `app` do Vitest, pelo `npm test`).
2. A1 a A18 mantidos, com a frase de desambiguação.
3. O texto do R5 vai para depois do R7 (código igual), além do quadro "Comece aqui".
4. Tempos marcados como "aproximado"; o template registra o tempo real.
5. Os três relatos de `docs/history/`; o coordenador pergunta ao dono pelo quarto.
6. R7.2: lista numerada curta logo abaixo da tabela do R7, citada pelo passo; comandos no apêndice B.
7. Referências numéricas a seções do guia fora dos arquivos da fase não são editadas: vão para "Para a 8.7" no PR.
