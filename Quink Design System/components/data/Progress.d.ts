/** A 3px progress rule. Determinate by default — drive it from real stage data. */
export interface ProgressProps {
  /** 0–1. */
  value?: number;
  /** Only when the backend genuinely cannot report progress. @default false */
  indeterminate?: boolean;
  style?: React.CSSProperties;
}
export declare function Progress(props: ProgressProps): JSX.Element;
