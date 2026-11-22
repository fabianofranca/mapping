# Package image fixes — [Não lançado] (épico `epic/package-image-fixes`)

## Alterado

- A package image over the limits or not in the format of its extension shows its own drawing warning (`package-image-refused`) instead of the decode one; a missing package image shows no drawing warning (the library check already reports it). The viewer (`mapping-viewer` 0.8.0) exports the new `RenderWarningCode`.

## Corrigido

- A linear gradient on the stroke of an ellipse is no longer shifted by half the box.
