# Rodada completa em 5 blocos — 2026-11-09 (épico `epic/rodada-4-blocos`)

## Pendências

- **Barra dos breadcrumbs / Ajuda (RB3):** o botão **Enquadrar tudo** passa a mostrar `Shift+1` no tooltip (o **Enquadrar seleção**, o ícone `fit-selection` e o `Shift+2` já estão no registro `2026-11-08-enquadrar-selecao.md`), e a lista de atalhos da Ajuda ganha a linha "Enquadrar tudo" (`Shift+1`) no grupo de visualização.

## Sincronização

Gravado no artefato Mapping do Claude Design em 2026-11-09 (índice `project/design-system.json`, lido imediatamente antes; versão 63 do artefato, `lastChange` por Claude via claude). A primeira tentativa de gravar foi recusada por "versão não vista"; reli o índice e os quatro arquivos (inalterados) e gravei de novo.

- **`Atalhos.md`:** linha "Enquadrar tudo | Shift+1" na tabela do grupo "Ver", antes de "Enquadrar a seleção"; o parágrafo do modo visualização deixa de dizer que o Enquadrar tudo não tem atalho e passa a dizer que os dois atalhos valem pela tecla física (`Digit1`, `Digit2`, para o ABNT2) e não agem com o foco num campo de texto.
- **`Breadcrumbs`:** `README.md` cita `Shift+1` no **Enquadrar tudo** (`fit`); `preview.html` ganha `aria-keyshortcuts="Shift+1"` nos dois botões **Enquadrar tudo** (as duas prévias).
- **`HelpDialog`:** `preview.html` ganha a linha "Enquadrar tudo | Shift 1" antes de "Enquadrar a seleção" no grupo de visualização (as duas ocorrências).

Só tokens e classes que já existiam; as prévias não foram renderizadas no navegador.

## Ficou sem gravar

Nada. (Não conferi o contraste das prévias nos temas claro e escuro: só entram uma linha de tabela e um atributo `aria-keyshortcuts`, sem cor nova.)
