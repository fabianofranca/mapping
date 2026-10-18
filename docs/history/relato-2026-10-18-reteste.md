# Relato de teste — Mapping (reteste PR #176)

- **Data:** 2026-10-18 · rodada dirigida, sem interação
- **Build testado:** `a536c98 · 2026-10-18` (preview `https://fabianofranca.github.io/mapping/preview/`, atualizado pela faixa **Atualizar**; estava em `33be65a`; não foi preciso Deploy)
- **Branch:** `ccr-a8bd7a2c-ayit6v` (PR #176), clonado em `~/mapping-testes/2026-10-18-pr176-reteste/repo`
- **Navegador:** Chrome pela extensão Claude in Chrome; janela 1368 × 607
- **Ferramenta:** dialog-pilot (versão não lida nesta rodada); sem MCP (nenhum passo pediu)
- **Estado prévio:** a tela inicial já tinha vários projetos recentes de rodadas anteriores (telas, vazio, biblioteca, antiga, migracao…); não foram mexidos.

## Resumo

**Nenhuma falha.** 9 itens do preparo e 8 passos (R3.10, R3.11, R10.1 a R10.5, passada visual do Catálogo): todos ✅. Os dois achados do relato anterior ([`relato-2026-10-18-fechamento.md`](relato-2026-10-18-fechamento.md)) estão corrigidos neste build:

- **R3.11:** o Diagnóstico mostra a seção "Biblioteca" com os 2 avisos de fonte de `material3.spec.json` depois de fechar e reabrir **e** depois de recarregar a página; o **Copiar** não leva os avisos.
- **R10.5:** o Chip abre no topo (`.catalog-detail.scrollTop` = 0) e "Destino não encontrado" fica visível no alto da área de rolagem, com o link no meio do documento.

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| Preparo 1–9 | ✅ | Ver "O que atrapalhou" (itens 4 e 7). |
| R3.10 | ✅ | 0 erro(s) e 42 aviso(s); lista com rolagem; **Aplicar** habilitado; "Salvo". **Disco:** 33 arquivos em `specs/material3/`, `specializations[]` com `file: specs/material3/material3.spec.json`. Divergência do texto do guia: o agrupamento mostra 31 avisos em `material3.spec.json` e 11 em `components/…` (guia diz 2 e 40); o total de 42 confere. |
| R3.11 | ✅ | Fechar/Abrir: seção Biblioteca com 2 avisos (`fonts[0].file`, `fonts[1].file`); recarregar (F5) e Abrir: o mesmo. **Copiar:** texto sem avisos, `errors: 0`. |
| R10.1 | ✅ | `scrollHeight` 607 = `innerHeight` 607 (janela não rola); margem de 16 px à esquerda; lista (`catalog-list-scroll` 476/417) e página (`catalog-detail` 1590/453) rolam cada uma por si; validação "0 erro(s) e 42 aviso(s)" recolhida; 15 componentes; Top app bar aberto. |
| R10.2 | ✅ | `chip` → só Chip; `zzz` → "Nenhum componente encontrado."; vazio → lista inteira; setas movem o foco sem rolar a página; Enter abre o item. |
| R10.3 | ✅ | Seções Documento, Propriedades (label, variant, icon, disabled), Código ("Nenhuma plataforma declarada…"), Origens (sdui), Galeria (4 imagens desenhadas, nenhuma com erro) e Experimentar. |
| R10.4 | ✅ | Label/Variant atualizam o desenho; Largura/Altura iniciais 83/40 (menor que 120, varia com a fonte do sistema); com Label "Confirmar compra", Largura 161 e o texto inteiro, sem aviso; 1000→240, 10→48, 500→80, 5→40; **Restaurar valores** volta a Label/filled/83/40 com a dica. |
| R10.5 | ✅ | "Ir para o Chip" abre o Chip no topo; "Destino que não existe" não navega e mostra "Destino não encontrado: mapping://nao-existe" (visível sem rolar, `role=status`); `<b>` aparece literal, imagem não carregada, 0 links externos. |
| Visual: Catálogo | ✅ | Sem barra horizontal (janela e áreas internas), sem texto cortado ou sobreposto, nem com **Mostrar problemas** aberto. Não há diálogo na tela, então não houve conferência de foco. |

## Achados

Nenhum.

## Observações (sem severidade)

1. O guia (R3.10) diz "2 avisos em `material3.spec.json` e 40 em `components/…`"; o app mostra 31 e 11 (total 42). Vale ajustar o texto do guia.
2. O guia (R10.4) diz Largura inicial "cerca de 87" e "cerca de 172" com o Label novo; aqui deu 83 e 161 (fonte do sistema), dentro do previsto pelo próprio guia.
3. Uma extensão do navegador (balão do Google Tradutor, `jfk-bubble`) fica sobre a página e interceptou um clique quando o layout mudou; foi preciso medir os campos de novo.

## O que atrapalhou

- **Preparo item 7:** o `list_windows` já mostrava "Mapping - Google Chrome" antes do clique no link (provável aba antiga de uma rodada anterior). O `tabs_context_mcp` passou a listar a aba "Mapping" só depois do clique, então a conferência bateu, mas a do `list_windows` é ambígua.
- **Preparo item 4/10:** o `select_folder` com `permissionButton: null` na segunda abertura da pasta do pacote (permissão já guardada); sem problemas.
- **Cliques por coordenada em R10.4:** a dica "Largura acompanha o conteúdo" some ao digitar a Largura e os campos sobem; os dois primeiros cliques seguintes caíram fora. Medi com `elementFromPoint` e usei as coordenadas novas (sem repetir a mesma ação mais de 2 vezes).
- **Faixa Atualizar:** depois do clique, a página recarrega e o menu lateral sobe; a conferência do build id precisou de uma nova captura antes de clicar em **Configurações**.
- O `git` na pasta montada não consegue apagar arquivos temporários (avisos `Operation not permitted`); o checkout funcionou, só ficaram arquivos temporários em `.git/`.
- Clipboard: o **Copiar** foi conferido interceptando `navigator.clipboard.writeText` na página, não pela área de transferência do sistema.

Anexos: capturas na sessão do testador, não copiadas para o repositório.
