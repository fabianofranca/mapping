# Spinner

A ring that shows progress. The stroke reads `{ "$provided": "content-color", "default": { "$field": "color" } }`: inside another component it takes the content color the outer one passes with `provide`; alone, it takes its own `color` field.

Annotation type: `spinner` (Spinner).

| Field   | Type   | Description                           |
| ------- | ------ | ------------------------------------- |
| `size`  | enum   | `small` (16) or `medium` (24)         |
| `color` | string | Stroke color when nothing is provided |
