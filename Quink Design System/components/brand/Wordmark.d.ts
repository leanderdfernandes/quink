/**
 * The Quink wordmark. Letters take currentColor (or an explicit tone); the bolt "i" keeps
 * its green.
 *
 */
export interface WordmarkProps {
  /** Rendered height in px. 22 in app top bars, 26–30 on marketing. @default 22 */
  height?: number;
  /** 'current' inherits colour; 'ink' and 'light' pin it for known surfaces. @default 'current' */
  tone?: 'current' | 'ink' | 'light';
  style?: React.CSSProperties;
}
export declare function Wordmark(props: WordmarkProps): JSX.Element;
export declare const BOLT_PATH: string;
