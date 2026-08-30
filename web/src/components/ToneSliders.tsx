import { TONE_DETAIL, TONE_VOICE } from '../lib/tone'

// Tone of voice, as two labelled ranges beside a sample that rewrites itself.
//
// This is the whole reason audience and tone are back after 0044 dropped them. PRD §4 cut
// them because "the fields do very little" and the user "senses this and is correct" — but
// what it actually recorded was a CONTROL problem, not a value problem: v1 asked for tone as
// an abstract dropdown, so the only way to find out what "Casual" did was to spend a run.
// The sample is the fix. Move a slider and the paragraph beside it changes in front of you,
// which is the one thing a dropdown could never do.
//
// The sample sentences are canned, and deliberately so: generating them would be a model
// call, and CLAUDE.md §5 allows exactly two in the pipeline and none anywhere for decoration.
// They are handwritten to show the SHAPE of each setting — voice picks the opener, detail
// decides how many clauses survive — which is what the control actually governs.

// Indexed by voice (Formal · Neutral · Warm · Casual).
const OPENER = [
  'To create a collection, select Library in the sidebar, then choose New collection.',
  'Open Library in the sidebar and choose New collection.',
  'Head to Library in the sidebar and pick New collection.',
  'Jump into Library in the sidebar and hit New collection.',
]
const DETAIL = [
  ' Enter a name and confirm; the collection is created immediately.',
  ' Give it a name and press Create — it appears at the top of your library.',
  ' Give it a name, press Create, and it’ll show up at the top of your library.',
  ' Name it, hit Create, and it pops up at the top of your library.',
]
const EXTRA = [
  ' A collection may be renamed or deleted at any time from the same screen.',
  ' You can rename or delete it later from the same screen, and nothing you’ve saved is lost.',
  ' You can rename or delete it later from the same screen — nothing you’ve saved goes anywhere.',
  ' Changed your mind? Rename or delete it from the same screen later. Nothing you saved goes anywhere.',
]

// Detail is CUMULATIVE, not a different sentence: Brief is the opener, Balanced adds the
// second clause, Thorough adds the third. That is what "detail" means, and a sample where
// the three settings were three unrelated paragraphs would teach the wrong thing.
export function sampleFor(voice: number, detail: number) {
  return OPENER[voice] + (detail >= 1 ? DETAIL[voice] : '') + (detail >= 2 ? EXTRA[voice] : '')
}

function Range({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="ps-range">
      <div className="ps-range-hd">
        <span className="ps-range-lb">{label}</span>
        <span className="ps-range-v">{options[value]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {/* The notches carry the words, so the control is never abstract — you can read what
          the far end of the range is without dragging to it. */}
      <div className="ps-range-ticks">
        {options.map((o, i) => (
          <span key={o} className={i === value ? 'on' : undefined}>
            {o}
          </span>
        ))}
      </div>
    </div>
  )
}

type Props = {
  voice: number
  detail: number
  onChange: (voice: number, detail: number) => void
}

export default function ToneSliders({ voice, detail, onChange }: Props) {
  return (
    <div className="ps-tone">
      <div className="ps-tone-rows">
        <Range label="Voice" options={TONE_VOICE} value={voice} onChange={(v) => onChange(v, detail)} />
        <Range label="Detail" options={TONE_DETAIL} value={detail} onChange={(d) => onChange(voice, d)} />
      </div>
      <div className="ps-sample">
        <p className="ps-sample-cap">A step, written this way</p>
        <p className="ps-sample-t">{sampleFor(voice, detail)}</p>
      </div>
    </div>
  )
}
