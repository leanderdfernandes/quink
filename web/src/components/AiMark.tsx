// The mark that says "a model wrote this, and you are about to decide about it".
//
// It exists because the AI surfaces were indistinguishable from the rest of the editor.
// A diff card looked like a form, "Change this…" looked like another formatting button,
// and the clarification questions looked like a wizard step — so the one thing a user most
// needs to know before tapping Keep, that a machine produced this and they are the review,
// was carried by nothing at all.
//
// ONE mark, used on every AI surface and nowhere else. Its value is entirely in being
// consistent: the second it appears on something a model did not write, it stops meaning
// anything. Current homes: the "Change this…" item in the selection bubble, both diff cards
// (steer and recheck), the article steer bar, the clarification panel and the editor's
// carried-over questions.
//
// A four-point sparkle, drawn as a filled path on the same 24 grid as the rest of the icon
// set. Not an emoji (CLAUDE.md forbids emoji as iconography), and not a robot or a brain —
// both of those claim more about what is happening than a text model deserves.

export default function AiMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: 'block', flex: 'none' }}
    >
      {/* The big star, off-centre so the pair reads as a sparkle rather than as a compass. */}
      <path d="M10 2.5c.2 3.1.9 5.2 2.1 6.4C13.3 10.1 15.4 10.8 18.5 11c-3.1.2-5.2.9-6.4 2.1-1.2 1.2-1.9 3.3-2.1 6.4-.2-3.1-.9-5.2-2.1-6.4C6.7 11.9 4.6 11.2 1.5 11c3.1-.2 5.2-.9 6.4-2.1C9.1 7.7 9.8 5.6 10 2.5Z" />
      {/* The small one. */}
      <path d="M18 14.5c.1 1.7.5 2.8 1.1 3.4.6.6 1.7 1 3.4 1.1-1.7.1-2.8.5-3.4 1.1-.6.6-1 1.7-1.1 3.4-.1-1.7-.5-2.8-1.1-3.4-.6-.6-1.7-1-3.4-1.1 1.7-.1 2.8-.5 3.4-1.1.6-.6 1-1.7 1.1-3.4Z" />
    </svg>
  )
}

// The mark plus a word, for the top of a card. The word matters as much as the glyph: a
// sparkle on its own is decoration, and the label is what makes the card legible to
// somebody who has never seen this product before.
export function AiTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="ai-tag">
      <AiMark size={13} />
      {children}
    </span>
  )
}
