/** A titled list section — a folder in the library, a category in the reader. */
export interface GroupProps {
  name: React.ReactNode;
  /** Mono count, e.g. "4 articles". */
  count?: React.ReactNode;
  actions?: React.ReactNode;
  /** <Row> children. */
  children?: React.ReactNode;
  /** Shown when there are no rows. */
  empty?: React.ReactNode;
  /** Sunken instead of raised — for "Unfiled" and other secondary groups. @default false */
  quiet?: boolean;
  style?: React.CSSProperties;
}
export declare function Group(props: GroupProps): JSX.Element;
