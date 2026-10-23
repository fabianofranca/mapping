import { describe, expect, it } from 'vitest';
import {
  IMAGES_DIR,
  IMAGE_GAP,
  MAPPING_FILE,
  addBackgroundContainer,
  addContainer,
  MAX_CONTAINER_SIZE,
  createMarking,
  isBackgroundContainer,
  setBackgroundContainer,
  setImageLocked,
  setMarkingLocked,
  canPlaceContainer,
  containerDeletionImpact,
  containerLockStates,
  isSameAspect,
  moveContainer,
  removeContainer,
  replaceContainer,
  resizeContainer,
  settleHierarchy,
  uniqueImageFile,
} from '../../src/model';
import { emptyProject, expectValid, image, marking, sampleProject } from './fixtures';

describe('imagens: adicionar', () => {
  it('a primeira vai para a origem com lado maior = 1000', () => {
    const p = addContainer(emptyProject(), {
      id: 'I1',
      file: 'images/a.jpg',
      width: 4000,
      height: 3000,
    });
    expect(image(p, 'I1').placement).toEqual({ x: 0, y: 0, scale: 0.25 });
  });

  it('as seguintes vão à direita da mais à direita, com espaçamento', () => {
    let p = sampleProject(); // I2 ocupa x 1050..2050
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 500, height: 2000 });
    expect(image(p, 'I3').placement).toEqual({ x: 2050 + IMAGE_GAP, y: 0, scale: 0.5 });
    expectValid(p);
  });

  it('rejeita arquivo repetido e dimensões inválidas', () => {
    const p = sampleProject();
    expect(() =>
      addContainer(p, { id: 'X', file: 'images/frente.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
    expect(() =>
      addContainer(p, { id: 'X', file: 'images/x.jpg', width: 0, height: 10 }),
    ).toThrow('invalid-dimensions');
  });

  it('gera nomes livres com sufixo -2, -3…', () => {
    const p = sampleProject();
    expect(uniqueImageFile(p, 'nova.jpg')).toBe('images/nova.jpg');
    expect(uniqueImageFile(p, 'frente.jpg')).toBe('images/frente-2.jpg');
    const q = addContainer(p, {
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
    const p = moveContainer(sampleProject(), 'I2', 0, 800);
    expect(image(expectValid(p), 'I2').placement).toEqual({ x: 0, y: 800, scale: 1 });
  });

  it('encostar a borda não é sobreposição', () => {
    const p = moveContainer(sampleProject(), 'I2', 1000, 0);
    expect(image(expectValid(p), 'I2').placement.x).toBe(1000);
  });

  it('rejeita posição que sobrepõe outra imagem', () => {
    const p = sampleProject();
    expect(canPlaceContainer(p, 'I2', { x: 999, y: 0, scale: 1 })).toBe(false);
    expect(() => moveContainer(p, 'I2', 999, 0)).toThrow('image-overlap');
  });

  it('redimensiona proporcionalmente se não sobrepuser', () => {
    const p = sampleProject();
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.5 })).toThrow(
      'image-overlap',
    );
    const q = resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.2 });
    expect(image(expectValid(q), 'I1').placement.scale).toBe(0.2);
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0 })).toThrow(
      'invalid-placement',
    );
  });
});

