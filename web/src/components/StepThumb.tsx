import { publicFrameUrl } from '../lib/storage'

// ONE thumbnail component, used by the reader's spine and the editor's rail.
//
// They were the same picture drawn twice, which is how they drift: the reader would get a
// fix the editor didn't, and an author would be navigating by a different map than the
// reader reads by. Both call this.
//
// A step with NO image gets the dashed numbered tile rather than a gap. That is not
// decoration — it is how a `frames_partial` degrade (§10g) becomes visible: the author can
// see at a glance which steps shipped without a screenshot, in the same list they navigate
// by. An empty slot would hide exactly the thing they need to fix.

type Props = {
  stepNumber: number
  // Storage path, not a URL. Both surfaces resolve it through the same public bucket, so
  // the second render is a cache hit rather than a second fetch.
  screenshotPath: string | null
  // Portrait thumbs are tall, everything else is wide. The caller knows the aspect because
  // it measured the full-size image; unknown defaults to wide, matching the reader's
  // landscape default.
  portrait?: boolean
  className?: string
}

export default function StepThumb({
  stepNumber,
  screenshotPath,
  portrait = false,
  className = '',
}: Props) {
  const url = publicFrameUrl(screenshotPath)
  const cls = `step-thumb${portrait ? '' : ' wide'}${url ? '' : ' none'} ${className}`.trim()
  return (
    <span className={cls}>
      {url ? (
        <img src={url} alt="" decoding="async" />
      ) : (
        <span className="step-thumb-num" aria-hidden>
          {stepNumber}
        </span>
      )}
    </span>
  )
}
