/**
 * The Quink button. Five variants, three sizes, no borders.
 *
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /**
   * primary   — brand fill; one per view.
   * accent    — the bolt green; completion and "it's live" actions only.
   * secondary — a raised neutral surface (this replaced v1's outlined ghost).
   * ghost     — no surface at rest; the default for everything in a toolbar.
   * critical  — destructive, and only ever the second step of a confirm.
   * @default 'primary'
   */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'critical';
  /** sm 32px · default 38px · lg 46px. */
  size?: 'sm' | 'lg';
  icon?: string;
  iconAfter?: string;
  pill?: boolean;
  full?: boolean;
  href?: string;
  as?: keyof JSX.IntrinsicElements;
}
export declare function Button(props: ButtonProps): JSX.Element;
