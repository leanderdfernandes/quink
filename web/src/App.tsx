import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { clearPending, loadPending, savePending } from './lib/pending'
import { STORAGE_BUCKET_VIDEOS, WORKER_URL } from './lib/config'
import { DEFAULT_PLAN, fetchPlan, limitsFor, runsUsed, type PlanId } from './lib/plans'
import { fetchKb, listKbs, resolveDefaultKb, setLastKb } from './lib/kbs'
import { QUOTA_EXCEEDED } from './lib/failures'
import { trialFor } from './lib/trial'
import AdminBanner from './components/AdminBanner'
import FailureScreen from './components/FailureScreen'
import RestoreScreen from './components/RestoreScreen'
import UpgradeModal from './components/UpgradeModal'
import type { KnowledgeBase as KB, VideoContext } from './lib/types'
import Home from './screens/Home'
import Upload from './screens/Upload'
import Login from './screens/Login'
import AccountWall from './screens/AccountWall'
import Generating from './screens/Generating'
import KnowledgeBaseScreen from './screens/KnowledgeBase'
import ThemeSettings from './screens/ThemeSettings'
import DomainSettings from './screens/DomainSettings'
import Editor from './editor/Editor'

// The activation flow (ux-spec §2):
//   landing + upload + context (ungated)
//     -> account wall (after upload, BEFORE generation)
//     -> upload to Storage -> POST /api/generate -> poll the jobs row
//     -> land inside a populated KB with article #1 in it
//
// Value, then commitment, in that order. The Gemini pipeline never runs for an
// unverified session.

