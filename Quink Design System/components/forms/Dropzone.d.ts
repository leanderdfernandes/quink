/** The upload target. Idle, drag-over, and loaded (which renders your own children). */
export interface DropzoneProps {
  /** @default 'idle' */
  state?: 'idle' | 'over' | 'loaded';
  /** Serif, at the step-heading size. */
  title?: React.ReactNode;
  /** The disclosure line — state the limits here, before the file is committed. */
  sub?: React.ReactNode;
  /** Rendered instead of the tile when state is 'loaded' (your file rows). */
  children?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Dropzone(props: DropzoneProps): JSX.Element;
