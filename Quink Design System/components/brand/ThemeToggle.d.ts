/**
 * Light/dark toggle. Sets data-theme on <html>, persists the choice, follows the OS until
 * the user picks. An intentional addition — v1 had no dark mode.
 */
export interface ThemeToggleProps {
  /** Element to set data-theme on. @default document.documentElement */
  target?: HTMLElement;
  /** @default 'quink-theme' */
  storageKey?: string;
}
export declare function ThemeToggle(props: ThemeToggleProps): JSX.Element;
