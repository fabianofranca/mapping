/**
 * Sem o código de mensagem da interface (`messageCode` e `messageParams`): os testes do modelo
 * comparam o texto (`message`), que não mudou (etapa #1263, decisão 8).
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
