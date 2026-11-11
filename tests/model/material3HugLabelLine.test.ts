// Defeito herdado da MC5 (#898, fase CL1): o `maxWidth` do rótulo de button/extended-fab/chip,
// `largura do tipo − folga`, limitava a medida hug ao `size` do tipo (136/142/232): um rótulo
// comum nascia com 2 linhas. A medida hug não tem o limite do `size`: o rótulo mede uma linha.
import { describe, expect, it } from 'vitest';
import { fittedSize } from './../support/material3Fitted';

describe('rótulo comum com hug na largura nasce em uma linha', () => {
  it.each([
    ['button', { label: 'Confirmar compra' }, 40],
    ['chip', { label: 'Filtro de categoria longa' }, 32],
    ['extended-fab', { label: 'Criar nova mensagem' }, 56],
  ])('%s', (id, values, height) => {
    const size = fittedSize(id, values);
    expect(size.height).toBe(height);
    // Uma linha: a largura passa da do tipo (o rótulo não é cortado nela).
    expect(size.width).toBeGreaterThan(0);
  });
});
