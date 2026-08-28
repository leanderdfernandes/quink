/**
 * A raised surface. v2 has no card borders at all — elevation and surface lightness do it.
 *
 */
export interface CardProps {
  children?: React.ReactNode;
  /** true = 24px · 'lg' = 32px. */
  pad?: boolean | 'lg';
  /** inset = a sunken well (no shadow) · panel = 20px radius + overlay elevation. */
  variant?: 'inset' | 'panel';
  /** Adds hover lift + pointer. */
  interactive?: boolean;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}
export declare function Card(props: CardProps): JSX.Element;
