/** A rail of exclusive views. Four or more sections that each own a screen; below that use Segmented. */
export interface TabItem {
  value: string;
  label: string;
  /** Optional count rendered after the label, tabular. */
  count?: number;
}
export interface TabsProps {
  tabs: Array<string | TabItem>;
  value?: string;
  onChange?: (value: string) => void;
  /** Accessible name for the tablist. */
  label?: string;
  style?: React.CSSProperties;
}
export declare function Tabs(props: TabsProps): JSX.Element;

export interface TabPanelProps {
  /** The tab this panel belongs to. */
  tab: string;
  /** The currently selected tab. */
  value?: string;
  children?: React.ReactNode;
}
export declare function TabPanel(props: TabPanelProps): JSX.Element | null;
