import type { CSSProperties } from 'react'
import { FONT_PAIRINGS } from '../lib/config'

// Per-KB theming, applied at render via CSS custom properties (build spec §1/§3): one
// stylesheet serves every customer, and the PRIMARY COLOUR IS THE ONLY COLOUR STORED —
// every brand shade below is MIXED from it, none is hardcoded. Change the hex, and the
// band, links, tints and step rails all move together.

export function isValidHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

// #abc -> #aabbcc, lowercase. Assumes isValidHex already passed.
export function normalizeHex(v: string): string {
  let h = v.trim().toLowerCase()
  if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('')
  return h
}

// How the masthead band is filled. All four derive from the ONE brand colour except
// `image`, which puts a customer photo behind a brand scrim; the band's own ink/field
// tokens are set per treatment in styles.css, never guessed per page.
//
// `solid` is the default deliberately: the band is a flat fill of the brand itself, so it
// cannot turn grey. A tinted band mixed toward paper goes flat and grey for any desaturated
// brand (slate, charcoal), which is exactly the case that broke.
//
// Stored per KB on knowledge_bases.header_style (migration 0024).
export type { HeaderStyle } from '../lib/types'
export const DEFAULT_HEADER_STYLE = 'solid'

// `image` with nothing uploaded is not a broken band, it is a dark one: fall through to
// `ink`, which is the same near-black fill the scrim would have produced. The upload UI
// lands later, so this state is the NORMAL one for a while, not an edge case.
export function headerStyleOf(
  style: string | null | undefined,
  imagePath: string | null | undefined,
): string {
  if (style === 'image' && !imagePath) return 'ink'
  return style || DEFAULT_HEADER_STYLE
}

// Relative luminance (WCAG), used to decide what colour can legibly sit ON the brand.
// A fixed white would be right for teal and wrong for amber: white on #C2820A is 3.2:1,
// which fails AA for anything that isn't large text — and the band carries a sub-headline.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

// White or the warm near-black, whichever actually reads on this fill.
const READER_INK = '#1c1a16'
function onColor(hex: string): string {
  const l = luminance(hex)
  return contrast(l, 1) >= contrast(l, luminance(READER_INK)) ? '#fff' : READER_INK
}

// sRGB mix, so the same luminance picker can be pointed at a DERIVED fill and not just at
// the stored hex. color-mix() resolves in the browser, not here, so the ink/image bands
// would otherwise have to assert "always white" rather than measure it.
const DEEP_BASE = '#17150f'
function mixHex(a: string, b: string, aPct: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  const m = [1, 3, 5].map((i) =>
    Math.round(ch(a, i) * (aPct / 100) + ch(b, i) * (1 - aPct / 100)),
  )
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}

// The scrim floor over a customer header photo. The photo is theirs; the legibility is not
// negotiable, so this is the minimum darkening applied before the directional gradient and
// it is deliberately NOT reachable from any customer setting. If a scrim control is ever
// added it must clamp to at least this — an uploaded photo must never be able to make the
// customer's own masthead unreadable.
export const BAND_SCRIM_FLOOR_PCT = 75

// Override the brand ramp the existing reader/app CSS references (--brand-600 is the hero:
// step-num bg, buttons, active nav). Lighter tints mix toward white, darker toward black,
// so a single hex yields hover/tint/active/rail without a second input anywhere.
// The wash strength, clamped and defaulted the same way the hex is: an out-of-range or
// absent value falls back to the design system's own 9% rather than rendering nothing.
// The CHECK on the column is the real control; this is what keeps a LIVE PREVIEW honest
// while someone is dragging the slider past the end of it.
export const DEFAULT_BRAND_WASH = 9
export function normalizeWash(v: number | null | undefined): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(30, Math.round(v as number))) : DEFAULT_BRAND_WASH
}

export function themeVars(
  primaryColor: string,
  fontPairing: string,
  brandWash?: number | null,
): CSSProperties {
  const c = isValidHex(primaryColor) ? normalizeHex(primaryColor) : '#1f6e6b'
  const wash = normalizeWash(brandWash)
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

    // Reader mix tokens, alongside the ramp rather than replacing it — the app screens and
    // the editor still read --brand-NNN. These are what the reader chassis is built on, and
    // they mix against the reader's own warm neutrals (set on .rs2 in styles.css), so a tint
    // stays warm paper with brand in it rather than brand diluted with cold white.
    // The wash. Customer-controlled strength rather than a fixed 13%: a saturated brand
    // wants less of itself behind a card than a muted one does, and only they can see it
    // against their own logo. --brand-wash is the quieter half, used where a tint would be
    // too much (row hovers, the search field's rest state).
    '--brand-tint': `color-mix(in oklab, ${c} ${wash}%, var(--paper))`,
    '--brand-wash': `color-mix(in oklab, ${c} ${(wash / 2).toFixed(1)}%, var(--paper))`,
    '--brand-edge': `color-mix(in oklab, ${c} 30%, var(--border))`,
    // SURFACES only — the ink band, the image scrim. Almost black by design.
    '--brand-deep': `color-mix(in oklab, ${c} 30%, ${DEEP_BASE})`,
    // INTERACTIVE pressed/hover states. --brand-deep took Send and the state button nearly
    // to black and threw the brand away with it; 82% is a press, not a different colour.
    '--brand-press': `color-mix(in oklab, ${c} 82%, ${DEEP_BASE})`,
    '--brand-ring': `color-mix(in oklab, ${c} 18%, transparent)`,
    // Search-hit highlight. Mixed toward white, not toward paper: it sits on --surface.
    '--brand-mark': `color-mix(in oklab, ${c} 20%, #fff)`,
    // Everything that sits ON the brand fill reads this: the solid band's ink, the mark on
    // a tint band, the Send and "Go to help center" buttons.
    '--on-brand': onColor(c),
    // Same picker, pointed at the deep fill: what reads on the ink band and on the scrim.
    '--on-deep': onColor(mixHex(c, DEEP_BASE, 30)),

    '--font-heading': pairing.heading,
    '--font-body': pairing.body,
    // The pairing owns the headline WEIGHT too, or a grotesk choice renders at the serif's
    // 420 and reads underweight at 47px.
    '--font-heading-weight': pairing.headingWeight,
  } as CSSProperties
}
