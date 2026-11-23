import { colorTokenNames, isBackgroundToken, type Project } from '../src/model';
import { TOKEN_NAME_PATTERN } from '../src/model/components/tokens';
import type { ContainerBackground } from '../src/model';
import { ToolError } from './errors';

// The background of a container without a file as the MCP takes it (stage #1900, NV4, decision 26): a
// `#RRGGBB` string or `{ "$token": "<name>" }`. The token must be a color token of the applied
// specializations; the model does not check that it exists (a stored one may become undeclared later).

/** Refuses a token background that no applied specialization declares as a color; a color string passes. */
export function checkBackgroundInput(
  p: Project,
  background: ContainerBackground | undefined,
): void {
  if (!isBackgroundToken(background)) return;
  const token = background.$token;
  if (!TOKEN_NAME_PATTERN.test(token)) {
    throw new ToolError(
      'invalid-arguments',
      `the token name "${token}" is invalid: use letters a-z in lowercase, digits and hyphens (\`[a-z0-9][a-z0-9-]*\`)`,
    );
  }
  const colorTokens = colorTokenNames(p);
  if (!colorTokens.includes(token)) {
    throw new ToolError(
      'invalid-arguments',
      `the token "${token}" is not a color token of the applied specializations`,
      { colorTokens: [...colorTokens] },
    );
  }
}

/** The background as text for a description: `#RRGGBB` in uppercase or `token <name>`. */
export function backgroundText(background: ContainerBackground): string {
  return isBackgroundToken(background)
    ? `token ${background.$token}`
    : background.toUpperCase();
}
