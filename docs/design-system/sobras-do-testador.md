# Sobras do testador — [Não lançado] (épico `epic/sobras-do-testador`)

## Pendências

- Regenerar os previews de `Container` (título com o contorno de `--color-surface`), `RefCell` e `ReferenceField` (a referência quebrada quebra entre palavras na célula a 900 px), conferindo os temas claro e escuro num navegador. Vêm do "Ficou sem gravar" de `2026-11-11-tema-escuro-acabamento.md`; só o fechamento grava, pelo "Ao gravar" do `docs/DESIGN-SYSTEM.md`.
- O preview de `Home` fica como está: a mudança dele é só para o leitor de tela (`aria-describedby`).
- O selo "Veio de…" não ganha preview: é desenho do Konva, já descrito no guia `Canvas.md`, como o `CommentPin` ("só guia, sem preview"), e não há componente do DS para ele.
- CL1 (passada visual a 900×720), ao regenerar os previews: `CatalogWindow` (a linha da Paleta quebra: nome inteiro e o botão **Adicionar** desce para a linha de baixo), `Tabs`/`BottomTabs` (vão de 4 px entre as abas da janela inferior), `TreeRow` e `ToolWindow` (dica `title` no rótulo e no título cortados), a seção de Detalhes por camada (nota "Nenhuma anotação nesta camada." abaixo do cabeçalho) e as tabelas do Catálogo (`overflow-wrap` das células do markdown; entrada da lista com `flex-wrap`).

## Sincronização

Nada foi gravado no artefato Mapping do Claude Design durante a fase: só o fechamento grava.

## Ficou sem gravar

Nada.
