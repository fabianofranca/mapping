import { describe, expect, it } from 'vitest';
import {
  BatchRuleError,
  EMPTY_CATALOG,
  addBatchBackgroundContainer,
  addTypedAnnotation,
  approximateMeasurer,
  componentPlacement,
  componentTypes,
  createBatchMarking,
  createMarking,
  projectIndex,
  projectLayerFor,
  updateBatchMarking,
  type ComponentCatalog,
  type MarkingContext,
  type Project,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { emptyProject, marking, sampleProject } from './fixtures';
import { notesCatalog, notesProject, NOTES_SPEC_ID } from './notesFixtures';
import { slotsLibrary, slotsProject } from '../mcp/slotsProject';

// The marking rules of the MCP batch (`add_container` with a background, `create_marking`, `update_marking`)
// live in `src/model/batchMarkings.ts`: pure functions over the project, the component catalog, the text
// measurer and a reference resolver. A broken rule throws a `BatchRuleError` with the batch's message.

function context(catalog: ComponentCatalog): MarkingContext {
  return {
    catalog,
    measurer: approximateMeasurer,
    refs: {
      marking: (ref) => ref,
      container: (ref) => ref,
      layer: (ref) => {
        const layer = projectIndex(currentProject).layers.get(ref);
        if (layer === undefined) throw new Error(`no layer ${ref}`);
        return layer;
      },
      type: (ref) => {
        const [specId, typeId] = ref.split('/');
        return { specId: specId!, typeId: typeId! };
      },
      nearTarget: (ref) => ({
        kind: projectIndex(currentProject).containers.has(ref) ? 'container' : 'marking',
        id: ref,
      }),
      pageFor: () => undefined,
      componentType: (p, type) =>
        componentTypes(p, catalog).find(
          (t) => t.specId === type.specId && t.typeId === type.typeId,
        ) ?? null,
      markingLabel: (_p, id) => id,
      containerLabel: (_p, id) => id,
      guardMinSize: (_minSize, _what, run) => run(),
    },
    annotate: {
      typed: (p, id, markingId, args) =>
        addTypedAnnotation(p, {
          id,
          markingId,
          layerId: projectLayerFor(p, args.type.specId, 'other')!.id,
          type: args.type,
          name: args.name ?? null,
          parentAnnotationId: null,
        }),
      setValues: (p) => p,
    },
  };
}

// The stub resolver reads the project of the call under test.
let currentProject: Project = emptyProject();

function create(
  catalog: ComponentCatalog,
  p: Project,
  args: Parameters<typeof createBatchMarking>[2],
) {
  currentProject = p;
  return createBatchMarking(context(catalog), p, args);
}

function refusal(run: () => unknown): BatchRuleError {
  try {
    run();
  } catch (error) {
    if (error instanceof BatchRuleError) return error;
    throw error;
  }
  throw new Error('it was not refused');
}

describe('createBatchMarking', () => {
  const catalog = testCatalog();

  it('a component marking without `rect` is born at the placement and size of the component', () => {
    const p = componentProject();
    const result = create(catalog, p, {
      container: 'I1',
      annotation: { type: `${SPEC_ID}/text` },
    });
    const expected = componentPlacement(
      p,
      catalog,
      {
        containerId: 'I1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        preview: 'required',
      },
      approximateMeasurer,
    );
    expect(result.marking.rect).toEqual(expected);
    expect(result.marking.rect.width).toBe(100);
    expect(result.marking.rect.height).toBe(40);
    expect(result.annotationId).not.toBeNull();
    expect(result.componentName).toBe('Type text');
    expect(projectIndex(result.project).markings.get(result.markingId)).toBe(
      result.marking,
    );
  });

  it('`rect` wins over the component size and the name goes to the marking', () => {
    const result = create(catalog, componentProject(), {
      container: 'I1',
      rect: { x: 10, y: 20, width: 200, height: 80 },
      name: 'Title',
      annotation: { type: `${SPEC_ID}/text` },
    });
    expect(result.marking.rect).toEqual({ x: 10, y: 20, width: 200, height: 80 });
    expect(result.marking.name).toBe('Title');
  });

  it('a `rect` below the component minimum goes through the minimum-size guard', () => {
    const p = componentProject();
    currentProject = p;
    const base = context(catalog);
    const guarded: string[] = [];
    const ctx: MarkingContext = {
      ...base,
      refs: {
        ...base.refs,
        guardMinSize: (minSize, what, run) => {
          guarded.push(`${what} ${minSize?.width}×${minSize?.height}`);
          return run();
        },
      },
    };
    createBatchMarking(ctx, p, {
      container: 'I1',
      rect: { x: 0, y: 0, width: 200, height: 80 },
      annotation: { type: `${SPEC_ID}/text` },
    });
    expect(guarded).toEqual([`"${SPEC_ID}/text" 60×24`]);
  });

  it('`inside` + `slot` puts the child in the slot of the target', () => {
    const { catalog: slots } = slotsLibrary();
    const p = slotsProject((add) => {
      add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
    });
    const result = create(slots, p, {
      inside: 'mk-bar',
      slot: 'actions',
      annotation: { type: 'slots/pin' },
    });
    expect(result.marking.parentId).toBe('mk-bar');
    const bar = marking(p, 'mk-bar').rect;
    const { rect } = result.marking;
    expect(rect.x).toBeGreaterThanOrEqual(bar.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(bar.x + bar.width);
    // The `actions` slot is on the right of the title: the child is not at the left edge.
    expect(rect.x).toBeGreaterThan(bar.x + bar.width / 2);
  });

  it('`slot` without `inside` is refused with the batch message', () => {
    const error = refusal(() =>
      create(catalog, componentProject(), {
        container: 'I1',
        slot: 'actions',
        annotation: { type: `${SPEC_ID}/text` },
      }),
    );
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      '`slot` only applies with `inside` (the component whose slot receives the child)',
    );
  });

  it('`slot` that the target does not have lists its slots in the detail', () => {
    const { catalog: slots } = slotsLibrary();
    const p = slotsProject((add) => {
      add('bar', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
    });
    const error = refusal(() =>
      create(slots, p, {
        inside: 'mk-bar',
        slot: 'nowhere',
        annotation: { type: 'slots/pin' },
      }),
    );
    expect(error.message).toBe(
      'the target has no slot "nowhere"; use one of its slots (see `slots` in get_marking)',
    );
    expect(error.details).toEqual({
      detail: {
        slots: [
          { id: 'navigationIcon', name: 'Navigation icon' },
          { id: 'actions', name: 'Actions' },
        ],
      },
    });
  });

  it('`inside` with a type that has no component is refused', () => {
    const p = componentProject();
    const withBox = create(catalog, p, {
      container: 'I1',
      rect: { x: 0, y: 0, width: 300, height: 200 },
      annotation: { type: `${SPEC_ID}/box` },
    }).project;
    const error = refusal(() =>
      create(catalog, withBox, {
        inside: marking(withBox, withBox.markings[0]!.id).id,
        rect: { x: 5, y: 5, width: 40, height: 40 },
        annotation: { type: `${SPEC_ID}/plain` },
      }),
    );
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      '`inside` only applies with `annotation` of a type with a component (see list_components)',
    );
  });

  it('`anchor` without `rect` snaps the new marking to the target', () => {
    const base = componentProject();
    const first = create(catalog, base, {
      container: 'I1',
      rect: { x: 100, y: 100, width: 100, height: 40 },
      annotation: { type: `${SPEC_ID}/text` },
    });
    const result = create(catalog, first.project, {
      container: 'I1',
      anchor: { to: first.markingId, side: 'end' },
      annotation: { type: `${SPEC_ID}/text` },
    });
    expect(result.marking.anchor).toMatchObject({ to: first.markingId, side: 'end' });
    expect(result.marking.rect.x).toBeGreaterThanOrEqual(200);
    expect(result.marking.rect.width).toBe(100);
  });

  it('`anchor` together with `near` is refused', () => {
    const base = componentProject();
    const first = create(catalog, base, {
      container: 'I1',
      rect: { x: 100, y: 100, width: 100, height: 40 },
      annotation: { type: `${SPEC_ID}/text` },
    });
    const error = refusal(() =>
      create(catalog, first.project, {
        container: 'I1',
        anchor: { to: first.markingId },
        near: first.markingId,
        annotation: { type: `${SPEC_ID}/text` },
      }),
    );
    expect(error.message).toBe(
      '`anchor` and `near`/`inside` are different placements: provide only one',
    );
  });

  it('`near` places a floating type next to the target', () => {
    const p = notesProject();
    const result = create(notesCatalog(), p, {
      near: 'I1',
      annotation: { type: `${NOTES_SPEC_ID}/nota` },
    });
    expect(result.marking.floating).toBe(true);
    expect(result.marking.containerId).toBeNull();
    expect(result.notes).toEqual([]);
  });

  it('`near` on a type that is not floating is ignored, with a note', () => {
    const result = create(catalog, componentProject(), {
      near: 'I1',
      rect: { x: 5, y: 5, width: 100, height: 40 },
      container: 'I1',
      annotation: { type: `${SPEC_ID}/text` },
    });
    expect(result.notes).toEqual([
      '`near` only applies to a floating annotation type, without `container`: it was ignored (to place the marking in a container, use `container` and `rect`)',
    ]);
  });

  it('a type without a component and without `rect` is `invalid-arguments`', () => {
    const error = refusal(() =>
      create(catalog, componentProject(), {
        container: 'I1',
        annotation: { type: `${SPEC_ID}/plain` },
      }),
    );
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      '`rect` is required (only an annotation type with a component dispenses with the rectangle: see list_components)',
    );
  });

  it('a type without a component with `rect` creates the marking with a typed annotation', () => {
    const result = create(catalog, componentProject(), {
      container: 'I1',
      rect: { x: 10, y: 10, width: 50, height: 50 },
      annotation: { type: `${SPEC_ID}/plain` },
    });
    expect(result.annotationId).not.toBeNull();
    expect(result.componentName).toBeNull();
    expect(result.typeRef).toEqual({ specId: SPEC_ID, typeId: 'plain' });
    const annotation = projectIndex(result.project).annotations.get(result.annotationId!);
    expect(annotation?.markingId).toBe(result.markingId);
  });

  it('`annotationAs` without `annotation` and `container` together with `image` are refused', () => {
    expect(
      refusal(() =>
        create(catalog, componentProject(), {
          container: 'I1',
          rect: { x: 0, y: 0, width: 20, height: 20 },
          annotationAs: '$a',
        }),
      ).message,
    ).toBe('`annotationAs` only applies with `annotation` in the same operation');
    expect(
      refusal(() =>
        create(catalog, componentProject(), {
          container: 'I1',
          image: 'I1',
          rect: { x: 0, y: 0, width: 20, height: 20 },
        }),
      ).message,
    ).toBe('provide `container` (the old `image` is also accepted), not both');
  });

  it('a plain marking with `source` records it', () => {
    const result = create(EMPTY_CATALOG, sampleProject(), {
      container: 'I1',
      rect: { x: 10, y: 10, width: 50, height: 50 },
      source: { system: 'figma', id: '3f2a' },
    });
    expect(result.marking.source).toEqual({ system: 'figma', id: '3f2a', url: null });
  });
});