describe('imagens: excluir em cascata', () => {
  it('apaga marcações e anotações da imagem', () => {
    const p = sampleProject();
    expect(containerDeletionImpact(p, 'I1')).toEqual({
      markings: 3,
      lockedMarkings: 0,
      annotations: 3,
      arrows: 0,
      brokenRefs: 0,
    });
    const next = expectValid(removeContainer(p, 'I1'));
    expect(next.containers.map((i) => i.id)).toEqual(['I2']);
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
      replaceContainer(p, 'I1', { file: 'images/nova.jpg', width: 2000, height: 1500 }),
    );
    expect(image(next, 'I1')).toEqual({
      id: 'I1',
      name: null,
      parentId: null,
      markingColor: null,
      locked: false,
      source: null,
      file: 'images/nova.jpg',
      background: null,
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
    expect(() => replaceContainer(p, 'I1', file)).toThrow('aspect-change-not-confirmed');
    const next = expectValid(
      replaceContainer(p, 'I1', file, { confirmAspectChange: true }),
    );
    expect(marking(next, 'M1').rect).toEqual({
      x: 1000,
      y: 1333,
      width: 1000,
      height: 1334,
    });
    const own = next.markings.filter((m) => m.containerId === 'I1');
    expect(own.every((m) => m.needsReview)).toBe(true);
    expect(marking(next, 'M4').needsReview).toBe(false);
  });

  it('se a nova altura sobrepuser outra imagem, vai para um espaço livre', () => {
    let p = sampleProject();
    p = moveContainer(p, 'I2', 0, 760); // logo abaixo de I1 (altura exibida 750)
    const next = expectValid(
      replaceContainer(
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
      replaceContainer(p, 'I1', { file: 'images/mini.jpg', width: 400, height: 300 }),
    );
    // M3 (50×50) viraria 5×5: cresce para 8×8 continuando dentro de M2.
    expect(marking(next, 'M3').rect).toEqual({ x: 129, y: 124, width: 8, height: 8 });
  });

  it('imagem pequena demais para as marcações é rejeitada', () => {
    const p = sampleProject();
    expect(() =>
      replaceContainer(
        p,
        'I1',
        { file: 'images/x.jpg', width: 4, height: 3 },
        { confirmAspectChange: true },
      ),
    ).toThrow('image-too-small');
  });
});

// Nomes da pasta do projeto, num só lugar para a app (`src/storage/`) e o servidor MCP (fase 8.5, M10).
describe('arquivos da pasta do projeto', () => {
  it('mapping.json e images/', () => {
    expect(MAPPING_FILE).toBe('mapping.json');
    expect(IMAGES_DIR).toBe('images');
    expect(uniqueImageFile(emptyProject(), 'a.png')).toBe(`${IMAGES_DIR}/a.png`);
  });
});

describe('container (imagem sem arquivo)', () => {
  const bgContainer = (p = sampleProject()) =>
    addBackgroundContainer(p, {
      id: 'B1',
      width: 390,
      height: 844,
      background: '#ffffff',
      name: '  Login  ',
    });

  it('addBackgroundContainer: cor em maiúsculas, nome normalizado, lado maior = 1000', () => {
    const p = bgContainer();
    const b = image(p, 'B1');
    expect(isBackgroundContainer(b)).toBe(true);
    expect(isBackgroundContainer(image(p, 'I1'))).toBe(false);
    expect(b).toMatchObject({
      file: null,
      background: '#FFFFFF',
      name: 'Login',
      width: 390,
      height: 844,
      locked: false,
      markingColor: null,
      source: null,
    });
    expect(b.placement.scale).toBeCloseTo(1000 / 844);
    // À direita da imagem mais à direita (I2 ocupa x 1050..2050).
    expect(b.placement.x).toBe(2050 + IMAGE_GAP);
    expectValid(p);
  });

  it('addBackgroundContainer: perto de `center`, sem sobrepor', () => {
    const p = addBackgroundContainer(sampleProject(), {
      id: 'B1',
      width: 100,
      height: 100,
      background: '#000000',
      center: { x: 5000, y: 5000 },
    });
    expect(image(p, 'B1').placement).toEqual({ x: 4500, y: 4500, scale: 10 });
    expectValid(p);
  });

  it('addBackgroundContainer: valida id, cor e dimensões (1 a MAX_CONTAINER_SIZE)', () => {
    const p = sampleProject();
    const args = { id: 'B1', width: 10, height: 10, background: '#000000' };
    expect(() => addBackgroundContainer(p, { ...args, id: 'I1' })).toThrow(
      'duplicate-id',
    );
    expect(() => addBackgroundContainer(p, { ...args, background: 'preto' })).toThrow(
      'invalid-color',
    );
    expect(() => addBackgroundContainer(p, { ...args, width: 0 })).toThrow(
      'invalid-dimensions',
    );
    expect(() => addBackgroundContainer(p, { ...args, height: 1.5 })).toThrow(
      'invalid-dimensions',
    );
    expect(() =>
      addBackgroundContainer(p, { ...args, width: MAX_CONTAINER_SIZE + 1 }),
    ).toThrow('invalid-dimensions');
    expectValid(addBackgroundContainer(p, { ...args, width: MAX_CONTAINER_SIZE }));
  });

  it('as imagens sem arquivo não ocupam nomes de arquivo', () => {
    const p = bgContainer();
    expect(uniqueImageFile(p, 'frente.jpg')).toBe('images/frente-2.jpg');
    expect(uniqueImageFile(p, 'nova.jpg')).toBe('images/nova.jpg');
    const q = addContainer(p, {
      id: 'I3',
      file: 'images/nova.jpg',
      width: 10,
      height: 10,
    });
    expectValid(q);
    expect(() =>
      addContainer(q, { id: 'I4', file: 'images/nova.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
  });

  it('replaceImage recusa o container', () => {
    expect(() =>
      replaceContainer(bgContainer(), 'B1', {
        file: 'images/x.png',
        width: 390,
        height: 844,
      }),
    ).toThrow('container-without-file');
  });

  describe('setBackgroundContainer', () => {
    it('muda a cor sem mexer na geometria (nem com a imagem trancada)', () => {
      const p = setImageLocked(bgContainer(), 'B1', true);
      const q = setBackgroundContainer(p, 'B1', { background: '#abcdef' });
      expect(image(q, 'B1')).toMatchObject({
        background: '#ABCDEF',
        width: 390,
        height: 844,
      });
      expect(setBackgroundContainer(q, 'B1', { background: '#ABCDEF' })).toBe(q);
      expect(() => setBackgroundContainer(p, 'B1', { background: 'x' })).toThrow(
        'invalid-color',
      );
    });

    it('muda o tamanho mantendo a escala do placement', () => {
      const p = bgContainer();
      const scale = image(p, 'B1').placement.scale;
      const q = setBackgroundContainer(p, 'B1', { width: 200, height: 300 });
      expect(image(q, 'B1')).toMatchObject({ width: 200, height: 300, file: null });
      expect(image(q, 'B1').placement).toEqual(image(p, 'B1').placement);
      expect(image(q, 'B1').placement.scale).toBe(scale);
      expectValid(q);
    });

    it('recusa dimensões inválidas, imagem com arquivo e tamanho em imagem trancada', () => {
      const p = bgContainer();
      expect(() => setBackgroundContainer(p, 'B1', { width: 0 })).toThrow(
        'invalid-dimensions',
      );
      expect(() =>
        setBackgroundContainer(p, 'B1', { height: MAX_CONTAINER_SIZE + 1 }),
      ).toThrow('invalid-dimensions');
      expect(() => setBackgroundContainer(p, 'I1', { background: '#000000' })).toThrow(
        'container-has-file',
      );
      expect(() =>
        setBackgroundContainer(setImageLocked(p, 'B1', true), 'B1', { width: 200 }),
      ).toThrow('locked');
    });

    it('recusa o tamanho que deixaria uma marcação de fora', () => {
      let p = bgContainer();
      p = createMarking(p, {
        id: 'MB',
        containerId: 'B1',
        rect: { x: 100, y: 600, width: 200, height: 200 },
      });
      expect(() => setBackgroundContainer(p, 'B1', { height: 700 })).toThrow(
        'rect-out-of-image',
      );
      // Marcação trancada não muda nada: a regra é a mesma.
      const locked = setMarkingLocked(p, 'MB', true);
      expect(() => setBackgroundContainer(locked, 'B1', { width: 250 })).toThrow(
        'rect-out-of-image',
      );
      const grown = setBackgroundContainer(p, 'B1', { width: 500, height: 900 });
      expect(image(grown, 'B1')).toMatchObject({ width: 500, height: 900 });
      expectValid(grown);
    });

    it('recusa o tamanho que faria a imagem sobrepor outra', () => {
      const p = bgContainer();
      const next = addBackgroundContainer(p, {
        id: 'B2',
        width: 100,
        height: 100,
        background: '#000000',
      });
      // B1 e B2 lado a lado: aumentar B1 (mesma escala) invade B2.
      expect(() => setBackgroundContainer(next, 'B1', { width: 2000 })).toThrow(
        'image-overlap',
      );
      expectValid(setBackgroundContainer(next, 'B1', { width: 400 }));
    });
  });
});

// Pertencimento (v13): o container nasce sem pai e o assentar decide qual marcação do canvas o
// contém; mover, redimensionar, trocar o arquivo e excluir assentam; `settle: false` congela.
describe('containers: pertencimento a marcações do canvas', () => {
  /** sampleProject: I1 ocupa (0,0)–(1000,750) e I2 (1050,0)–(2050,1000); K cerca só a I1. */
  function withCanvasMarking() {
    return createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: -100, y: -100, width: 1200, height: 1000 },
    });
  }

  it('o container nasce sem pai; o projeto de exemplo não tem marcação do canvas', () => {
    const p = addContainer(sampleProject(), {
      id: 'I3',
      file: 'images/c.jpg',
      width: 100,
      height: 100,
    });
    expect(image(p, 'I3').parentId).toBeNull();
    expect(p.containers.every((c) => c.parentId === null)).toBe(true);
  });

  it('criar a marcação do canvas assenta: só a I1 cabe nela', () => {
    const p = expectValid(withCanvasMarking());
    expect(image(p, 'I1').parentId).toBe('K');
    expect(image(p, 'I2').parentId).toBeNull();
    expect(marking(p, 'K')).toMatchObject({ containerId: null, parentId: null });
    // As marcações das imagens ficam como estavam.
    expect(marking(p, 'M1').containerId).toBe('I1');
  });

  it('mover o container para fora da marcação o tira; para dentro o põe', () => {
    let p = withCanvasMarking();
    p = expectValid(moveContainer(p, 'I1', 0, 2000));
    expect(image(p, 'I1').parentId).toBeNull();
    // Volta: I1 (1000×750) cabe de novo em K.
    p = expectValid(moveContainer(p, 'I1', 0, 0));
    expect(image(p, 'I1').parentId).toBe('K');
  });

  it('o container que passa a caber inteiro em outra marcação do canvas vira membro dela', () => {
    let p = createMarking(sampleProject(), {
      id: 'K2',
      containerId: null,
      rect: { x: -50, y: 1500, width: 1200, height: 900 },
    });
    expect(image(p, 'I2').parentId).toBeNull();
    // I2 (1000×1000 na escala 1) não cabe em 900 de altura: reduz a escala e depois move.
    p = resizeContainer(p, 'I2', { x: 1050, y: 0, scale: 0.8 });
    p = moveContainer(p, 'I2', 0, 1600);
    expect(image(expectValid(p), 'I2').parentId).toBe('K2');
  });

  it('redimensionar o container também assenta', () => {
    // Longe da I2: a I1 pode crescer sem sobrepor. K vai de -100 a 1100 em x e de -100 a 900 em y.
    let p = moveContainer(withCanvasMarking(), 'I2', 1050, 2000);
    p = resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.26 }); // 1040×780: cabe em K
    expect(image(p, 'I1').parentId).toBe('K');
    p = expectValid(resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.28 })); // 1120×840
    expect(image(p, 'I1').parentId).toBeNull();
  });

  it('settle: false congela o pertencimento (prévia de gesto); assentar depois decide', () => {
    const p = withCanvasMarking();
    const preview = moveContainer(p, 'I1', 0, 2000, { settle: false });
    expect(image(preview, 'I1').placement.y).toBe(2000);
    expect(image(preview, 'I1').parentId).toBe('K');
    expect(image(settleHierarchy(preview), 'I1').parentId).toBeNull();
  });

  it('a trava da marcação do canvas trava o placement do container dentro dela', () => {
    let p = withCanvasMarking();
    p = setMarkingLocked(p, 'K', true);
    expect(containerLockStates(p)).toEqual(new Map([['I1', 'inherited']]));
    expect(() => moveContainer(p, 'I1', 0, 2000)).toThrow('locked');
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.2 })).toThrow('locked');
    // Fora da marcação, livre; o container trancado aparece como `self`.
    expect(image(moveContainer(p, 'I2', 1050, 1200), 'I2').placement.y).toBe(1200);
    p = setImageLocked(p, 'I2', true);
    expect(containerLockStates(p)).toEqual(
      new Map([
        ['I1', 'inherited'],
        ['I2', 'self'],
      ]),
    );
  });

  it('excluir o container assenta e não leva a marcação do canvas', () => {
    const p = withCanvasMarking();
    const next = expectValid(removeContainer(p, 'I1'));
    expect(next.containers.map((c) => c.id)).toEqual(['I2']);
    expect(marking(next, 'K').containerId).toBeNull();
    expect(next.markings.map((m) => m.id)).toEqual(['M4', 'K']);
  });

  it('um container novo dentro de uma marcação do canvas é membro dela', () => {
    let p = createMarking(emptyProject(), {
      id: 'K',
      containerId: null,
      rect: { x: -100, y: -100, width: 1300, height: 1300 },
    });
    p = addContainer(p, { id: 'I1', file: 'images/a.jpg', width: 1000, height: 1000 });
    expect(image(expectValid(p), 'I1').parentId).toBe('K');
  });

  it('a marcação do canvas que passa a caber inteira num container novo vira dele', () => {
    let p = createMarking(emptyProject(), {
      id: 'N',
      containerId: null,
      rect: { x: 100, y: 100, width: 50, height: 50 },
    });
    p = addBackgroundContainer(p, {
      id: 'W',
      width: 1000,
      height: 1000,
      background: '#FFFFFF',
      center: { x: 500, y: 500 },
    });
    expect(marking(expectValid(p), 'N')).toMatchObject({
      containerId: 'W',
      rect: { x: 100, y: 100, width: 50, height: 50 },
    });
  });

  it('trocar o arquivo reescala cada marcação sozinha; o pai é refeito pela geometria', () => {
    // M3 (50×50) encostada no canto de M2: a 10% ela cresce para 8×8 e passa da borda de M2,
    // que já não a contém. Reescalar não a prende ao pai; quem decide o pai é o assentar.
    let p = sampleProject();
    p = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M3' ? { ...m, rect: { x: 1550, y: 1350, width: 50, height: 50 } } : m,
      ),
    };
    expect(marking(expectValid(p), 'M3').parentId).toBe('M2');
    const next = expectValid(
      replaceContainer(p, 'I1', { file: 'images/mini.jpg', width: 400, height: 300 }),
    );
    expect(marking(next, 'M2').rect).toEqual({ x: 120, y: 120, width: 40, height: 20 });
    expect(marking(next, 'M3').rect).toEqual({ x: 154, y: 134, width: 8, height: 8 });
    // M2 (120..160 × 120..140) não contém mais M3; a menor que contém é M1 (100..200 × 100..200).
    expect(marking(next, 'M3').parentId).toBe('M1');
  });
});
