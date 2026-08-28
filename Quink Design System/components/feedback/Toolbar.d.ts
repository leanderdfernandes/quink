/**
 * The floating selection toolbar (text formatting, "ask AI about this selection", annotate
 * tools). Dark chrome, --z-toolbar, and it flips below the selection rather than overlapping
 * the top bar.
 */
export interface ToolbarItem {
  type?: 'divider';
  icon?: string;
  /** Used as the accessible name, and rendered as text when there is no icon. */
  label?: string;
  on?: boolean;
  onClick?: () => void;
}
export interface ToolbarProps {
  items: ToolbarItem[];
  /** The selection rect, in the offset parent's coordinates. The component decides flip. */
  rect?: { top: number; bottom: number; left: number; width: number };
  style?: React.CSSProperties;
}
export declare function Toolbar(props: ToolbarProps): JSX.Element;
