/**
 * Without the interface message code (`messageCode` and `messageParams`): the model tests
 * compare the text (`message`), which did not change (stage #1263, decision 8).
 */
export function withoutMessageCode<T extends object>(
  item: T,
): Omit<T, 'messageCode' | 'messageParams'> {
  return Object.fromEntries(
    Object.entries(item).filter(
      ([key]) => key !== 'messageCode' && key !== 'messageParams',
    ),
  ) as Omit<T, 'messageCode' | 'messageParams'>;
}
