/** Overlapping initial discs — team presence in a top bar or on the People screen. */
export interface AvatarStackProps {
  people: Array<string | { name: string }>;
  /** @default 4 */
  max?: number;
  /** @default 28 */
  size?: number;
  style?: React.CSSProperties;
}
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
