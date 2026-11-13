# Tema escuro e acabamentos — 2026-11-11 (épico `epic/tema-escuro-acabamento`)

## Pendências

- **`Container`:** o título do container ganha contorno da cor da superfície (`--color-surface`, espessura de 2 px de tela), para se ler sobre a imagem de qualquer raiz nos dois temas. Sem token novo.
- **`Canvas.md`:** o selo de chegada ("Veio de…") fica invertido, como a dica: caixa `--color-text` e rótulo `--color-surface` (escura no claro, clara no escuro). Contorno, raio e medidas não mudam.
- **Campo e célula `ref` (`.ref-control`):** a referência quebrada quebra entre palavras (`overflow-wrap: break-word` e `min-width: min-content` na célula quebrada), sem partir "referência".
- **`Home`:** a descrição dos botões das linhas recentes (`aria-describedby`) traz o último uso com segundos, num texto só para o leitor de tela. Sem mudança visível.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-11: versão 80 (`1794364519-6f16`). Texto dos guias, nos arquivos `project/Canvas.md` (título do container com contorno de `color-surface`; selo "Veio de…" invertido, `color-text` com rótulo `color-surface`, e a linha de tokens de revisão e chegadas), `components/Container/README.md` (contorno do título), `components/RefCell/README.md` e `components/ReferenceField/README.md` (a referência quebrada quebra com `overflow-wrap: break-word`; na célula, `min-width: min-content`) e `components/Home/README.md` (descrição dos botões das linhas recentes com segundos, só para o leitor de tela). Índice `project/design-system.json` lido logo antes e gravado por último, com `lastChange`. Nenhum token, ícone nem arquivo foi acrescentado ou apagado; `tokens.json` não mudou (nenhum token novo).

## Ficou sem gravar

- Passou para o registro do épico `epic/sobras-do-testador`: previews de `Container`, `RefCell` e `ReferenceField` (título com o contorno de `--color-surface` e a referência quebrada entre palavras na célula a 900 px), a regenerar conferindo os temas claro e escuro num navegador. O preview de `Home` fica como está: a mudança é só para o leitor de tela (`aria-describedby`).
- Passou para o registro do épico `epic/sobras-do-testador`: o selo "Veio de…" (`Canvas.md`) não ganha preview; fica descrito no guia, como o `CommentPin` (só guia, sem preview), porque é desenho do Konva e não há componente do DS para ele.
