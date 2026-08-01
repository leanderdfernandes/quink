import { supabase } from './supabase'
import { STORAGE_BUCKET_BRANDING, STORAGE_BUCKET_FRAMES } from './config'

// The public reader site can't sign URLs (it's anon and CDN-cached), so the `frames` and
// `branding` buckets are public (migration 0007). Reads go through getPublicUrl — no
// network round-trip, cacheable. The editor still uses signed URLs below; both work on a
// public bucket, and switching working code buys nothing.
//
// Every object is keyed "{kb_id}/…", never by owner (migration 0014). A KB can change
// hands through the ownership-claim flow, and a trial purge has to delete exactly one KB's
// objects — an owner prefix can express neither. Storage RLS resolves that first segment
// through knowledge_bases, so the path IS the permission.

export function publicFrameUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(STORAGE_BUCKET_FRAMES).getPublicUrl(path).data.publicUrl
}

export function publicBrandingUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(STORAGE_BUCKET_BRANDING).getPublicUrl(path).data.publicUrl
}

// Logo + derived favicon (build spec §1). Branding belongs to the help center, not the
// person who happened to upload it — so it moves with the KB.
//
// Returns the storage error's own message rather than a bare null. It used to swallow it
// and every caller printed "check your connection", which is the wrong instruction for the
// two failures that actually happen: an object too large for the bucket, and a MIME type
// the bucket refuses. Neither is fixed by trying again.
export async function uploadBranding(
  kbId: string,
  kind: 'logo' | 'favicon' | 'header',
  blob: Blob,
  ext: string,
): Promise<{ path: string | null; error: string | null }> {
  const path = `${kbId}/${kind}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_BRANDING)
    .upload(path, blob, { contentType: blob.type || 'image/png' })
  if (error) return { path: null, error: error.message || 'The upload was refused.' }
  return { path, error: null }
}

// The `frames` bucket is PUBLIC (migration 0007) — signing buys nothing there, and anyone
// holding a frame URL keeps it after a transfer or an unpublish (CLAUDE.md §10e.3). Prefer
// publicFrameUrl above. These remain because the editor still loads a whole article's
// screenshots through signedFrameUrls, and switching that is a separate question (it is
// tangled with the blur/bucket-split decision). `videos` IS private and has no helper here.

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

// Remove branding objects a KB no longer points at. Called only AFTER the row update has
// committed: delete first and a failed save leaves the KB referencing an object that is
// already gone, which shows up as a broken logo on the live help center.
export async function removeBranding(paths: string[]): Promise<void> {
  const real = paths.filter(Boolean)
  if (real.length) await supabase.storage.from(STORAGE_BUCKET_BRANDING).remove(real)
}

// The 1fps dense set backing the Tier-1 filmstrip. Frames are named "{second}.webp"
// zero-padded; the second is the number. Returns them sorted by second.
export async function listDenseFrames(
  kbId: string,
  articleId: string,
): Promise<{ second: number; path: string }[]> {
  const prefix = `${kbId}/${articleId}/dense`
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
  kbId: string,
  articleId: string,
  stepNumber: number,
  blob: Blob,
): Promise<string | null> {
  const path = `${kbId}/${articleId}/step-${stepNumber}-${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_FRAMES)
    .upload(path, blob, { contentType: 'image/webp' })
  return error ? null : path
}
