// Brand-colour choices for the theming screen.
//
// TWO rows, and they answer different questions. Row one is "the colours you already use",
// pulled out of the logo the customer just uploaded. Row two is "pick one", and it is
// GENERATED rather than a pasted list of hex codes, because the whole point of it is a
// relationship the hex codes hide: every swatch sits at the same OKLCH lightness, so every
// one of them lands at roughly the same contrast behind white masthead text. The old
// hand-picked set did not — amber came out far lighter than the rest and turned the band
// unreadable, which is the bug this replaces.

// Perceptual lightness and chroma of the pickable set. Lightness is the load-bearing
// number; chroma is as far as sRGB will carry most of these hues before clipping.
const PICK_L = 46
const PICK_C = 0.15

// Eight hues, evenly-ish spaced around the wheel and named for what a customer would call
// them. Some of these are outside the sRGB gamut at this lightness/chroma and the browser
// maps them back in — expected, and the reason the lightness is what we hold constant.
const PICK_HUES = [250, 292, 334, 22, 58, 128, 168, 206]

// The out for a brand that isn't a colour at all. Same formula, near-zero chroma.
const NEUTRAL = 'oklch(30% 0.02 90)'

const SWATCH_CSS = [...PICK_HUES.map((h) => `oklch(${PICK_L}% ${PICK_C} ${h})`), NEUTRAL]

// oklch() -> #rrggbb by asking the browser, which already owns a correct gamut mapping.
// Doing the OKLab matrix work by hand here would be forty lines that get the easy cases
// right and the out-of-gamut ones wrong.
//
// It goes through a 1x1 CANVAS, not through getComputedStyle. That is the whole fix for a
// bug that made this row unusable: `getComputedStyle(el).color` no longer serialises to
// `rgb(...)` for a wide-gamut colour — Chrome hands back `oklch(0.46 0.15 58)` verbatim —
// so scraping the first three numbers out of it read L, C and HUE as if they were R, G, B.
// Every swatch came out a near-black blue, and the two hues above 255 both clamped to the
// exact same #0000FF. A canvas is sRGB by definition, so painting the colour and reading
// the pixel back makes the browser do the conversion AND the gamut mapping for us.
function cssToHex(css: string): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  // An unparseable colour leaves fillStyle at its previous value, which is how a browser
  // with no oklch() support is detected — it must yield null, not a silently wrong hex.
  ctx.fillStyle = '#000000'
  ctx.fillStyle = css
  if (ctx.fillStyle === '#000000' && css !== '#000000') return null
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return rgbToHex(r, g, b)
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

// A browser with no oklch() support gets nothing rather than a set that quietly breaks the
// equal-lightness promise. Memoized: this touches the DOM once per session.
let pickable: string[] | null = null

export function pickableColors(): string[] {
  if (pickable) return pickable
  const out = SWATCH_CSS.map(cssToHex).filter((c): c is string => c !== null)
  pickable = out.length === SWATCH_CSS.length ? out : []
  return pickable
}

// --- colours out of the uploaded logo ---------------------------------------------------

// Rejected outright: paper, ink, and anything too grey to read as a brand colour. A logo is
// mostly white and black by area, so without these three the extractor returns white every
// time.
const MAX_LIGHT = 0.86
const MIN_LIGHT = 0.14
const MIN_SAT = 0.18
// Hue buckets, so two shades of the same blue don't take two of the three slots.
const BUCKETS = 12
const MAX_SUGGESTIONS = 3
// Below this share of the usable pixels it is an anti-aliasing artefact, not a brand colour.
const MIN_SHARE = 0.04

function saturationLightness(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { s, l, d, max, min }
}

function hueOf(r: number, g: number, b: number): number {
  const { d, max } = saturationLightness(r, g, b)
  if (d === 0) return 0
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const h =
    max === rn
      ? ((gn - bn) / d) % 6
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

/**
 * Up to three dominant colours from a logo image, as hex.
 *
 * Returns [] for anything it can't use — a logo that is pure black-and-white, an SVG the
 * canvas won't rasterize, a cross-origin read that fails. The caller HIDES the row on an
 * empty result rather than showing placeholder swatches: an empty "From your logo" row is
 * a promise the product didn't keep.
 */
export async function extractLogoColors(url: string): Promise<string[]> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const size = 40
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    const bins = Array.from({ length: BUCKETS }, () => ({ n: 0, r: 0, g: 0, b: 0 }))
    let usable = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 200) continue
      const { s, l } = saturationLightness(r, g, b)
      if (l > MAX_LIGHT || l < MIN_LIGHT || s < MIN_SAT) continue
      const bin = bins[Math.floor(hueOf(r, g, b) / (360 / BUCKETS)) % BUCKETS]
      bin.n += 1
      bin.r += r
      bin.g += g
      bin.b += b
      usable += 1
    }
    if (!usable) return []
    return bins
      .filter((x) => x.n / usable >= MIN_SHARE)
      .sort((a, b) => b.n - a.n)
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => rgbToHex(x.r / x.n, x.g / x.n, x.b / x.n))
  } catch {
    // A tainted canvas throws on getImageData. Same answer as "nothing usable".
    return []
  }
}
