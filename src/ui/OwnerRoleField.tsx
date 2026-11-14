import { useId } from 'preact/hooks';
import { t } from '../i18n';
import {
  ownerRolesOf,
  type Annotation,
  type Project,
  type SpecChildRole,
} from '../model';
import { Select } from './controls';
import { useDetailsExtension } from './DetailsExtension';
import { useEditor } from './EditorContext';
import { Property } from './PropertyGrid';
import { issueReason, issuesOf } from './typedText';

interface OwnerRoleFieldProps {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly owner: Annotation | undefined;
  readonly readOnly: boolean;
}

const hasContent = (c: unknown) => c !== undefined && c !== null && c !== false;

function roleIssueOf(project: Project, annotation: Annotation) {
  return issuesOf(project, annotation.id).find(
    (i) => i.code === 'missing-role' || i.code === 'unknown-role',
  );
}

/** The options: "Choose…" (no valid role), the role the owner does not offer and the owner's. */
function RoleOptions({
  role,
  roles,
}: {
  readonly role: string | null;
  readonly roles: readonly SpecChildRole[];
}) {
  const known = role !== null && roles.some((r) => r.id === role);
  return (
    <>
      {!known && <option value="">{t('typed.rolePlaceholder')}</option>}
      {role !== null && !known && <option value={role}>{role}</option>}
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </>
  );
}

function RoleSelect({
  id,
  annotation,
  roles,
  invalid,
  disabled,
}: {
  readonly id: string;
  readonly annotation: Annotation;
  readonly roles: readonly SpecChildRole[];
  readonly invalid: boolean;
  readonly disabled: boolean;
}) {
  const { actions } = useEditor();
  return (
    <Select
      id={id}
      size="sm"
      invalid={invalid}
      value={annotation.parentRole ?? ''}
      disabled={disabled}
      onChange={(e) => {
        const value = e.currentTarget.value;
        actions.setAnnotationRole(annotation.id, value === '' ? null : value);
      }}
    >
      <RoleOptions role={annotation.parentRole} roles={roles} />
    </Select>
  );
}

/** Review marker and note for the role (through the Details extension point). */
function useRoleExtras(annotationId: string) {
  const ext = useDetailsExtension();
  const mark = ext?.mark(annotationId, 'parentRole');
  const below = ext?.below(annotationId, 'parentRole');
  return { mark, below, any: hasContent(mark) || hasContent(below) };
}

/**
 * The annotation's role in the owner (v14, decision 20): the list of the owner type's `childRoles`, with the
 * label `childRolesLabel`. It only appears with an owner that declares them, or to explain (and clear) a
 * role that the owner does not offer.
 */
export function OwnerRoleField({
  project,
  annotation,
  owner,
  readOnly,
}: OwnerRoleFieldProps) {
  const id = useId();
  const extras = useRoleExtras(annotation.id);
  const offered = owner ? ownerRolesOf(project, owner) : null;
  const issue = roleIssueOf(project, annotation);
  if (!offered && !issue && !extras.any) return null;
  return (
    <Property
      label={offered?.label ?? t('typed.roleDefaultLabel')}
      for={id}
      focusKey="role"
      mark={extras.mark}
      below={extras.below}
      issue={issue ? issueReason(project, annotation, issue) : null}
    >
      <RoleSelect
        id={id}
        annotation={annotation}
        roles={offered?.roles ?? []}
        invalid={issue !== undefined}
        disabled={readOnly}
      />
    </Property>
  );
}
