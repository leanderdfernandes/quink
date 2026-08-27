import { useEffect, useRef, useState } from 'react'
import { QUICK_WORDS, STEER_INSTRUCTION_MAX } from '../lib/steer'

// The instruction field (PRD §6.1). One input, and quick words that FILL it.
//
// The filling is the design, not a shortcut. A chip that fires is a fixed verb wearing a
// different hat — it decides for the user what "better" means, which is the thing this
// replaces. A chip that puts the word in the field leaves the sentence theirs to finish:
// "shorter" becomes "shorter, and drop the bit about permissions".
//
// Shared by the selection bubble and the article bar, so the two cannot drift into
// different affordances for the same act.

type Props = {
  placeholder: string
  // Pre-filled when this is a "Try again" — reopening the field with the previous
  // instruction in it. Rerolling blindly is a slot machine; editing the ask is steering.
  initial?: string
  busy?: boolean
  submitLabel?: string
  onSubmit: (instruction: string) => void
  onCancel: () => void
}

export default function SteerField({
  placeholder,
  initial = '',
  busy = false,
  submitLabel = 'Change it',
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  // Once, on mount. The caret goes to the END so a pre-filled instruction is something to
  // extend rather than something to overwrite.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  function fill(word: string) {
    // Appended, never replacing: two quick words in a row should read as one instruction.
    setValue((v) => (v.trim() ? `${v.trim()}, ${word}` : word))
    ref.current?.focus()
  }

  return (
    <div className="str">
      <div className="str-row">
        <input
          ref={ref}
          type="text"
          className="str-in"
          placeholder={placeholder}
          value={value}
          maxLength={STEER_INSTRUCTION_MAX}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault()
              onSubmit(value.trim())
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
        />
        <button
          type="button"
          className="str-go"
          disabled={busy || !value.trim()}
          onClick={() => onSubmit(value.trim())}
        >
          {busy ? 'Working…' : submitLabel}
        </button>
      </div>
      <div className="str-quick">
        {QUICK_WORDS.map((w) => (
          <button type="button" key={w} className="str-chip" onClick={() => fill(w)}>
            {w}
          </button>
        ))}
        <button type="button" className="str-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
