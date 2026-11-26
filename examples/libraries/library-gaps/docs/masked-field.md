# Masked field

A text input (160 × 40): a bordered box with the `label` inside.

Fields:

- `label` (text, default `Phone`): the only field the drawing uses.
- `mask` (text): the input mask, such as `(##) #####-####`. Marked `codeOnly`: it is not drawn, only the code reads it.
- `keyboard` (`text`, `number`, `phone` or `email`): the keyboard type the code asks for. Marked `codeOnly` too.

A `codeOnly` field (specialization `formatVersion` 24) is a deliberately non-visual property: `validate_library` does not warn that the drawing leaves it out. If the drawing used it, the validator would warn `library.codeOnlyDrawn`.
