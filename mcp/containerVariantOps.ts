import { ModelError, linkVariant, unlinkVariant, type Project } from '../src/model';
import { ToolError } from './errors';

// `variantOf` of `add_container` and `update_container` (stage #2034, decision 10): the operation runs
// `linkVariant` with the referenced container, or `unlinkVariant` when it is `null`. The same container and
// one already in the group are `invalid-arguments`, with the model's code in `variantError`.

const REFUSED = new Set(['variant-self', 'variant-already-linked']);

/** Links `containerId` to `otherId` (a container id already resolved) and returns the line for the description. */
export function applyVariantLink(
  p: Project,
  containerId: string,
  otherId: string,
  otherLabel: string,
): { project: Project; change: string } {
  try {
    return {
      project: linkVariant(p, containerId, otherId),
      change: `variant of "${otherLabel}"`,
    };
  } catch (error) {
    if (error instanceof ModelError && REFUSED.has(error.code)) {
      const why =
        error.code === 'variant-self'
          ? 'a container cannot be a variant of itself'
          : 'the containers are already variants of each other';
      throw new ToolError('invalid-arguments', `variantOf: ${why}`, {
        variantError: error.code,
      });
    }
    throw error;
  }
}

/** Leaves the container's variant group (nothing changes without one). */
export function applyVariantUnlink(
  p: Project,
  containerId: string,
): { project: Project; change: string } {
  return { project: unlinkVariant(p, containerId), change: 'leave the variant group' };
}
