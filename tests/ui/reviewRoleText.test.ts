// Revisão de propostas e a v14 (etapa #559, PD4, decisão 22): o papel do vínculo aparece
// pelo nome ("Clique"), e o repositório de documentos tem frase e valor próprios.
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setDocRepo, removeDocRepo } from '../../src/model';
import { locale } from '../../src/store/settings';
import {
  changeSummary,
  changeTitle,
  valueParts,
  type ReviewNames,
} from '../../src/ui/review/changeText';
import { setAnnotationRole } from '../../src/model';
import { changeOf, propose } from '../model/proposalFixtures';
import {
  addChild,
  forceRole,
  roleProject,
  withDocRepo,
  withRoles,
} from '../model/roleFixtures';

beforeEach(() => {
  locale.value = 'pt-BR';
});

describe('mudança de parentRole', () => {
  const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');

  function namesOf(after: typeof base, preview: typeof base | null = after): ReviewNames {
    const proposal = propose(base, after);
    return { current: base, preview, proposal };
  }

  it('o resumo mostra o nome dos dois papéis', () => {
    const after = setAnnotationRole(base, 'E1', 'hold');
    const names = namesOf(after);
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe('Clique → Pressionar');
  });

  it('sem o "como ficaria", resolve pelo projeto atual', () => {
    const after = setAnnotationRole(base, 'E1', 'hold');
    const names = namesOf(after, null);
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe('Clique → Pressionar');
  });

  it('limpar o papel mostra "(vazio)" no lugar de null', () => {
    const names = namesOf(setAnnotationRole(base, 'E1', null));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe(`Clique → ${t('review.value.empty')}`);
  });

  it('id de papel que o dono não oferece sai cru', () => {
    const names = namesOf(forceRole(base, 'E1', 'zzz'));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(valueParts(names, c, 'zzz', 'click')).toEqual([{ text: 'zzz' }]);
  });

  it('o título usa o rótulo do campo e o nome da anotação', () => {
    const names = namesOf(setAnnotationRole(base, 'E1', 'hold'));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeTitle(names, c)).toBe(`${t('review.field.role')} · onClick`);
  });
});

describe('entidade docRepo', () => {
  const base = roleProject(withDocRepo);
  const withPath = setDocRepo(base, 'design-docs', { localPath: '../docs' });

  it('criar: título e valor', () => {
    const proposal = propose(base, withPath);
    const names: ReviewNames = { current: base, preview: withPath, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('create');
    expect(changeTitle(names, c)).toBe('Repositório de documentos design-docs criado');
    expect(changeSummary(names, c)).toBe('../docs');
  });

  it('atualizar: de → para', () => {
    const after = setDocRepo(withPath, 'design-docs', { localPath: '../novo' });
    const proposal = propose(withPath, after);
    const names: ReviewNames = { current: withPath, preview: after, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('update');
    expect(changeTitle(names, c)).toBe(
      'Repositório de documentos design-docs atualizado',
    );
    expect(changeSummary(names, c)).toBe('../docs → ../novo');
  });

  it('remover: título e valor', () => {
    const after = removeDocRepo(withPath, 'design-docs');
    const proposal = propose(withPath, after);
    const names: ReviewNames = { current: withPath, preview: after, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('remove');
    expect(changeTitle(names, c)).toBe('Repositório de documentos design-docs removido');
    expect(changeSummary(names, c)).toBe('../docs');
  });

  it('em inglês', () => {
    locale.value = 'en-US';
    const proposal = propose(base, withPath);
    const names: ReviewNames = { current: base, preview: withPath, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(changeTitle(names, c)).toBe('Documents repository design-docs created');
  });
});
