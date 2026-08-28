/**
 * The Quink icon set — Lucide paths inlined at stroke 1.75, round caps, always currentColor.
 *
 * v2 lowered the stroke from 2 to 1.75 and raised the default size from 16 to 17: at 16px
 * body copy a 2px stroke read heavier than the text beside it.
 *
 */
export type IconName =
  | 'book' | 'box' | 'palette' | 'external' | 'globe' | 'people' | 'search'
  | 'folder' | 'folder-plus' | 'pencil' | 'trash' | 'dots' | 'chevron' | 'chevron-right'
  | 'check' | 'plus' | 'x' | 'upload' | 'film' | 'image' | 'file' | 'link'
  | 'eye' | 'eye-off' | 'sparkle' | 'arrow' | 'arrow-left' | 'undo' | 'redo'
  | 'lock' | 'clock' | 'sun' | 'moon'
  | 'check-circle' | 'dot-circle' | 'arrow-up-circle' | 'alert' | 'draft-circle'
  | 'grip' | 'bold' | 'italic' | 'split' | 'merge';

export interface IconProps {
  name: IconName;
  /** 15 inline · 17 default · 19 nav · 22 feature tiles. @default 17 */
  size?: number;
  /** @default 1.75 */
  strokeWidth?: number;
  /** Degrees. Animates when set. */
  rotate?: number;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element | null;
export declare const ICON_NAMES: IconName[];
