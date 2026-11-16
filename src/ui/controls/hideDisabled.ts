import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/**
 * Inside the reference preview's Details (stage #883, PG3) a disabled button is an editing action
 * that must not be offered at all: buttons, icon buttons and menu items that are disabled render
 * nothing. Everywhere else the default `false` keeps them visible and disabled.
 */
export const HideDisabledContext = createContext(false);

export function useHideDisabled(): boolean {
  return useContext(HideDisabledContext);
}
