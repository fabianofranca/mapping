import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  addImage,
  canPlaceImage,
  imageDeletionImpact,
  isSameAspect,
  moveImage,
  removeImage,
  replaceImage,
  resizeImage,
  uniqueImageFile,
} from '../../src/model';
import { emptyProject, expectValid, image, marking, sampleProject } from './fixtures';

describe('imagens: adicionar', () => {
  it('a primeira vai para a origem com lado maior = 1000', () => {
    const p = addImage(emptyProject(), {
      id: 'I1',
      file: 'images/a.jpg',
      width: 4000,
      height: 3000,
    });
    expect(image(p, 'I1').placement).toEqual({ x: 0, y: 0, scale: 0.25 });
  });

  it('as seguintes vão à direita da mais à direita, com espaçamento', () => {
    let p = sampleProject(); // I2 ocupa x 1050..2050
    p = addImage(p, { id: 'I3', file: 'images/c.jpg', width: 500, height: 2000 });
    expect(image(p, 'I3').placement).toEqual({ x: 2050 + IMAGE_GAP, y: 0, scale: 0.5 });
    expectValid(p);
  });

  it('rejeita arquivo repetido e dimensões inválidas', () => {
    const p = sampleProject();
    expect(() =>
      addImage(p, { id: 'X', file: 'images/frente.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
    expect(() =>
      addImage(p, { id: 'X', file: 'images/x.jpg', width: 0, height: 10 }),
    ).toThrow('invalid-dimensions');
  });

  it('gera nomes livres com sufixo -2, -3…', () => {
    const p = sampleProject();
    expect(uniqueImageFile(p, 'nova.jpg')).toBe('images/nova.jpg');
    expect(uniqueImageFile(p, 'frente.jpg')).toBe('images/frente-2.jpg');
    const q = addImage(p, {
      id: 'I3',
      file: 'images/frente-2.jpg',
      width: 10,
      height: 10,
    });
    expect(uniqueImageFile(q, 'frente.jpg')).toBe('images/frente-3.jpg');
    expect(uniqueImageFile(p, 'semextensao')).toBe('images/semextensao');
  });
});

describe('imagens: mover e redimensionar sem sobreposição', () => {
  it('move para um lugar livre', () => {
    const p = moveImage(sampleProject(), 'I2', 0, 800);
    expect(image(expectValid(p), 'I2').placement).toEqual({ x: 0, y: 800, scale: 1 });
  });

  it('encostar a borda não é sobreposição', () => {
    const p = moveImage(sampleProject(), 'I2', 1000, 0);
    expect(image(expectValid(p), 'I2').placement.x).toBe(1000);
  });

  it('rejeita posição que sobrepõe outra imagem', () => {
    const p = sampleProject();
    expect(canPlaceImage(p, 'I2', { x: 999, y: 0, scale: 1 })).toBe(false);
    expect(() => moveImage(p, 'I2', 999, 0)).toThrow('image-overlap');
  });

  it('redimensiona proporcionalmente se não sobrepuser', () => {
    const p = sampleProject();
    expect(() => resizeImage(p, 'I1', { x: 0, y: 0, scale: 0.5 })).toThrow(
      'image-overlap',
    );
    const q = resizeImage(p, 'I1', { x: 0, y: 0, scale: 0.2 });
    expect(image(expectValid(q), 'I1').placement.scale).toBe(0.2);
    expect(() => resizeImage(p, 'I1', { x: 0, y: 0, scale: 0 })).toThrow(
      'invalid-placement',
    );
  });
});

describe('imagens: excluir em cascata', () => {
  it('apaga marcações e anotações da imagem', () => {
    const p = sampleProject();
    expect(imageDeletionImpact(p, 'I1')).toEqual({
      markings: 3,
      annotations: 3,
      brokenRefs: 0,
    });
    const next = expectValid(removeImage(p, 'I1'));
    expect(next.images.map((i) => i.id)).toEqual(['I2']);
    expect(next.markings.map((m) => m.id)).toEqual(['M4']);
    expect(next.annotations.map((a) => a.id)).toEqual(['A4']);
  });
});

describe('imagens: trocar', () => {
  it('detecta mesma proporção com tolerância de 1%', () => {
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1500 }),
    ).toBe(true);
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1510 }),
    ).toBe(true);
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1600 }),
    ).toBe(false);
  });

  it('mesma proporção: reescala as marcações sem revisão e preserva a largura exibida', () => {
    const p = sampleProject();
    const next = expectValid(
      replaceImage(p, 'I1', { file: 'images/nova.jpg', width: 2000, height: 1500 }),
    );
    expect(image(next, 'I1')).toEqual({
      id: 'I1',
      name: null,
      markingColor: null,
      file: 'images/nova.jpg',
      width: 2000,
      height: 1500,
      placement: { x: 0, y: 0, scale: 0.5 },
    });
    expect(marking(next, 'M1').rect).toEqual({ x: 500, y: 500, width: 500, height: 500 });
    expect(marking(next, 'M2').rect).toEqual({ x: 600, y: 600, width: 200, height: 100 });
    expect(marking(next, 'M3').rect).toEqual({ x: 650, y: 625, width: 25, height: 25 });
    expect(next.markings.every((m) => !m.needsReview)).toBe(true);
    expect(marking(next, 'M4')).toBe(marking(p, 'M4'));
  });

  it('proporção diferente: exige confirmação e marca needsReview', () => {
    const p = sampleProject();
    const file = { file: 'images/nova.jpg', width: 4000, height: 4000 };
    expect(() => replaceImage(p, 'I1', file)).toThrow('aspect-change-not-confirmed');
    const next = expectValid(replaceImage(p, 'I1', file, { confirmAspectChange: true }));
    expect(marking(next, 'M1').rect).toEqual({
      x: 1000,
      y: 1333,
      width: 1000,
      height: 1334,
    });
    const own = next.markings.filter((m) => m.imageId === 'I1');
    expect(own.every((m) => m.needsReview)).toBe(true);
    expect(marking(next, 'M4').needsReview).toBe(false);
  });

  it('se a nova altura sobrepuser outra imagem, vai para um espaço livre', () => {
    let p = sampleProject();
    p = moveImage(p, 'I2', 0, 760); // logo abaixo de I1 (altura exibida 750)
    const next = expectValid(
      replaceImage(
        p,
        'I1',
        { file: 'images/alta.jpg', width: 4000, height: 4000 },
        { confirmAspectChange: true },
      ),
    );
    expect(image(next, 'I1').placement).toEqual({
      x: 1000 + IMAGE_GAP,
      y: 760,
      scale: 0.25,
    });
  });

  it('marcações que ficariam menores que o mínimo são aumentadas dentro do pai', () => {
    const p = sampleProject();
    const next = expectValid(
      replaceImage(p, 'I1', { file: 'images/mini.jpg', width: 400, height: 300 }),
    );
    // M3 (50×50) viraria 5×5: cresce para 8×8 continuando dentro de M2.
    expect(marking(next, 'M3').rect).toEqual({ x: 129, y: 124, width: 8, height: 8 });
  });

  it('imagem pequena demais para as marcações é rejeitada', () => {
    const p = sampleProject();
    expect(() =>
      replaceImage(
        p,
        'I1',
        { file: 'images/x.jpg', width: 4, height: 3 },
        { confirmAspectChange: true },
      ),
    ).toThrow('image-too-small');
  });
});
