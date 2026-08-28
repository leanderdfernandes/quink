/** Step screenshot thumbnail — editor rail, reader spine, article rows. */
export interface ThumbProps {
  src?: string;
  /** Shown when there is no image yet. */
  index?: number | string;
  /** Portrait 32x42 instead of landscape 44x30. @default false */
  tall?: boolean;
  /** Current step — inset ring + lift. @default false */
  active?: boolean;
  alt?: string;
  style?: React.CSSProperties;
}
export declare function Thumb(props: ThumbProps): JSX.Element;
