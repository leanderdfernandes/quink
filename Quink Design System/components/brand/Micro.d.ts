/**
 * The mono micro-label: rail captions, counts, article metadata, "on this page".
 *
 */
export interface MicroProps {
  children?: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  color?: string;
  style?: React.CSSProperties;
}
export declare function Micro(props: MicroProps): JSX.Element;
