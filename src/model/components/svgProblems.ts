import { templateMessage } from '../messages';
import type { ModelMessage } from '../modelMessage';

/**
 * The problems the SVG converter reports (`svgIcon.ts`, `svgGradient.ts`): a list without
 * repeats, in the order found, and the three messages that name an element or an attribute.
 */
export class Problems {
  private readonly byText = new Map<string, ModelMessage>();

  add(message: ModelMessage): void {
    if (!this.byText.has(message.text)) this.byText.set(message.text, message);
  }

  get size(): number {
    return this.byText.size;
  }

  list(): ModelMessage[] {
    return [...this.byText.values()];
  }
}

export const unsupportedElement = (element: string): ModelMessage =>
  templateMessage('svgIcon.unsupportedElement', { element });
export const unsupportedAttribute = (element: string, attribute: string): ModelMessage =>
  templateMessage('svgIcon.unsupportedAttribute', { element, attribute });
export const invalidValue = (
  element: string,
  attribute: string,
  value: string,
): ModelMessage => templateMessage('svgIcon.invalidValue', { element, attribute, value });
