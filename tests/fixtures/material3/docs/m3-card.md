# Card

Elevated, filled or outlined card; medium shape (12); headline, subhead, supporting text and room for actions.

Annotation type: `m3-card` (Card).

## Size

- Initial: 360 × 200 px
- Minimum: 160 × 96 px
- Sizing: width fill, height hug

## Fields

| Key | Label | Type | Required | Options | Default | Description |
| ---------- | --------------- | ------ | ----------- | -------------------------- | -------- | --------- |
| `headline` | Headline        | string | yes |                            |          |           |
| `subhead`  | Subhead         | string | no |                            |          |           |
| `body`     | Supporting text | string | no |                            |          |           |
| `variant`  | Variant         | enum   | no | elevated, filled, outlined | elevated |           |

## Slot

This component has a slot that receives the children (`ações`).

## Examples

- **Default**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=elevated
- **Filled**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=filled
- **Outlined**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=outlined

## External origin

System `sdui`: external type `Card`.

- Slot: `ações`

| Field | Path in `props` |
| ---------- | ------------------ |
| `headline` | `headline`         |
| `subhead`  | `subhead`          |
| `body`     | `body`             |
| `variant`  | `style`            |
