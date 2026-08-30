import type { ReactNode } from 'react'
import { TONE_DEFAULT, toneLabel } from '../lib/tone'
import type { ProductContext } from '../lib/types'

// "Writing this against Acme" — the whole product context in three lines, at the moment it
// is about to be used.
//
// ONE component with two hosts, for the same reason ProductNotes is: the upload card shows
// it for real, and Settings shows it inside "Show me" so someone filling the form can see
// where the answers land. A second copy would drift, and the drift would be a preview that
// disagrees with the screen it previews.
//
// It shows what a run is GROUNDED ON, not everything stored: the name, who it is for, how it
// will read, and whether there are notes. The notes themselves are not expanded here — this
// is a glance before spending a run, and a wall of glossary entries is not a glance.

type Props = {
  product: ProductContext
  /** Rendered at the end of the header row: "Change for this one", or nothing. */
  action?: ReactNode
  /** The per-run override is in effect, so say so where the summary is being read. */
  changed?: boolean
  /** Appended for this run only, if the user typed one. Shown in place of the notes line. */
  oneOff?: string
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function ContextSummary({ product, action, changed, oneOff }: Props) {
  const name = product.name.trim() || 'your product'
  // Every fallback below is what the RUN will actually do with an empty field, not a guess
  // dressed up as one: the prompt builder omits the line entirely, so "Anyone using X" and
  // the default tone are honest descriptions of "we say nothing about this".
  const audience = product.audience.trim() || `Anyone using ${name}`
  const tone = product.tone.trim() || toneLabel(TONE_DEFAULT[0], TONE_DEFAULT[1])
  const note = oneOff?.trim()
    ? oneOff.trim().split('\n').filter(Boolean)[0]
    : product.notes.length
      ? plural(product.notes.length, 'note')
      : product.description.trim()
        ? 'From your product description'
        : 'None yet'

  return (
    <div className="ctxs">
      <div className="ctxs-hd">
        <b>Writing this against {name}</b>
        {changed && <span className="ctxs-changed">Changed for this one</span>}
        <span className="ctxs-sp" />
        {action}
      </div>
      <ul className="ctxs-rows">
        {(
          [
            ['For', audience],
            ['Voice', tone],
            ['Notes', note],
          ] as const
        ).map(([k, v]) => (
          <li key={k}>
            <span className="ctxs-k">{k}</span>
            <span className="ctxs-v">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
