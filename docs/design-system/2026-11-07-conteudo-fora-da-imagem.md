# Conteúdo fora da imagem — 2026-11-07 (épico `epic/conteudo-fora-da-imagem`)

## Pendências

- CF1: nenhuma (sem interface).
- CF3, `ReferenceField` e `RefCell` (`src/ui/RefPicker.tsx`): o seletor ganha o alvo do tipo anotação inteira (`{ annotationId }`), mostrado com o rótulo e, na etiqueta da linha, o nome do tipo (no lugar de "livre"); quando o campo aceita anotações, as abas de filtro ganham uma por tipo (depois das etiquetas e antes de "Livres"), e a linha "aceita: …" lista os tipos. Estados novos para os previews: seletor com alvo de anotação, aba de tipo ativa e o vazio "Nenhuma anotação dos tipos …".
- CF3, painel Detalhes (`src/ui/ReferencedBy.tsx`, novo): a linha **Referenciada por** no cartão da anotação tipada, no molde de "Vinculadas" (`annotation-linked-summary`, só leitura): o rótulo e um botão `link-button` por origem ("tipo · rótulo (marcação)"), em grupo com nome acessível. Componente novo sem guia: `ReferencedByRow`, junto do que cobre o `LinkedRow` (sem token, ícone nem seção novos).

## Sincronização

Versões 58 (conteúdo) e 59 (índice) do artefato, de 2026-11-07. **Componente novo (só guia `README.md`, sem `preview.html`):** `ReferencedByRow` (a linha Referenciada por). **Guias alterados:** `ReferenceField` (alvo de anotação inteira, aba por tipo, "Livres" sem anotação inteira) e `RefCell` (anotações aceitas e abas por tipo). **Tokens, ícones e `bundle.css`:** nenhum novo. Nada foi apagado.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: a prévia nova do `ReferencedByRow` e os estados novos nas prévias de `ReferenceField` e `RefCell` (seletor com alvo de anotação, aba de tipo ativa, vazio "Nenhuma anotação dos tipos …") (DS5).
