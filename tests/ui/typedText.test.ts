import { afterEach, describe, expect, it } from 'vitest';
import { removeTableRow, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { parseNumberInput } from '../../src/ui/FieldEditors';
import {
  annotationDisplayName,
  annotationSourceLabel,
  issueMessage,
  issuesOf,
  ownerTypeNames,
  projectIssues,
} from '../../src/ui/typedText';
import { cadastroProject } from '../model/specFixtures';

function annotation(p: Project, id: string) {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
}

describe('typed annotation texts', () => {
  afterEach(() => {
    locale.value = 'en-US';
  });

  it('displayed name and source label', () => {
    const p = cadastroProject();
    // pt-BR kept: shared fixture data asserted by tests/model (cadastroProject names)
    expect(annotationDisplayName(p, annotation(p, 'AC'))).toBe('Classe · Contato');
    expect(annotationDisplayName(p, annotation(p, 'AU'))).toBe('User');
    expect(annotationSourceLabel(p, annotation(p, 'AIN'))).toBe('Input input_nome');
  });

  it('reasons of the pending items with the field label', () => {
    locale.value = 'en-US';
    let p = cadastroProject();
    const text = annotation(p, 'AT');
    expect(issuesOf(p, 'AT').map((i) => issueMessage(p, text, i))).toEqual([
      'id — required and empty',
    ]);
    p = removeTableRow(p, 'AC', 'atributos', 'R1');
    expect(
      issuesOf(p, 'AIE').map((i) => issueMessage(p, annotation(p, 'AIE'), i)),
    ).toEqual(['dado — broken reference']);
  });

  it('pending items computed once per project version', () => {
    const p = cadastroProject();
    expect(projectIssues(p)).toBe(projectIssues(p));
    expect([...projectIssues(p).keys()]).toEqual(['AT']);
  });

  it('possible owners by name, e.g. "Button or Image"', () => {
    const p = cadastroProject();
    expect(ownerTypeNames(p, annotation(p, 'AOC'))).toBe('Button or Image');
  });

  it('a typed number accepts a comma and rejects text', () => {
    expect(parseNumberInput(' 1,5 ')).toBe(1.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeUndefined();
  });
});
