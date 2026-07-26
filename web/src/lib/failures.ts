import { MAX_VIDEO_MINUTES } from './config'

// The failure taxonomy, SPA side. MIRRORS the codes in worker/failures.py — same list,
// same spelling. The worker owns classification; this file owns nothing but the words.
//
// `failure_detail` is deliberately absent and unreachable: migration 0020 revokes the
// column from anon and authenticated, so the SPA cannot render a raw exception even if a
// future select asks for one. The CODE is the whole contract.
//
// Three rules these screens hold, in order of how much damage breaking them does:
//
//   1. Never blame the user's file when it's ours. A user who believes their recording is
//      bad re-records it, fails again, and leaves. Only `video_unreadable` and
//      `video_too_long` are about their file; everything else says so explicitly.
//   2. Recovery never requires re-uploading — the recording is still in Storage for 7 days
//      and `retry` re-runs from it.
//   3. Every screen carries the job id, so support never has to ask "can you send me the
//      link?" — the largest per-ticket cost at this volume.

export type Recovery =
  | 'retry' //     re-run from the stored recording; no file, no upload
  | 'reupload' //  the recording itself is the problem
  | 'trim' //      too long: shorten it first
  | 'support' //   nothing the user can do alone

export type Failure = {
  heading: string
  body: string
  recovery: Recovery
}

export const FAILURES: Record<string, Failure> = {
  video_unreadable: {
    heading: "We couldn't read this recording",
    body: "It may be corrupted, or the upload didn't finish.",
    recovery: 'reupload',
  },
  video_too_long: {
    heading: 'That recording is too long',
    body: `Recordings up to ${MAX_VIDEO_MINUTES} minutes for now.`,
    recovery: 'trim',
  },
  model_unavailable: {
    heading: 'Our processing service is busy right now',
    body: "Your recording is safe — nothing's wrong with your file.",
    recovery: 'retry',
  },
  model_bad_output: {
    heading: 'Something went wrong while building your article',
    body: "This one's on us.",
    recovery: 'retry',
  },
  model_blocked: {
    heading: "We couldn't process this recording",
    body: "Get in touch and we'll take a look.",
    recovery: 'support',
  },
  frame_extraction_failed: {
    heading: 'Something went wrong while capturing screenshots',
    body: "This one's on us.",
    recovery: 'retry',
  },
  timeout: {
    heading: 'This took longer than expected',
    body: 'Your recording is safe.',
    recovery: 'retry',
  },
  spend_cap: {
    heading: "We've hit a temporary processing limit",
    body: "Nothing's wrong with your file — try again shortly.",
    recovery: 'retry',
  },
  // Not in the spec's table. Anything unclassified lands here rather than nowhere: a code
  // the SPA can't name is how the stuck spinner comes back. Same "on us" copy, because
  // that is what an unexpected exception on our side is.
  internal_error: {
    heading: 'Something went wrong while building your article',
    body: "This one's on us.",
    recovery: 'retry',
  },
  // Past the 7-day window: the retention sweep has collected the recording, so there is
  // nothing left to re-run. Not an error — a clean state with one clear action.
  video_purged: {
    heading: 'This recording is no longer stored',
    body: 'We delete recordings after a week. Upload it again and we’ll rebuild the article.',
    recovery: 'reupload',
  },
}

// An unknown code (an older worker, a code added ahead of a deploy) must still render a
// real screen with a real way out — never a blank card.
export function failureFor(code: string | null | undefined): Failure {
  return FAILURES[code ?? ''] ?? FAILURES.internal_error
}

// `quota_exceeded` is NOT in the map on purpose. It is not a failure and must never render
// as one — it is the upgrade modal (pricing-spec §7).
export const QUOTA_EXCEEDED = 'quota_exceeded'
