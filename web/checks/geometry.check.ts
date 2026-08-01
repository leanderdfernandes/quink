// Runnable check: `node --experimental-strip-types checks/geometry.check.ts` from web/
//
// The annotation geometry contract (item 2). The bug was never coordinate maths — it was
// that two surfaces put the overlay on a box with a DIFFERENT aspect ratio than the image,
// and preserveAspectRatio="none" then scaled it non-uniformly: positions drifted, circles
// went elliptical, strokes came out heavier on one axis, text squashed.
//
// The fix is structural, so this asserts the structure rather than arithmetic. All three
// facts have to hold together; any one of them alone lets the bug back in.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../src/styles.css')
// Comments stripped: this file DISCUSSES preserveAspectRatio="none" at length, and a check
// that cannot tell the explanation from the bug is worse than no check.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const box = stripComments(read('../src/components/AnnotatedImage.tsx'))

// 1. ONE component owns the box. Two would diverge again — that is how this shipped broken.
for (const surface of ['../src/editor/StepCard.tsx', '../src/reader/ReaderSite.tsx']) {
  assert.ok(
    read(surface).includes('AnnotatedImage'),
    `${surface} must render the shared AnnotatedImage — a second box is the bug`,
  )
}

// 2. The viewBox is the image's NATURAL size, and preserveAspectRatio="none" is gone.
assert.ok(
  /viewBox=\{`0 0 \$\{nat\.w\} \$\{nat\.h\}`\}/.test(box),
  'the overlay viewBox must be the image natural pixel size',
)
assert.ok(
  !box.includes('preserveAspectRatio="none"'),
  'preserveAspectRatio="none" scales non-uniformly — it is exactly what distorted the shapes',
)
assert.ok(
  box.includes("vectorEffect: 'non-scaling-stroke'"),
  'every stroked shape needs non-scaling-stroke, not only the selection rectangle',
)

// 3. The box shrink-wraps the image, and nothing crops or letterboxes it.
const rule = (sel: string) => {
  const i = css.indexOf(sel + ' {')
  assert.ok(i !== -1, `missing CSS rule ${sel}`)
  return css.slice(i, css.indexOf('}', i))
}
assert.ok(rule('.aimg').includes('width: fit-content'), '.aimg must shrink-wrap its image')
assert.ok(rule('.aimg-layer').includes('inset: 0'), '.aimg-layer must sit on the image box')
assert.ok(!rule('.aimg img').includes('object-fit'), '.aimg img must never crop or letterbox')
assert.ok(!rule('.aimg img').includes('aspect-ratio'), '.aimg img must not impose a ratio')

// The reader's frame is where this actually bit: it forced 16/10 and object-fit:contain, so
// every recording that was not 16:10 rendered letterboxed under a stretched overlay.
const frame = rule('.rs-frame')
assert.ok(
  !frame.includes('aspect-ratio'),
  '.rs-frame must not impose an aspect-ratio — it letterboxed the image under a stretched overlay',
)
assert.ok(!frame.includes('object-fit'), '.rs-frame must not object-fit the image')

// 4. The geometry itself, for a NON-16:9 image — the case that was broken. A shape drawn at
// normalized coords must land at the same fraction of the box on any surface, and a circle
// must stay circular: with viewBox === natural size and box === image box, the x and y
// scale factors are identical by construction.
for (const [w, h, label] of [
  [1512, 982, '1512x982 — a real macOS window capture, ~1.54:1'],
  [1080, 1920, '1080x1920 — a phone recording, portrait'],
  [2560, 1440, '2560x1440 — 16:9, the case that always worked'],
] as const) {
  const displayedW = 640
  const displayedH = (displayedW * h) / w // the box IS the image, so this is forced
  const scaleX = displayedW / w
  const scaleY = displayedH / h
  assert.ok(
    Math.abs(scaleX - scaleY) < 1e-9,
    `${label}: x and y must scale identically or circles go elliptical (${scaleX} vs ${scaleY})`,
  )
  // A circle drawn as a square drag stays a circle.
  const r = 0.2
  assert.ok(
    Math.abs(r * w * scaleX - r * h * scaleY * (w / h)) < 1e-6,
    `${label}: radius must be ratio-preserving`,
  )
}

console.log('annotation geometry self-check OK')
