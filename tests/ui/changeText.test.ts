import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import {
  addBackgroundContainer,
  changeType,
  createArrow,
  createMarking,
  setContainerDensity,
  setMarkingAnchor,
  snapToAnchor,
  setContainerDirection,
  setProjectDirection,
  setProjectDrawingMode,
  type Change,
  type JsonValue,
  type Proposal,
} from '../../src/model';
import {
  changeSummary,
  changeTitle,
  droppedChangeSummary,
  markingName,
} from '../../src/ui/review/changeText';
import { emptyProject, sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
import { cadastroProject, loadExample } from '../model/specFixtures';

// Stage 6 (6.4), finding 6: the type name of a created annotation has the same casing in the
// list ("Annotation Button created") and in Details, even when the annotation is not in the
// "how it would look" (rejected) and the title comes from the change itself.

function created(to: JsonValue): Change {
  return {
    id: 'C1',
    kind: 'create',
    entity: 'annotation',
    entityId: 'NOVA',
    imageId: null,
    markingId: null,
    field: null,
    from: null,
    to,
  };
}

// pt-BR kept: shared fixture data asserted by tests/model, tests/components (marking names of sampleProject)
const PORTA = 'Porta';
const ARROW_NAME = `${PORTA} → Maçaneta`;

const proposalOf = (changes: readonly Change[]) => ({ changes }) as unknown as Proposal;

describe('changeTitle: type name', () => {
  const button = created({ name: null, type: { specId: 'sdui', typeId: 'button' } });

  it('uses the type name from the project specialization, not the id', () => {
    const names = {
      current: cadastroProject(),
      preview: null,
      proposal: proposalOf([button]),
    };
    expect(changeTitle(names, button)).toContain('Button');
    expect(changeTitle(names, button)).not.toContain('button');
  });

  it('in a new import, finds the name in the specialization the proposal applies', () => {
    const spec: Change = {
      ...created({
        id: 'sdui',
        version: 2,
        spec: loadExample('sdui') as unknown as JsonValue,
      }),
      id: 'C0',
      entity: 'specialization',
      entityId: 'sdui',
    };
    const names = {
      current: emptyProject(),
      preview: null,
      proposal: proposalOf([spec, button]),
    };
    expect(changeTitle(names, button)).toContain('Button');
    expect(changeTitle(names, button)).not.toContain('button');
  });
});

// Arrow (ME4): its name, otherwise "Source → Target" by the names of the markings at the ends.
describe('changeTitle: arrow', () => {
  const base = sampleProject();
  const named = createArrow(base, { id: 'R1', from: 'M1', to: 'M2', name: 'opens' });
  const plain = createArrow(base, { id: 'R2', from: 'M1', to: 'M2' });

  it('uses the arrow name', () => {
    const proposal = propose(base, named);
    const c = proposal.changes[0]!;
    const title = changeTitle({ current: base, preview: named, proposal }, c);
    expect(title).toContain('opens');
    expect(title).toContain(t('review.entity.arrow'));
  });

  it('with no name, uses the markings at the ends, with the arrow still only in the proposal', () => {
    const proposal = propose(base, plain);
    const c = proposal.changes[0]!;
    // Without the preview, the name comes from the creation record (`to`) and from the marking names.
    const title = changeTitle({ current: base, preview: null, proposal }, c);
    expect(title).toContain(ARROW_NAME);
  });

  it('the review item that is an arrow has its name', () => {
    const proposal = propose(base, plain);
    expect(markingName({ current: base, preview: plain, proposal }, 'R2')).toBe(
      ARROW_NAME,
    );
    expect(markingName({ current: base, preview: null, proposal }, 'R2')).toBe(
      ARROW_NAME,
    );
    // The marking goes by its own name.
    expect(markingName({ current: base, preview: null, proposal }, 'M1')).toBe(PORTA);
  });

  it('the removal of the arrow uses the earlier record', () => {
    const proposal = propose(plain, base);
    const c = proposal.changes[0]!;
    expect(changeTitle({ current: plain, preview: base, proposal }, c)).toContain(
      ARROW_NAME,
    );
  });
});

describe('droppedChangeSummary: summary of the withdrawn change', () => {
  it('shows the type of the created annotation, which is no longer in the proposal', () => {
    const button = created({ name: null, type: { specId: 'sdui', typeId: 'button' } });
    // The change was withdrawn: the proposal no longer has it in `changes`.
    const names = { current: cadastroProject(), preview: null, proposal: proposalOf([]) };
    const summary = droppedChangeSummary(names, button);
    expect(summary).toContain('Button');
    expect(summary).not.toContain(t('annotation.unnamed'));
  });
});

describe('changeTitle: fitting to the content (MC3, decision 18 of #898)', () => {
  it('the rectangle change that fit_marking generates is the usual Position, of the moved type', () => {
    const rect: Change = {
      id: 'C1',
      kind: 'update',
      entity: 'marking',
      entityId: 'M1',
      imageId: 'I1',
      markingId: 'M1',
      field: 'rect',
      from: { x: 20, y: 20, width: 120, height: 40 },
      to: { x: 20, y: 20, width: 120, height: 96 },
    };
    const names = {
      current: sampleProject(),
      preview: null,
      proposal: proposalOf([rect]),
    };
    expect(changeType(rect)).toBe('moved');
    expect(changeTitle(names, rect)).toBe(t('review.field.rect'));
  });
});

describe('changeTitle and changeSummary: the container density (D2, decision 7 of #1085)', () => {
  beforeEach(() => {
    locale.value = 'en-US';
  });
  const base = addBackgroundContainer(emptyProject(), {
    id: 'c1',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
  });
  const summaryOf = (before: typeof base, after: typeof base) => {
    const proposal = propose(before, after);
    const change = proposal.changes.find((c) => c.field === 'density');
    if (!change) throw new Error('no density change');
    const names = { current: before, preview: null, proposal };
    return `${changeTitle(names, change)}: ${changeSummary(names, change)}`;
  };

  it('a proposal with update_container density shows "Density: 1 → 3"', () => {
    expect(summaryOf(base, setContainerDensity(base, 'c1', 3))).toBe('Density: 1 → 3');
  });

  it('going back to 1 (null) shows "3 → 1", and a fractional value uses the locale separator', () => {
    const fixed = setContainerDensity(base, 'c1', 3);
    expect(summaryOf(fixed, base)).toBe('Density: 3 → 1');
    expect(summaryOf(base, setContainerDensity(base, 'c1', 2.5))).toBe(
      'Density: 1 → 2.5',
    );
    locale.value = 'pt-BR';
    // pt-BR kept: the decimal separator of the locale is the object of this assertion
    expect(summaryOf(base, setContainerDensity(base, 'c1', 2.5))).toBe(
      'Densidade: 1 → 2,5',
    );
  });
});

describe('changeTitle and changeSummary: the reading direction (R2 of stage #1096)', () => {
  beforeEach(() => {
    locale.value = 'en-US';
  });
  const base = addBackgroundContainer(emptyProject(), {
    id: 'c1',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
  });
  const summaryOf = (before: typeof base, after: typeof base, entity: string) => {
    const proposal = propose(before, after);
    const change = proposal.changes.find(
      (c) => c.entity === entity && (entity === 'project' || c.field === 'direction'),
    );
    if (!change) throw new Error('no direction change');
    const names = { current: before, preview: null, proposal };
    const summary = changeSummary(names, change);
    return entity === 'project' ? summary : `${changeTitle(names, change)}: ${summary}`;
  };

  it('the container that fixes rtl shows "Direction: Follows the project → right to left"', () => {
    expect(summaryOf(base, setContainerDirection(base, 'c1', 'rtl'), 'image')).toBe(
      'Direction: Follows the project → right to left',
    );
  });

  it('going back to following the project shows the text of "Follows the project"', () => {
    const fixed = setContainerDirection(base, 'c1', 'rtl');
    expect(summaryOf(fixed, base, 'image')).toBe(
      'Direction: right to left → Follows the project',
    );
  });

  it('the project direction appears in the project change, with the "Direction" field', () => {
    const empty = t('review.value.empty');
    expect(summaryOf(base, setProjectDirection(base, 'rtl'), 'project')).toBe(
      `${empty} → Direction: right to left`,
    );
  });

  it('changing only the mode in an rtl project keeps the direction on both sides', () => {
    const rtl = setProjectDirection(base, 'rtl');
    expect(summaryOf(rtl, setProjectDrawingMode(rtl, 'dark'), 'project')).toBe(
      'Direction: right to left → dark · Direction: right to left',
    );
  });

  it('the field and the values come from t(), in en-US and in pt-BR', () => {
    locale.value = 'en-US';
    expect(summaryOf(base, setContainerDirection(base, 'c1', 'rtl'), 'image')).toBe(
      'Direction: Follows the project → right to left',
    );
    locale.value = 'pt-BR';
    // pt-BR kept: the Portuguese field and values are the object of this assertion
    expect(summaryOf(base, setContainerDirection(base, 'c1', 'rtl'), 'image')).toBe(
      'Direção: Segue o projeto → direita para a esquerda',
    );
  });
});

describe('changeTitle and changeSummary: the marking anchor (R3 of stage #1096)', () => {
  beforeEach(() => {
    locale.value = 'en-US';
  });
  const base = createMarking(
    createMarking(
      addBackgroundContainer(emptyProject(), {
        id: 'c1',
        width: 400,
        height: 400,
        background: '#FFFFFF',
      }),
      {
        id: 'T',
        containerId: 'c1',
        name: 'Button',
        rect: { x: 100, y: 100, width: 80, height: 30 },
      },
    ),
    {
      id: 'B',
      containerId: 'c1',
      name: 'Hint',
      rect: { x: 300, y: 10, width: 60, height: 20 },
    },
  );
  const summaryOf = (before: typeof base, after: typeof base, field = 'anchor') => {
    const proposal = propose(before, after);
    const change = proposal.changes.find((c) => c.field === field);
    if (!change) throw new Error(`no ${field} change`);
    const names = { current: before, preview: null, proposal };
    return `${changeTitle(names, change)}: ${changeSummary(names, change)}`;
  };

  it('anchoring shows "Anchor: … → side/alignment of <anchor name>"', () => {
    const anchored = setMarkingAnchor(base, 'B', {
      to: 'T',
      side: 'top',
      align: 'start',
    });
    expect(summaryOf(base, anchored)).toBe(
      `Anchor: ${t('review.value.empty')} → top/start of Button`,
    );
  });

  it('what the anchor does not say appears as "default" and removing the anchor goes back to empty', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    expect(summaryOf(base, anchored)).toBe(
      `Anchor: ${t('review.value.empty')} → default/default of Button`,
    );
    expect(summaryOf(anchored, base)).toBe(
      `Anchor: default/default of Button → ${t('review.value.empty')}`,
    );
  });

  it('the field and the values come from t(), in en-US and in pt-BR', () => {
    locale.value = 'en-US';
    const anchored = setMarkingAnchor(base, 'B', {
      to: 'T',
      side: 'end',
      align: 'center',
    });
    expect(summaryOf(base, anchored)).toBe(
      `Anchor: ${t('review.value.empty')} → end/center of Button`,
    );
    locale.value = 'pt-BR';
    const topStart = setMarkingAnchor(base, 'B', {
      to: 'T',
      side: 'top',
      align: 'start',
    });
    // pt-BR kept: the Portuguese field and values are the object of this assertion
    expect(summaryOf(base, topStart)).toBe(
      `Âncora: ${t('review.value.empty')} → acima/início de Button`,
    );
  });

  it('snap_to_anchor is the usual Position, of the moved type', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'bottom' });
    const proposal = propose(anchored, snapToAnchor(anchored, 'B').project);
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    expect(changeType(rect)).toBe('moved');
    expect(changeTitle({ current: anchored, preview: null, proposal }, rect)).toBe(
      t('review.field.rect'),
    );
  });
});
