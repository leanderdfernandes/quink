/**
 * The dialog. Left-aligned, 26px radius, spring rise. Reserved for a decision that has to be
 * made now: publish, upgrade, delete an account.
 */
export interface SheetProps {
  /** @default true */
  open?: boolean;
  /** Icon name for the 52px tile above the title. */
  icon?: string;
  /** Success face — the tile turns accent green. @default false */
  done?: boolean;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer row; the primary action goes first. */
  actions?: React.ReactNode;
  /** Called on Escape and on scrim click. */
  onClose?: () => void;
  /** @default 480 */
  width?: number;
}
export declare function Sheet(props: SheetProps): JSX.Element | null;
