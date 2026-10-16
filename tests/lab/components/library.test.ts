// Laboratório Componentes: a especialização aponta para um arquivo por componente.
import { describe, expect, it } from 'vitest';
import {
  initialValues,
  instanceLabel,
  loadLibrary,
  resolvePath,
} from '../../../lab/components/library';
import {
  SAMPLE_COMPONENTS,
  SAMPLE_FILES,
  SAMPLE_SPEC,
} from '../../../lab/components/samples';

describe('library', () => {
  it('resolve caminhos relativos ao arquivo da especialização', () => {
    expect(resolvePath('spec.json', 'components/button.json')).toBe(
      'components/button.json',
    );
    expect(resolvePath('design/spec.json', './components/button.json')).toBe(
      'design/components/button.json',
    );
    expect(resolvePath('design/specs/spec.json', '../components/x.json')).toBe(
      'design/components/x.json',
    );
  });

  it('carrega os exemplos: todo tipo com componente válido e sem problemas', () => {
    const lib = loadLibrary(SAMPLE_FILES);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(SAMPLE_COMPONENTS.length);
    for (const type of lib.types) {
      expect(type.component?.id, type.id).toBe(type.id);
      expect(type.componentPath).toBe(`components/${type.id}.json`);
    }
    const button = lib.types.find((t) => t.id === 'button');
    expect(button?.fields.map((f) => f.key)).toEqual([
      'label',
      'variant',
      'icon',
      'disabled',
      'action',
    ]);
    expect(initialValues(button!)).toEqual({
      label: 'Entrar',
      variant: 'primary',
      icon: 'não',
      disabled: 'não',
      action: null,
    });
    expect(instanceLabel(button!, { label: 'Salvar' })).toBe('Salvar');
    expect(instanceLabel(button!, { label: '  ' })).toBe('Botão');
  });

  it('registra arquivo ausente, componente inválido e JSON quebrado como problemas, sem derrubar o resto', () => {
    const files = SAMPLE_FILES.filter((f) => !f.path.endsWith('avatar.json')).map((f) =>
      f.path.endsWith('card.json') ? { ...f, text: '{"format":"mapping-component"}' } : f,
    );
    files.push({ path: 'components/quebrado.json', text: '{oops' });
    const lib = loadLibrary(files);
    expect(
      lib.problems.some((p) => p.includes('avatar') && p.includes('não encontrado')),
    ).toBe(true);
    expect(
      lib.problems.some(
        (p) => p.includes('card.json') && p.includes('Componente inválido'),
      ),
    ).toBe(true);
    expect(
      lib.problems.some(
        (p) => p.includes('quebrado.json') && p.includes('JSON inválido'),
      ),
    ).toBe(true);
    expect(lib.types.find((t) => t.id === 'button')?.component).toBeDefined();
    expect(lib.types.find((t) => t.id === 'avatar')?.component).toBeUndefined();
  });

  it('sem especialização, lança; com duas, usa a primeira e avisa', () => {
    expect(() => loadLibrary([{ path: 'a.json', text: '{}' }])).toThrow(/mapping-spec/);
    const twice = [
      ...SAMPLE_FILES,
      { path: 'outra.json', text: JSON.stringify({ ...SAMPLE_SPEC, id: 'outra' }) },
    ];
    const lib = loadLibrary(twice);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems[0]).toMatch(/2 especializações/);
  });
});
