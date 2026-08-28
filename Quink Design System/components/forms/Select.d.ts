/** Native select, styled as a filled field with a chevron. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<string | { value: string; label: string }>;
}
export declare function Select(props: SelectProps): JSX.Element;
