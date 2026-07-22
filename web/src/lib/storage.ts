import { supabase } from './supabase'
import {
  STORAGE_BUCKET_BRANDING,
  STORAGE_BUCKET_FRAMES,
  STORAGE_BUCKET_VIDEOS,
} from './config'

// The public reader site can't sign URLs (it's anon and CDN-cached), so the `frames` and
// `branding` buckets are public (migration 0007). Reads go through getPublicUrl — no
// network round-trip, cacheable. The editor still uses signed URLs below; both work on a
// public bucket, and switching working code buys nothing.

export function publicFrameUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(STORAGE_BUCKET_FRAMES).getPublicUrl(path).data.publicUrl
}

export function publicBrandingUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(STORAGE_BUCKET_BRANDING).getPublicUrl(path).data.publicUrl
}

// Logo + derived favicon (build spec §1). Path keyed by user id for storage RLS.
export async function uploadBranding(
  userId: string,
  kind: 'logo' | 'favicon',
  blob: Blob,
  ext: string,
): Promise<string | null> {
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_BRANDING)
    .upload(path, blob, { contentType: blob.type || 'image/png' })
  return error ? null : path
}

// Frames and videos live in PRIVATE buckets (frames can contain on-screen PII —
// EVAL-PLAN V6), so they are never public URLs. Displaying one needs a signed URL.

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1h — long enough for an editing session

export async function signedFrameUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_FRAMES)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

export async function signedFrameUrls(
  paths: (string | null)[],
): Promise<(string | null)[]> {
  return Promise.all(paths.map(signedFrameUrl))
}

export async function signedVideoUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_VIDEOS)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

// The 1fps dense set backing the Tier-1 filmstrip. Frames are named "{second}.webp"
// zero-padded; the second is the number. Returns them sorted by second.
export async function listDenseFrames(
  userId: string,
  articleId: string,
): Promise<{ second: number; path: string }[]> {
  const prefix = `${userId}/${articleId}/dense`
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_FRAMES).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error || !data) return []
  return data
    .filter((o) => o.name.endsWith('.webp'))
    .map((o) => ({ second: parseInt(o.name, 10), path: `${prefix}/${o.name}` }))
}

// Upload a captured/chosen frame (Tier 2 canvas capture, Tier 3 upload) as a new
// per-step WebP and return its storage path. is_edited is set by the caller.
export async function uploadStepFrame(
  userId: string,
  articleId: string,
  stepNumber: number,
  blob: Blob,
): Promise<string | null> {
  const path = `${userId}/${articleId}/step-${stepNumber}-${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_FRAMES)
    .upload(path, blob, { contentType: 'image/webp' })
  return error ? null : path
}
