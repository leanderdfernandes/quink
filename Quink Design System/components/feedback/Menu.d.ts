/** The dropdown: publish options, the new-article chooser, row overflow. */
export interface MenuItem {
  type?: 'group' | 'divider';
  label?: React.ReactNode;
  /** The consequence line. Every item that changes something visible needs one. */
  sub?: React.ReactNode;
  icon?: string;
  switch?: boolean;
  onToggle?: (next: boolean) => void;
  critical?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export interface MenuProps {
  items: MenuItem[];
  /** Min-width is 260px; set this to pin a wider panel. */
  width?: number;
  style?: React.CSSProperties;
}
export declare function Menu(props: MenuProps): JSX.Element;
