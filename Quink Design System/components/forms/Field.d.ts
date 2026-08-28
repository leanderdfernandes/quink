/**
 * Label + control + hint.
 *
 */
export interface FieldProps {
  label?: React.ReactNode;
  /** Say what a good answer looks like. Never "required". */
  hint?: React.ReactNode;
  /** Appends a muted " · optional". @default false */
  optional?: boolean;
  htmlFor?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Field(props: FieldProps): JSX.Element;
