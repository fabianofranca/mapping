# Faster zoom in large projects — 2026-11-04 (epic `epic/zoom-rapido`, PR #434, MCP 0.13.0, schema v13)

## Alterado

- Canvas zoom in large projects got faster: the stage position and scale are now applied in a single transform per frame (before, zooming triggered three cascades of transforms). In the performance budget scenario (500 markings, semantic zoom, 200 arrows), the median zoom frame dropped from about 7.8 to 5.9 ms. Pan and editing do not change; the 16 ms budget stays the same.
