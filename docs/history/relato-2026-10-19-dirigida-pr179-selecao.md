# Relato de teste — Mapping (conferência da regra "seleção primeiro", PR #179)

- Build id conferido: **`47f3ce5 · 2026-10-19`** (a prévia abriu com `7dcee05`; **Atualizar** trouxe o esperado, sem Deploy)
- Painel de acompanhamento: https://claude.ai/artifact/M6dk5BGyQNGXacDDDok589
- Modo: dirigido, sem interação — R0.1, S1 a S5 (regra "seleção primeiro") e R9.7/R10.7 com o texto novo
- Navegador: Chrome pela extensão Claude in Chrome, Windows; canvas ~616 × 495 px
- Projeto: `telas` (pasta `repo-teste/design/mapeamentos/telas`), já com 8 marcações na `Configurações`; MCP não usado
- Data: 2026-10-19, 05:00 a 05:14 (Brasília)

## Resumo

- Passos: 7, 6 ✅ e 1 ⚠️ (R9.7, só pelos números de Ordem, que dependem do estado do projeto). Achados: nenhum.
- A regra nova se confirmou nos cinco cenários e no R10.7: seleção numa tela fora do centro, numa marcação de outra tela, na tela do centro, sem seleção e num container.

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| R0.1 | ✅ | `47f3ce5 · 2026-10-19`, canal prévia; Ajuda e Esc com o foco de volta em Configurações. |
| S1 | ✅ | `cadastro.png` no centro (41%), `Detalhes` selecionada: Text field "Em Detalhes", X 40 / Y 360 (centro da tela), zoom igual, a vista andou até ele. |
| S2 | ✅ | Button da `Configurações` selecionado, foto no centro (12%): Button novo "Em Configurações", X 120 / Y 380; vista parada, visível. |
| S3 | ✅ | `cadastro.png` (a do centro) selecionada: nasce no centro da vista (X 308 / Y 204); vista parada. |
| S4 | ✅ | Nada selecionado: entra na tela do centro (`cadastro.png`). |
| S5 | ✅ | Row selecionado: Chip com Marcação pai = Row, Ordem 4 de 4. |
| R9.7 | ⚠️ | Comportamento certo (Button em X 80 / Y 230 cobre o começo do texto; com o Text field à frente, o texto aparece inteiro). Row 4 → 5 de 11 em vez de "2 → 3 de 4" (projeto reaproveitado). |
| R10.7 | ✅ | Componentes (15, validação no topo); **Adicionar à tela** na `Configurações` selecionada; Paleta também. Sem seleção e fundo vazio no centro (6%): desabilitado, dica "Selecione ou centralize uma tela". Tela selecionada fora de vista (68%): habilitado, entra nela, zoom igual e a vista vai até ela. Disco: revisão 65, 14 `m3-button`. |

## Achados

Nenhum.

## Observações (sem severidade)

1. R9.7: os números de Ordem do guia só valem num projeto novo (guia ajustado para "sobe uma posição").
2. R10.7: o "desabilitado" só acontece com fundo vazio no centro da vista; com outra imagem no centro, o componente vai para ela, como no S4 (guia ajustado).
3. Com a tela fora de vista, o pan mínimo deixou a marcação nova quase toda sob o minimapa (canto inferior direito).
4. No S1 ficou uma faixa da `Detalhes` visível; a variante totalmente fora de vista foi coberta no R10.7.

## O que atrapalhou

- Extensão do Chrome desconectada por ~10 min no início (reconectada pelo dono); acesso à pasta e permissão de exclusão pedidos de novo.
- `accept_permission_prompt` não achou o pedido da pasta; `click_button("Permitir")` resolveu.
- A roda do mouse sem Ctrl não faz pan; o zoom ancora no ponteiro. Selecionar pela Árvore leva a vista até o item, o que atrapalha preparar "foto no centro".
