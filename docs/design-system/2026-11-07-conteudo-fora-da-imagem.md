# Content outside the image — 2026-11-07 (épico `epic/conteudo-fora-da-imagem`)

## Pendências

- CF1: nenhuma (no interface).
- CF3, `ReferenceField` and `RefCell` (`src/ui/RefPicker.tsx`): the picker gains the whole-annotation target type (`{ annotationId }`), shown with the label and, on the row's tag, the type name (in place of "free"); when the field accepts annotations, the filter tabs gain one per type (after the tags and before "Free"), and the "accepts: …" line lists the types. New states for the previews: picker with an annotation target, active type tab and the empty state "No annotation of the … types".
- CF3, Details panel (`src/ui/ReferencedBy.tsx`, new): the **Referenced by** row on the typed annotation card, in the mold of "Linked" (`annotation-linked-summary`, read-only): the label and a `link-button` button per source ("type · label (marking)"), in a group with an accessible name. New component without a guide: `ReferencedByRow`, together with what `LinkedRow` covers (no token, icon or section new).

## Sincronização

Versões 58 (content) and 59 (index) of the artifact, from 2026-11-07. **New component (`README.md` guide only, no `preview.html`):** `ReferencedByRow` (the Referenced by row). **Changed guides:** `ReferenceField` (whole-annotation target, tab per type, "Free" without whole annotation) and `RefCell` (accepted annotations and tabs per type). **Tokens, icons and `bundle.css`:** none new. Nothing was deleted.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: the new `ReferencedByRow` preview and the new states in the `ReferenceField` and `RefCell` previews (picker with an annotation target, active type tab, empty state "No annotation of the … types") (DS5).
