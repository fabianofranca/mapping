# Endpoint

The endpoint that delivers a screen or a block. It applies only to markings (not to arrows): it describes what the area shows.

Annotation type: `sdui-endpoint` (Endpoint).

## Fields

| Key        | Label            | Type   | Required | Options | Default |
| ---------- | ---------------- | ------ | -------- | ------- | ------- |
| `url`      | URL              | string | yes      |         |         |
| `typeName` | Type da resposta | string | no       |         |         |
| `typeRef`  | Declaration      | ref    | no       |         |         |
| `params`   | Parameters       | table  | no       |         |         |

## Examples

- **Settings screen**: url=/v1/screens/settings

## When to use

Only on markings: the type declares `appliesTo: ["marking"]`, so the app does not offer it on an arrow.
