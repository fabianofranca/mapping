# Relato de teste — Mapping (guia interativo e projeto de exemplo, PR #179)

- Modo: dirigido, sem interação — R0.1; R11.1 a R11.8 (no R11.2, temas e CSP); guia offline; passada visual (tela inicial e Ajuda › Guia interativo)
- **Build id conferido: `8145368 · 2026-10-19`** (o preview abriu com `47f3ce5`; **Atualizar** trouxe o esperado, sem Deploy)
- Painel: https://claude.ai/artifact/5XdzkotRq3yvBqrs8nBJac
- Navegador: Chrome 155 (Claude in Chrome), Windows 10/11; DPR 1,25; 1527 × 634
- Data: 2026-10-19, 05:55 a 06:08

## Resumo

- 12 passos: 10 ✅, 1 ⚠️ (R11.2, com o achado 1), 1 não executado (guia offline: a extensão não tem modo offline nem DevTools).
- Achados: 1 baixo. Não impede o uso com pessoas.

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| R0.1 | ✅ | `8145368 · 2026-10-19`, canal prévia, formato 10. |
| R11.1 | ✅ | **Abrir projeto de exemplo** e **Guia interativo** no lugar; o guia abre em aba nova (`/guia/index.html`), sem recurso externo. |
| R11.2 | ⚠️ | 12 passos navegáveis; marcações, painel e chips de camada funcionam; tema claro forçado renderiza bem; console sem erro de CSP. O guia não segue o tema claro da app no preview (achado 1). |
| R11.3 | ✅ | Seção **Guia interativo** é a primeira da Ajuda, com o link e a dica do exemplo. |
| R11.4 | ✅ | `exemplo-completo` com 4 telas, Neste dispositivo, "1 proposta(s) nova(s)"; Diagnóstico com os 2 avisos da fonte Roboto; Incompletas com o Chip Wi-Fi ("O componente não cabe"). |
| R11.5 | ✅ | Detalhes da app iguais ao painel do guia (Nome, Cadastrar, Idade); atalhos da tabela do guia conferem. |
| R11.6 | ✅ | Proposto/Atual; **Aceitar tudo**, **Rejeitar** Endereços, **Aplicar aceitas · 8**; Árvore com Perfil sem Endereços; `Ctrl+Z` volta tudo. |
| R11.7 | ✅ | `Alt+Shift+A` no Row Filtros: "Arrumado", Incompletas zera; `Ctrl+Z` desfaz. |
| R11.8 | ✅ | Fechar, linha `exemplo-completo` Neste dispositivo, **Excluir**; lista volta a 37 linhas; nenhum pedido de pasta. |
| Offline | não executado | A extensão não tem modo offline. Indício: `guia/index.html` está no cache do service worker do preview. |
| Visual: tela inicial | ✅ | Sem texto cortado nem rolagem horizontal. |
| Visual: Ajuda › Guia interativo | ✅ | Inteira; Esc e Fechar devolvem o foco ao botão **Ajuda**. |

## Achados

### 1. No preview, o guia não segue o tema escolhido na app (baixa)

- **Passos:** preview, Configurações › Tema › **Claro**; abrir o **Guia interativo**.
- **Esperado:** o guia abre claro.
- **Observado:** abre escuro (tema do sistema). O guia lê `mapping.theme`; a app do preview grava `preview:mapping.theme` (`channelStorageKey`, `src/utils/channel.ts`). No principal as chaves coincidem.

## Observações (sem severidade)

- Os avisos "8 mudança(s) aplicada(s)" (R11.6) e "Arrumado" (R11.7) são passageiros; conferidos pelo selo, pela Árvore e por observador de DOM.
- R11.7: "Alterações não exportadas" já aparece antes do Arrumar (as decisões da revisão a ligam).
- Sair da revisão com aceitas pendentes pede "Sair da revisão?"; o guia não cita o diálogo.

## O que atrapalhou

- Troca de commit em `repo/` com a permissão de exclusão e o relato não versionado movido para fora.
- O `find` da extensão apontou o alvo errado duas vezes; resolvido por captura e coordenada.
- O passo offline não tem como ser feito pela extensão.
