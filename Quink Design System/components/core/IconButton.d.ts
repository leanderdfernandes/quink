/** Icon-only control. Ghost by default; `raised` when it floats on content. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required — becomes aria-label and title. */
  label: string;
  /** sm = 32px. @default 38px */
  size?: 'sm';
  tone?: 'critical';
  /** Adds a surface + elevation, for buttons over content rather than in a bar. */
  raised?: boolean;
  iconSize?: number;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
