/**
 * A tinted notice — disclosure lines, trial warnings, handover greetings, failures.
 *
 */
export interface NoticeProps {
  children?: React.ReactNode;
  /**
   * neutral  — a fact worth stating (the free-tier disclosure).
   * brand    — good news (a handover, a completion).
   * caution  — a deadline the user can still act on.
   * critical — something went wrong, with a way to reach a human.
   * @default 'neutral'
   */
  tone?: 'neutral' | 'brand' | 'caution' | 'critical';
  /** Override the tone's default glyph. */
  icon?: string;
  /** Right-aligned control, usually a Button size="sm". */
  action?: React.ReactNode;
  /** Session-scoped dismissal only. */
  onDismiss?: () => void;
  /** Full-width app bar variant — square corners, gutter padding. @default false */
  bar?: boolean;
  style?: React.CSSProperties;
}
export declare function Notice(props: NoticeProps): JSX.Element;
