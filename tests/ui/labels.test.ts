import { afterEach, describe, expect, it } from 'vitest';
import { ancestorsOf } from '../../src/model';
import { locale } from '../../src/store/settings';
import { t } from '../../src/i18n';
import {
  arrowEnds,
  arrowText,
  markingErrorMessage,
  markingLabel,
  markingPath,
} from '../../src/ui/labels';
import { createArrow } from '../../src/model';
import { marking, sampleProject } from '../model/fixtures';
import { withNoteInstance } from '../model/notesFixtures';

describe('marking labels', () => {
  afterEach(() => {
    locale.value = 'en-US';
  });

  it('ancestors from the parent up to the root', () => {
    const p = sampleProject();
    expect(ancestorsOf(p, 'M3').map((m) => m.id)).toEqual(['M2', 'M1']);
    expect(ancestorsOf(p, 'M1')).toEqual([]);
  });

  it('full path and default name (pt-BR and en-US)', () => {
    // pt-BR kept: the test checks the default name in both locales
    locale.value = 'pt-BR';
    const p = sampleProject();
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject names)
    expect(markingPath(p, marking(p, 'M3'))).toBe('Porta › Maçaneta › Fechadura');
    // pt-BR kept: default name of the pt-BR locale
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Marcação sem nome');
    locale.value = 'en-US';
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Unnamed marking');
  });

  it('unnamed component instance: the label is the type name; its own name wins', () => {
    locale.value = 'en-US';
    const p = withNoteInstance(sampleProject());
    const note = marking(p, 'N1');
    // pt-BR kept: shared fixture data asserted by tests/model (notesFixtures type name)
    expect(markingLabel(p, note)).toBe('Nota');
    expect(markingLabel(p, { id: note.id, name: 'My note' })).toBe('My note');
    // An ordinary unnamed marking keeps the default text.
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Unnamed marking');
  });

  it('the arrow and the path use the type name on unnamed ends', () => {
    const p = createArrow(withNoteInstance(sampleProject()), {
      id: 'S1',
      from: 'N1',
      to: 'M1',
    });
    const arrow = p.arrows[0]!;
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject and notesFixtures names)
    expect(arrowEnds(p, arrow)).toMatchObject({ from: 'Nota', to: 'Porta' });
    expect(arrowText(p, arrow)).toBe('Nota → Porta');
    expect(markingPath(p, marking(p, 'N1'))).toBe('Nota');
  });

  it('rectangle error messages', () => {
    locale.value = 'en-US';
    expect(markingErrorMessage('rect-too-small')).toBe(
      'Each side must be at least 8 px.',
    );
    expect(markingErrorMessage('locked')).toBe(t('marking.error.locked'));
    expect(markingErrorMessage('no-project')).toBe('Could not change the marking.');
  });
});
