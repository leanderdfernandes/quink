import type { CSSProperties } from 'react'
import { FONT_PAIRINGS } from '../lib/config'

// Per-KB theming, applied at render via CSS custom properties (build spec §1/§3): one
// stylesheet serves every customer, and the PRIMARY COLOUR IS THE ONLY COLOUR STORED —
// the whole --brand-* ramp the reader CSS already uses is derived from it here with
// color-mix. Change the hex, and nav, links and step rails all move together.

export function isValidHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

// #abc -> #aabbcc, lowercase. Assumes isValidHex already passed.
export function normalizeHex(v: string): string {
  let h = v.trim().toLowerCase()
  if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('')
  return h
}

// Override the brand ramp the existing reader CSS references (--brand-600 is the hero:
// step-num bg, buttons, active nav). Lighter tints mix toward white, darker toward black,
// so a single hex yields hover/tint/active/rail without a second input anywhere.
export function themeVars(primaryColor: string, fontPairing: string): CSSProperties {
  const c = isValidHex(primaryColor) ? normalizeHex(primaryColor) : '#1f6e6b'
  const lighter = (pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, white)`
  const darker = (pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, black)`
  const pairing = FONT_PAIRINGS[fontPairing] ?? FONT_PAIRINGS.modern
  return {
    '--brand': c,
    '--brand-50': lighter(92),
    '--brand-100': lighter(82),
    '--brand-200': lighter(65),
    '--brand-300': lighter(45),
    '--brand-400': lighter(25),
    '--brand-500': darker(8),
    '--brand-600': c,
    '--brand-700': darker(16),
    '--brand-800': darker(30),
    '--brand-900': darker(50),
    '--font-heading': pairing.heading,
    '--font-body': pairing.body,
  } as CSSProperties
}
