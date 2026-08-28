/**
 * Article + save state, said with an icon glyph and a weighted label — no pill, no dot.
 *
 * v1 rendered this as a coloured dot inside a bordered pill on every row. At list scale that
 * became forty bubbles competing with the titles, which is the thing that read as generated
 * rather than designed.
 */
export interface StateProps {
  /** @default 'draft' */
  state?: 'live' | 'draft' | 'unlisted' | 'edits' | 'building' | 'failed' | 'saving';
  /** Override the default label. */
  label?: React.ReactNode;
  /** Quieter trailing detail — a count, a timestamp, a URL. */
  sub?: React.ReactNode;
  /** @default 15 */
  size?: number;
  style?: React.CSSProperties;
}
export declare function State(props: StateProps): JSX.Element;
