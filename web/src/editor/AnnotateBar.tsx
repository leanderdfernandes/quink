import { SEMANTIC, TOOLS, type Tool } from './useAnnotator'

// The annotate toolbar. Anchored to the image it acts on — not a rail, not a modal header —
// because the thing being edited is right there and a control that travels away from its
// object stops reading as attached to it.
//
// Compact on purpose: five tools, five colours, one exit. Every control this does not have
// is a decision the author does not have to make.

const ToolIcon = ({ t }: { t: Tool }) => {
  const s = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (t) {
    case 'select':
      return (
        <svg {...s}>
          <path d="M5 3l6.5 16 2.2-6.3L20 10.5z" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...s}>
          <path d="M6 18L18 6M18 6h-7M18 6v7" />
        </svg>
      )
    case 'box':
      return (
        <svg {...s}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...s}>
          <ellipse cx="12" cy="12" rx="8" ry="7" />
        </svg>
      )
    default:
      return (
        <svg {...s}>
          <path d="M5 6h14M12 6v12M9 18h6" />
        </svg>
      )
  }
}

type Props = {
  tool: Tool
  colour: string
  brandColor: string
  canDelete: boolean
  onPick: (t: Tool) => void
  onColour: (c: string) => void
  onDelete: () => void
  onDone: () => void
}

export default function AnnotateBar({
  tool,
  colour,
  brandColor,
  canDelete,
  onPick,
  onColour,
  onDelete,
  onDone,
}: Props) {
  return (
    <div className="anb" role="toolbar" aria-label="Annotation tools">
      <div className="anb-tools">
        {TOOLS.map((t) => (
          <button
            key={t.t}
            type="button"
            className="anb-tool"
            aria-pressed={tool === t.t}
            aria-label={t.label}
            title={`${t.label} (${t.key})`}
            onClick={() => onPick(t.t)}
          >
            <ToolIcon t={t.t} />
          </button>
        ))}
      </div>

      <span className="anb-div" aria-hidden />

      <div className="anb-colours" role="group" aria-label="Colour">
        <button
          type="button"
          className="anb-sw"
          aria-pressed={colour === brandColor}
          aria-label="Your brand colour"
          title="Your brand colour"
          style={{ background: brandColor }}
          onClick={() => onColour(brandColor)}
        />
        {SEMANTIC.map((s) => (
          <button
            key={s.c}
            type="button"
            className="anb-sw"
            aria-pressed={colour === s.c}
            aria-label={s.label}
            title={s.label}
            style={{ background: s.c }}
            onClick={() => onColour(s.c)}
          />
        ))}
      </div>

      <span className="anb-div" aria-hidden />

      <button type="button" className="anb-del" disabled={!canDelete} onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="anb-done" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
