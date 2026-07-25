import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { clearPending, loadPending, savePending } from './lib/pending'
import { STORAGE_BUCKET_VIDEOS, WORKER_URL } from './lib/config'
import { DEFAULT_PLAN, fetchPlan, type PlanId } from './lib/plans'
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

type Phase =
  | 'loading'
  | 'home'
  | 'upload'
  | 'login'
  | 'wall'
  | 'working'
  | 'generating'
  | 'kb'
  | 'editor'
  | 'theme'
  | 'domain'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [file, setFile] = useState<File | null>(null)
  const [kb, setKb] = useState<KB | null>(null)
  // Entitlements are owner-level (profiles.plan), so they are held here beside the session
  // rather than on the KB — a KB's tier would be the wrong thing to read the moment a KB
  // can change hands.
  const [plan, setPlan] = useState<PlanId>(DEFAULT_PLAN)
  const [jobId, setJobId] = useState<string | null>(null)
  const [openArticleId, setOpenArticleId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const loadKb = useCallback(async (userId: string) => {
    // Auto-provisioned by the signup trigger — there is no "create a KB" step to run.
    const { data } = await supabase
      .from('knowledge_bases')
      .select('*')
      .eq('owner_id', userId)
      .single()
    return (data as KB) ?? null
  }, [])

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
      const [found, ownerPlan] = await Promise.all([loadKb(userId), fetchPlan(userId)])
      if (cancelled) return
      setKb(found)
      setPlan(ownerPlan)

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
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        setPhase('kb')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, loadKb])

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
      // in a structured detail. Surface its message rather than a bare status — "you've
      // used all 3 free video guides" is actionable; "(402)" is not.
      const detail = await res.json().catch(() => null)
      const message = detail?.detail?.message
      throw new Error(message ?? `Could not start the job (${res.status}).`)
    }
    return (await res.json()).job_id as string
  }

  const onGenerated = useCallback(async () => {
    // Re-read the KB so anything derived from it is fresh. The run counter reads the jobs
    // ledger directly (KnowledgeBase), so it needs no KB round-trip.
    if (session) setKb(await loadKb(session.user.id))
    setPhase('kb')
  }, [session, loadKb])

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
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        setPhase('kb')
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
    setOpenArticleId(article.id)
    setPhase('editor')
  }

  async function signOut() {
    await clearPending().catch(() => {})
    await supabase.auth.signOut()
    setFile(null)
    setKb(null)
    setJobId(null)
    setPhase('home')
  }

  if (phase === 'loading') return <div className="page" />
  if (phase === 'home')
    return (
      <Home onStart={() => setPhase('upload')} onLogin={() => setPhase('login')} />
    )
  if (phase === 'upload')
    return <Upload onSubmit={handleSubmit} onHome={() => setPhase('home')} />
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
    return <Generating jobId={jobId} onDone={onGenerated} />
  }

  if (phase === 'kb' && kb) {
    return (
      <>
        {error && (
          <p className="err" style={{ padding: '10px 20px', margin: 0 }}>
            {error}
          </p>
        )}
        <KnowledgeBaseScreen
          kb={kb}
          plan={plan}
          onNewArticle={() => {
            setError(null)
            setPhase('upload')
          }}
          onWriteFromScratch={() => {
            setError(null)
            writeFromScratch()
          }}
          onOpenArticle={(id) => {
            setOpenArticleId(id)
            setPhase('editor')
          }}
          onOpenTheme={() => setPhase('theme')}
          onOpenDomain={() => setPhase('domain')}
          onSignOut={signOut}
        />
      </>
    )
  }

  if (phase === 'editor' && openArticleId && kb) {
    return (
      <Editor
        articleId={openArticleId}
        kb={kb}
        plan={plan}
        onBack={() => {
          setOpenArticleId(null)
          setPhase('kb')
        }}
      />
    )
  }

  if (phase === 'theme' && kb && session) {
    return (
      <ThemeSettings
        kb={kb}
        plan={plan}
        onBack={() => setPhase('kb')}
        onSaved={(updated) => setKb(updated)}
      />
    )
  }

  if (phase === 'domain' && kb) {
    return (
      <DomainSettings
        kb={kb}
        onBack={() => setPhase('kb')}
        onChange={(updated) => setKb(updated)}
      />
    )
  }

  return <div className="page" />
}
