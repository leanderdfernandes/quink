/** Single-line text input, plus the pill search variant. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Pill radius with an inset magnifier. @default false */
  search?: boolean;
}
export declare function Input(props: InputProps): JSX.Element;