describe('addBatchBackgroundContainer', () => {
  it('creates a container with only a background', () => {
    const { project, id } = addBatchBackgroundContainer(
      emptyProject(),
      { name: 'Blank', width: 300, height: 200, background: '#ffffff' },
      () => ({}),
    );
    const container = projectIndex(project).containers.get(id)!;
    expect(container).toMatchObject({ name: 'Blank', width: 300, height: 200 });
  });

  it('names what is missing', () => {
    const error = refusal(() =>
      addBatchBackgroundContainer(emptyProject(), { width: 300 }, () => ({})),
    );
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      'add_container needs `file` (or `base64`), or `width`, `height` and `background`; missing: `height`, `background`',
    );
  });
});

describe('updateBatchMarking', () => {
  function two(): Project {
    return createMarking(sampleProject(), {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 2500, y: 1000, width: 300, height: 300 },
      name: 'Other',
    });
  }

  function update(
    p: Project,
    id: string,
    args: Parameters<typeof updateBatchMarking>[3],
  ) {
    currentProject = p;
    return updateBatchMarking(context(EMPTY_CATALOG), p, id, args);
  }

  it('changes `rect` and `name`', () => {
    const { project, changes } = update(two(), 'M5', {
      rect: { x: 2600, y: 1100, width: 320, height: 310 },
      name: 'Renamed',
    });
    expect(marking(project, 'M5')).toMatchObject({
      name: 'Renamed',
      rect: { x: 2600, y: 1100, width: 320, height: 310 },
    });
    expect(changes).toEqual(['name "Renamed"', 'rectangle x 2600, y 1100, 320×310']);
  });

  it('`anchor` sets the anchor and `null` removes it', () => {
    const anchored = update(two(), 'M5', { anchor: { to: 'M1', side: 'end' } });
    expect(marking(anchored.project, 'M5').anchor).toMatchObject({
      to: 'M1',
      side: 'end',
    });
    expect(anchored.changes).toEqual(['anchor to "M1"']);
    const released = update(anchored.project, 'M5', { anchor: null });
    expect(marking(released.project, 'M5').anchor ?? null).toBeNull();
    expect(released.changes).toEqual(['remove the anchor']);
  });

  it('changing `container` without `rect` is refused', () => {
    const error = refusal(() => update(two(), 'M5', { container: 'I2' }));
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toBe(
      'changing `container` requires the `rect` in the pixels of the new container (on the canvas, in canvas units)',
    );
  });

  it('with nothing to change it reports no changes', () => {
    expect(update(two(), 'M5', {}).changes).toEqual([]);
  });
});
