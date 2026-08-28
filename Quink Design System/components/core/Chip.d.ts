/**
 * A filter chip. The one pill shape left in v2, because it is a control rather than a label.
 */
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** Tabular count shown at 60% opacity after the label. */
  count?: number | string;
  on?: boolean;
}
export declare function Chip(props: ChipProps): JSX.Element;
