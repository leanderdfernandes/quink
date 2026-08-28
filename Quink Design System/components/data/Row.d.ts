/** The list row — library articles, reader article lists, search results, people. */
export interface RowProps {
  title: React.ReactNode;
  /** One line, ellipsised. */
  desc?: React.ReactNode;
  /** Mono metadata, usually a <Micro>. */
  meta?: React.ReactNode;
  /** A <State> element, shown only when the row is not the norm. */
  state?: React.ReactNode;
  /** A <Thumb> for step or article previews. */
  thumb?: React.ReactNode;
  /** Hover-revealed controls. Suppresses the chevron. */
  actions?: React.ReactNode;
  /** @default true (hidden when actions are present) */
  arrow?: boolean;
  href?: string;
  onClick?: () => void;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}
export declare function Row(props: RowProps): JSX.Element;
