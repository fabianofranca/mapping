# Relato de teste — Mapping (conferência do PR #179)

- **Build conferido:** `bcfbaf1 · 2026-10-19` (esperado `bcfbaf1`, o último commit do PR). O preview abriu com `6e66293 · 2026-10-19` (PR #177); a faixa **Atualizar** trouxe o build esperado, sem precisar do Deploy.
- **Painel da rodada:** https://claude.ai/artifact/3NkQ26jZ2Qc6KKAdBPmWet
- **Data:** 2026-10-18, das 22:24 às ~22:41 (horário local) · modo dirigido, sem interação
- **PR:** https://github.com/fabianofranca/mapping/pull/179 (base `epic/biblioteca`)
- **Forma de abrir:** preview (`https://fabianofranca.github.io/mapping/preview/`), sem Deploy do testador
- **Branch:** `ccr-c8d5ce72-cge8pu` em `bcfbaf1`
- **Navegador:** Chrome 155 pela extensão Claude in Chrome; viewport 1540 × 698, DPR 1,25; passada estreita a 902 px
- **Sistema:** Windows 10/11 (`galaxy-book-ff`)
- **Ferramenta:** agente com extensão do navegador e shell; dialog-pilot (versão não lida); MCP `mapping-mcp.js` 0.5.0-rc.1 por stdio (sha256 `91e31aeb…`, igual ao `.sha256`)
- **Lista dirigida:** R0.1; R5.2 e R5.2b; R5.3a a R5.3d e o resto do R5.3; R9.7 (texto novo); passada visual do Diagnóstico a ~900 px. O R6.1 segue pendente de decisão do dono e **não** foi executado.

## Resumo

**1 falha (média) e 1 ressalva (média). Nenhum achado impede o uso com pessoas.**

- Passos: 10 no total, 8 ✅, 1 ❌, 1 ⚠️, 0 não executados. Achados: bloqueia 0, alta 0, média 2, baixa 0.
- **❌ R5.3d (média):** com o foco no ✕ da anotação Button do Entrar (por Tab) e **Enter**, a anotação é rejeitada e não abre nota nova, mas o ✕ sai do DOM e o foco cai no `body`, 2 de 2.
- **⚠️ Visual (média):** a 902 px a aba **Diagnóstico** continua visível sem reativar (critério pedido), mas com Árvore + Diagnóstico + Detalhes abertos o Detalhes (560 px) termina em x 1191, ~289 px além da borda direita.
- R5.3a a R5.3c (✕ com o mouse, **Limpar** + ✕, **Limpar** + **Rejeitar** no popover) abrem a nota vazia e com o foco; o R9.7 funciona com o texto novo.

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| R0.1 | ✅ | Sobre: `bcfbaf1 · 2026-10-19`, canal prévia, formato 10 (primeiro `6e66293`; **Atualizar** trouxe o esperado). Diálogo sem rolagem horizontal; **Ver os atalhos de teclado** abre a Ajuda; **Esc** fecha e o foco fica em **Configurações**. |
| R5.2 | ✅ | Por stdio: `create_project` com `revision` 0, sem `images/`; `propose_changes` (22 operações) sem mexer no `mapping.json`. Na app: **Abrir pasta** e **Revisar**: 25 mudanças sem decisão; Proposto com Cadastro e Login; Atual "Nenhuma imagem ainda.". |
| R5.2b | ✅ | **Camadas** com Componentes, Eventos e Telas; **Nome** selecionada: caminho `Cadastro › Formulário › Nome`, barra `Nome`. |
| R5.3a | ✅ | ✕ do cartão com o mouse: 1 `textarea` vazio com o foco; 1 **Tab** fecha e o foco vai para "Aceitar Anotação Button criada". |
| R5.3b | ✅ | **Limpar** (só existe no popover do marcador) e ✕ de novo: o mesmo. |
| R5.3c | ✅ | **Limpar** e **Rejeitar** no popover: `textarea` vazio com o foco; `O Entrar é um link, não um botão.` + **Tab**: marcador "novo, rejeitado, com nota"; nota no `proposal.json`. |
| R5.3d | ❌ | Achado 1. Foco no ✕ por **Tab** e **Enter**: rejeita, não abre nota nova, mas o foco cai no `body`. |
| R5.3 (resto) | ✅ | Cadastro e Login aceitos ("12 mudança(s) aceita(s). 2 mudou(aram) junto, pelas dependências."), Senha rejeitada com nota. **Aplicar aceitas**: 20 aplicadas, `images/cadastro.webp`, `images/login.webp`, `specs/sdui.json`, revision 1; **Ctrl+Z** rev 2; **Ctrl+Shift+Z** rev 3. |
| R9.7 | ✅ | `telas` reaproveitado, `Configurações` no centro: Text field e Button "Em Configurações"; Row "3 de 8" → **Mover para a frente** "4 de 8", a Árvore acompanha (a tela herdada já tinha 6 irmãs). Não conferi a sobreposição X 80 / Y 230. |
| Visual: Diagnóstico | ⚠️ | A 902 px a faixa rolou sozinha (`scrollLeft` 86) e **Diagnóstico** ficou inteiro na faixa, sem reativar; `resize_window(900)` dá 886 px e o aviso "Abra numa janela maior" (esperado). Ressalva: Achado 2. |

## Achados

### 1. Média — R5.3d: Enter no ✕ do cartão rejeita, mas o foco cai no `body`

- **Passos:** revisão da `importacao`, marcação **Entrar**; anotação **Button** sem decisão (popover › **Limpar**); foco no ✓ do cartão, **Tab** (foco no ✕ "Rejeitar Anotação Button criada"), **Enter**.
- **Esperado:** rejeita, não abre a nota e não move o foco (`fieldDecision.test.tsx`, "pelo teclado: a rejeição não move o foco nem abre a nota").
- **Observado:** rejeitada; a nota não abre; o nó do ✕ é removido (o cartão passa a "Criação rejeitada"), `isConnected` = `false`, `document.activeElement` = `BODY`. 2 de 2.
- **Anexos:** `anexos-2026-10-19-pr179/proposal-importacao-apos-r53.json` (pasta de trabalho do testador).

### 2. Média — Detalhes passa da borda direita a ~900 px com Árvore, Diagnóstico e Detalhes abertos

- **Passos:** `telas`, com Árvore, Diagnóstico (`Ctrl+Shift+6`) e Detalhes abertos a 1540 px; `resize_window(916 × 883)` (`innerWidth` 902).
- **Esperado:** nada cortado nem fora da tela.
- **Observado:** Árvore 40–311, Diagnóstico 311–631, Detalhes 631–1191; ~289 px do Detalhes fora da tela, sem rolagem (`scrollWidth` = 902); o ✕ do Detalhes não aparece. 2 de 2.
- **Anexos:** `anexos-2026-10-19-pr179/achado2-detalhes-902px.jpg` (pasta de trabalho do testador).

## Regressões fora do alvo

- nenhuma observada

## Observações (sem severidade)

- **R9.7 em projeto reaproveitado:** a `Configurações` herdada tinha 6 irmãs; o Row foi de "3 de 8" a "4 de 8", não "2 de 4" como num projeto novo.
- **Popover do marcador:** abre sozinho quando o foco ou o mouse está no cartão e fica aberto ao tirar o mouse.
- **Nota da Senha:** o primeiro **Tab** sintético manteve o foco no `textarea`; o segundo saiu (apêndice A). Nos R5.3a a R5.3c, 1 **Tab** bastou.

## O que atrapalhou

- **Checkout do PR:** o `relato-2026-10-19-dirigida.md` local (não versionado) colidiu com o do PR; foi movido para fora. O `.git/index.lock` do checkout falho só saiu com a permissão de exclusão na pasta.
- **R9.7:** "deixe-a no centro da janela" não diz como. Funcionou: fechar a janela de baixo, **Enquadrar tudo** e arrastar o fundo do canvas até a `Configurações` ficar no centro. Com a tela fora do centro, o **Adicionar** cai na imagem Cadastro.
- **R5.3b:** o **Limpar** só existe no popover do marcador.
- **R5.3d depois do R5.3c:** com a nota já gravada, o "não abre a nota" fica menos nítido; seria melhor testar o d antes do c.
- **Janela:** `resize_window(900)` dá `innerWidth` 886; para ~900 px é preciso pedir ~916.
