# Seleção múltipla — 2026-11-04 (épico `epic/selecao-multipla`)

## Sincronização

Versões 25 (conteúdo) e 26 (índice) do artefato. **`Atalhos.md`:** a linha do Shift+clique cita Ctrl+clique (Cmd+clique no macOS); linhas novas "Selecionar por retângulo" (Shift+arrasto) e "Mover a seleção" (←↑→↓, 1 px; Shift, 10 px); parágrafo "Seleção múltipla" (no macOS o Ctrl+clique segue sendo o clique direito; o Shift+arrasto só soma; as setas só valem com o foco no canvas ou fora de controles, e não em somente leitura nem na revisão). **`Canvas.md`:** linha e parágrafo do retângulo de seleção (borda tracejada em `cv-select`, preenchimento `cv-select-fill`, sem halo nem prévia ao vivo, na camada de sobreposições) e `cv-select-fill` na tabela de tokens. **`tokens.json`:** token novo `cv-select-fill` (`rgba(77, 141, 255, 0.15)`, o mesmo nos dois temas; 141 tokens no artefato, 146 no código). **`Contraste.md`:** o par borda sobre preenchimento (2,26:1 no claro, 5,09:1 no escuro). **Não gravado:** a frase da introdução da Ajuda e a lista antiga no preview do `HelpDialog` (ver Pendências).

## Ficou sem gravar

- **Preview do `HelpDialog` (e a frase da introdução, SM3).** O preview estático `project/components/HelpDialog/preview.html` ainda mostra a lista de atalhos antiga ("Acrescentar ou tirar da seleção (Shift+clique no canvas e na Árvore)", sem as linhas "Selecionar por retângulo" e "Mover a seleção") e a introdução sem o "(só o clique da seleção usa Cmd)" (`help.shortcuts.intro` em `src/i18n/`). Refazer o preview inteiro a partir de `src/ui/shortcutList.ts` e da introdução, junto de "Previews não mostram o estado novo"; remendar só a frase o deixaria pela metade.
- **Contraste do retângulo de seleção.** `renderMarquee` (`src/canvas/renderers/overlay.ts`) desenha só a borda e o preenchimento, sem o halo `cv-halo` da seleção comum: a borda mede 2,26:1 sobre o canvas claro (abaixo de 3:1). Registrado em `project/Contraste.md`; a decisão é do dono (issue `roadmap` #456).