// The wizard is state, not routes (see main.tsx). 'editor' is gone from this list: which
// article is open is now the URL's job, so it survives a refresh and can be pasted into
// an email.
type Phase =
  | 'loading'
  | 'home'
  | 'upload'
  | 'login'
  | 'wall'
  | 'working'
  | 'generating'
  // A generation that failed before a job row existed (the spend-cap breaker, an upload
  // that died). Once a job row exists, Generating owns the failure screen instead — it
  // is already polling the row that carries the code.
  | 'failed'
  | 'kb'
  | 'theme'
  | 'domain'
  | 'noaccess'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function App() {
  const { kbId: routeKbId, articleId: routeArticleId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [file, setFile] = useState<File | null>(null)
  const [kb, setKb] = useState<KB | null>(null)
  // Every KB this account can open — the switcher's list. Empty for a 1-KB plan, which
  // renders a plain label and never reads it.
  const [kbs, setKbs] = useState<KB[]>([])
  // Entitlements are owner-level (profiles.plan), so they are held here beside the session
  // rather than on the KB — a KB's tier would be the wrong thing to read the moment a KB
  // can change hands.
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Runs spent, off the append-only jobs ledger. Held here so the dropzone can refuse a
  // capped user at file selection instead of after a 90-second upload.
  const [runs, setRuns] = useState<number | null>(null)
  // Set when a generation is refused before any job row exists — the only failure the
  // polling screen can't see, so App renders it.
  const [failureCode, setFailureCode] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  // The offline interstitial is shown once per visit, then stepped past. Offline hides the
  // KB from READERS, not from its owner — blocking authoring would punish exactly the
  // person we're trying to convert (pricing-spec §7).
  const [restoreSeen, setRestoreSeen] = useState(false)
  // Article count, for the restore screen's "your N articles are safe" line. Fetched only
  // when a KB is actually offline, so the normal path pays nothing for it.
  const [offlineArticles, setOfflineArticles] = useState(0)

  // The stable identity across token refresh / focus / INITIAL_SESSION. The post-auth
  // effect keys on this, not the session object, so a refresh doesn't kick the user out.
  const userId = session?.user.id ?? null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setPhase('home')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Resolve which KB we are in: the URL wins, then the last one used, then whatever this
  // account has. The old version was `.eq('owner_id', userId).single()`, which THREW rather
  // than degraded the moment an account held a second KB — and `internal` (our own account,
  // with help.quink.online plus the demo KBs) is the first to hit that.
  //
  // A route id that resolves to nothing is not an error to report; it is a state to render.
  const loadKb = useCallback(
    async (userId: string, wantedKbId?: string) =>
      wantedKbId ? await fetchKb(wantedKbId) : await resolveDefaultKb(userId),
    [],
  )

  // Once authenticated: pick the held recording back up, upload it, start the pipeline.
  //
  // Keyed on the user id, NOT the session object. Supabase hands back a fresh session
  // object on every token refresh / tab focus / INITIAL_SESSION; depending on it re-ran
  // this effect and slammed phase back to 'kb', kicking the user out of whatever they
  // were doing (caught: "New article" flashed the upload form then bounced home).
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    ;(async () => {
      const [found, ownerPlan, mine, used] = await Promise.all([
        loadKb(userId, routeKbId),
        fetchPlan(userId),
        listKbs(userId),
        runsUsed(userId),
      ])
      if (cancelled) return
      setPlan(ownerPlan)
      setKbs(mine)
      setRuns(used)

      // A :kbId that resolves to nothing is either gone or not ours — RLS answers both
      // with zero rows, and so do we. Rendering different states for the two would turn
      // the URL bar into a probe for which KBs exist.
      if (routeKbId && !found) {
        setPhase('noaccess')
        return
      }
      setKb(found)

      // The URL is the record of where you are. Put it there as soon as we know, so a
      // refresh, a bookmark or a pasted link all land in the same place.
      if (found && !routeKbId) {
        navigate(`/app/${found.id}`, { replace: true })
      }
      // Only remember KBs we actually own. Without this an admin who opens a customer KB
      // gets dropped straight back into it on their next login.
      if (found && found.owner_id === userId) void setLastKb(userId, found.id)

      const pending = await loadPending().catch(() => undefined)
      if (cancelled) return

      if (!pending || !found) {
        setPhase('kb') // returning user, or nothing queued
        return
      }

      setFile(pending.file)
      setPhase('working')
      try {
        const path = await uploadVideo(found.id, pending.file)
        const id = await startJob(found.id, path, pending.context as VideoContext)
        await clearPending()
        if (cancelled) return
        setJobId(id)
        setPhase('generating')
      } catch (e) {
        if (cancelled) return
        handleStartFailure(e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, loadKb, routeKbId, navigate])

  async function uploadVideo(kbId: string, f: File) {
    // Objects are keyed by KB (migration 0014): storage RLS resolves the first path
    // segment through knowledge_bases, and the worker pins uploads to the KB it just
    // proved you own.
    const ext = f.name.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4'
    const path = `${kbId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET_VIDEOS)
      .upload(path, f, { contentType: f.type || 'video/mp4' })
    if (error) throw error
    return path
  }

  // Carries the worker's structured `code` so the caller can tell the three outcomes
  // apart: quota_exceeded is the upgrade modal, a taxonomy code is a failure screen, and
  // anything else is a plain message.
  class StartJobError extends Error {
    constructor(
      readonly code: string | null,
      message: string,
    ) {
      super(message)
    }
  }

  async function startJob(kbId: string, videoPath: string, context: VideoContext) {
    // Returns a job_id immediately; we poll the Postgres jobs row from here on, so the
    // worker needs no poll endpoint (LEARNINGS #3).
    // The worker validates this token and checks KB ownership — without it every
    // generate request is anonymous and would drive the pipeline against any KB.
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch(`${WORKER_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ kb_id: kbId, video_path: videoPath, ...context }),
    })
    if (!res.ok) {
      // The worker refuses over-quota and over-spend BEFORE the Gemini call, and says why
      // in a structured detail. Keep the CODE, not just the message: quota_exceeded has to
      // become the upgrade modal, and spend_cap has to become a failure screen that says
      // the fault is ours.
      const detail = await res.json().catch(() => null)
      throw new StartJobError(
        detail?.detail?.code ?? null,
        detail?.detail?.message ?? `Could not start the job (${res.status}).`,
      )
    }
    return (await res.json()).job_id as string
  }

  // One place decides what a failed start looks like, so the upload-on-signin path and the
  // already-signed-in path can never disagree about it.
  function handleStartFailure(e: unknown) {
    if (e instanceof StartJobError && e.code === QUOTA_EXCEEDED) {
      // Never a failure screen — nothing went wrong (pricing-spec §7).
      setShowUpgrade(true)
      setPhase('kb')
      return
    }
    // Anything else — the spend-cap breaker, a dead upload — is a real failure with no job
    // row behind it, so App renders the screen instead of the polling screen.
    setFailureCode(e instanceof StartJobError ? e.code : null)
    setPhase('failed')
  }

  const onGenerated = useCallback(async () => {
    // Re-read the KB so anything derived from it is fresh, and the run count with it: the
    // run just charged is what decides whether the NEXT file selection hits the cap.
    if (kb) setKb(await fetchKb(kb.id))
    if (userId) setRuns(await runsUsed(userId))
    setPhase('kb')
  }, [kb, userId])

  async function handleSubmit(f: File, context: VideoContext) {
    setFile(f)

    // Already signed in (making article #2+)? The wall exists to stop the pipeline
    // running for an UNVERIFIED session — this one is verified, so showing it again
    // would be a gate with nothing behind it. Go straight to generating.
    if (session && kb) {
      setPhase('working')
      try {
        const path = await uploadVideo(kb.id, f)
        setJobId(await startJob(kb.id, path, context))
        setPhase('generating')
      } catch (e) {
        handleStartFailure(e)
      }
      return
    }

    // Persist before the wall: Google OAuth is a full redirect and would drop the File.
    await savePending({ file: f, context })
    setPhase('wall')
  }

  // Manual authoring (ux-spec §4). A generated article is a manual one that arrived
  // pre-filled, so we just create an empty article with one blank step and open the same
  // editor. Manual articles are unlimited (pricing §3) — no free-article increment.
  async function writeFromScratch() {
    if (!kb) return
    const { data: article, error } = await supabase
      .from('articles')
      .insert({ kb_id: kb.id, title: '', subtitle: '', status: 'ready' })
      .select()
      .single()
    if (error || !article) {
      setError('Could not create the article.')
      return
    }
    await supabase
      .from('steps')
      .insert({ article_id: article.id, step_number: 1, heading: '', body_text: '' })
    openArticle(article.id)
  }

  // Which article is open is a URL, not a state flag — so it survives a refresh and can be
  // pasted to someone.
  const openArticle = useCallback(
    (articleId: string) => {
      if (kb) navigate(`/app/${kb.id}/article/${articleId}`)
    },
    [kb, navigate],
  )

  const closeArticle = useCallback(() => {
    if (kb) navigate(`/app/${kb.id}`)
  }, [kb, navigate])

  // Switching KBs is a navigation. The effect above re-resolves from the new :kbId and
  // records it as the last one used.
  const switchKb = useCallback(
    (nextKbId: string) => {
      setError(null)
      setPhase('loading')
      navigate(`/app/${nextKbId}`)
    },
    [navigate],
  )

  async function signOut() {
    await clearPending().catch(() => {})
    await supabase.auth.signOut()
    setFile(null)
    setKb(null)
    setJobId(null)
    setPhase('home')
  }

  // An admin inside someone else's KB. Rendered around every authenticated screen below,
  // never conditionally hidden — see AdminBanner.
  // Video runs left, or null when there is no cap (paid) or no account yet (a visitor,
  // who gets the full free allowance the moment they sign up).
  const runLimit = limitsFor(plan).lifetime_runs
  const runsLeft = runLimit === null || runs === null ? null : Math.max(runLimit - runs, 0)

  // The free-trial clock. Computed here so the wizard and the KB shell read the same
  // number on the same day — the countdown is only defensible if it never disagrees with
  // itself or with the email (pricing-spec §2).
  const trial = kb ? trialFor(kb, plan) : null

  useEffect(() => {
    if (!kb || trial?.stage !== 'offline') return
    supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('kb_id', kb.id)
      .then(({ count }) => setOfflineArticles(count ?? 0))
  }, [kb, trial?.stage])

  // Back to the dropzone from a failure. Clears the dead job so a stale id can't resurrect
  // the old failure screen behind the new upload.
  function startOver() {
    setJobId(null)
    setFailureCode(null)
    setError(null)
    setPhase('upload')
  }

  const adminBar =
    kb && userId && kb.owner_id !== userId ? (
      <AdminBanner kbName={kb.name} onExit={() => navigate('/admin')} />
    ) : null

  if (phase === 'loading') return <div className="page" />

  // Same answer whether the KB is gone or was never ours: the URL must not reveal which.
  if (phase === 'noaccess') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <h2>Help center not found</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            This help center doesn't exist, or your account doesn't have access to it.
          </p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 18 }}
            onClick={() => navigate('/')}
          >
            Back to your help center
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'home')
    return (
      <Home onStart={() => setPhase('upload')} onLogin={() => setPhase('login')} />
    )
  if (phase === 'upload')
    return (
      <>
        <Upload
          onSubmit={handleSubmit}
          onHome={() => setPhase('home')}
          runsLeft={runsLeft}
          onCapped={() => setShowUpgrade(true)}
        />
        {/* A capped user is stopped at the dropzone and can still leave with an article —
            blocking generation is not blocking the product. */}
        {showUpgrade && (
          <UpgradeModal
            onWriteManually={() => {
              setShowUpgrade(false)
              writeFromScratch()
            }}
            onClose={() => setShowUpgrade(false)}
          />
        )}
      </>
    )
  if (phase === 'login') return <Login onBack={() => setPhase('home')} />
  if (phase === 'wall' && file)
    return <AccountWall fileName={file.name} fileSize={mb(file.size)} />

  if (phase === 'working') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card generating">
          <h2>Uploading your recording…</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            Hang tight — you can’t lose this.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'generating' && jobId) {
    return (
      <Generating
        jobId={jobId}
        onDone={onGenerated}
        // A retry is a new job row; point the progress bar at the attempt actually running.
        onRetryStarted={setJobId}
        onReupload={startOver}
      />
    )
  }

  // Refused before a job row existed, so there is nothing to poll and nothing to retry.
  if (phase === 'failed') {
    return (
      <FailureScreen
        code={failureCode}
        jobId={null}
        onRetryStarted={(id) => {
          setJobId(id)
          setPhase('generating')
        }}
        onReupload={startOver}
      />
    )
  }

  // The article is a route, so it is checked before the KB shell and survives a refresh.
  if (routeArticleId && kb) {
    return (
      <>
        {adminBar}
        <Editor articleId={routeArticleId} kb={kb} plan={plan} onBack={closeArticle} />
      </>
    )
  }

  // Expired: the reader is dark and the grace clock is running. Shown on arrival because
  // it is the highest-intent screen in the free funnel (pricing-spec §7) — and shown ONCE,
  // because their articles are all still there and editable.
  if (phase === 'kb' && kb && trial?.stage === 'offline' && !restoreSeen) {
    return (
      <>
        {adminBar}
        <RestoreScreen
          kbName={kb.name}
          trial={trial}
          articleCount={offlineArticles}
          onContinue={() => setRestoreSeen(true)}
        />
      </>
    )
  }

  if (phase === 'kb' && kb) {
    return (
      <>
        {adminBar}
        {error && (
          <p className="err" style={{ padding: '10px 20px', margin: 0 }}>
            {error}
          </p>
        )}
        <KnowledgeBaseScreen
          kb={kb}
          plan={plan}
          kbs={kbs}
          onSwitchKb={switchKb}
          onNewArticle={() => {
            setError(null)
            setPhase('upload')
          }}
          onWriteFromScratch={() => {
            setError(null)
            writeFromScratch()
          }}
          onOpenArticle={openArticle}
          onOpenTheme={() => setPhase('theme')}
          onOpenDomain={() => setPhase('domain')}
          onSignOut={signOut}
          onUpgrade={() => setShowUpgrade(true)}
        />
        {/* The proactive path (pricing-spec §6): they tapped the countdown rather than
            hitting a wall. Same modal either way — one place decides what upgrading looks
            like, so the two paths cannot drift apart. */}
        {showUpgrade && (
          <UpgradeModal
            onWriteManually={() => {
              setShowUpgrade(false)
              writeFromScratch()
            }}
            onClose={() => setShowUpgrade(false)}
          />
        )}
      </>
    )
  }

  if (phase === 'theme' && kb && session) {
    return (
      <>
        {adminBar}
        <ThemeSettings
          kb={kb}
          plan={plan}
          onBack={() => setPhase('kb')}
          onSaved={(updated) => setKb(updated)}
        />
      </>
    )
  }

  if (phase === 'domain' && kb) {
    return (
      <>
        {adminBar}
        <DomainSettings
          kb={kb}
          onBack={() => setPhase('kb')}
          onChange={(updated) => setKb(updated)}
        />
      </>
    )
  }

  return <div className="page" />
}
