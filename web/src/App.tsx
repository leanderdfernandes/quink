import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { clearPending, loadPending, savePending } from './lib/pending'
import { useQueue } from './lib/queue'
import QueueDock from './components/QueueDock'
import {
  DEFAULT_PLAN,
  PLANS,
  videoRetentionFrom,
  fetchEntitlements,
  fetchProfile,
  lanesFor,
  runsLeftFrom,
  type Entitlements,
  type PlanId,
} from './lib/plans'
import {
  fetchKb,
  listKbs,
  resolveDefaultKb,
  saveProductContext,
  setLastKb,
} from './lib/kbs'
import { clearJustClaimed, isJustClaimed, takeClaimToken } from './lib/claim'
import {
  fetchAccessState,
  fetchPeople,
  takeInviteToken,
  type AccessState,
  type Person,
} from './lib/people'
import { trialFor } from './lib/trial'
import AdminBanner from './components/AdminBanner'
import FailureScreen from './components/FailureScreen'
import RestoreScreen from './components/RestoreScreen'
import UpgradeModal from './components/UpgradeModal'
import type { KnowledgeBase as KB, ProductContext, VideoContext } from './lib/types'
import Home from './screens/Home'
import Upload from './screens/Upload'
import Login from './screens/Login'
import AccountWall from './screens/AccountWall'
import KnowledgeBaseScreen from './screens/KnowledgeBase'
import ThemeSettings from './screens/ThemeSettings'
import DomainSettings from './screens/DomainSettings'
import ProductSettings from './screens/ProductSettings'
import People from './screens/People'
import OwnerOnly from './components/OwnerOnly'
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
  // Not a screen. The editor renders the run; this only records that App is holding a job
  // the editor should watch, and which of the two landings we came in through.
  | 'generating'
  // A generation that failed before a job row existed (the spend-cap breaker, an upload
  // that died). Once a job row exists the editor owns the failure instead — it is already
  // polling the row that carries the code, and if the run got as far as making an article
  // there is a draft to open rather than a screen to apologise on.
  | 'failed'
  | 'kb'
  | 'theme'
  | 'domain'
  | 'product'
  // Distinct from 'noaccess' on purpose. "You were removed" and "this doesn't exist for
  // you" are the same row state to the software and nothing like each other to the person
  // it happens to — the instinct on losing access is that your work was deleted.
  | 'removed'
  | 'noaccess'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function App() {
  const { kbId: routeKbId, articleId: routeArticleId } = useParams()
  const navigate = useNavigate()
  // People is a ROUTE (main.tsx), not a wizard phase: it is somewhere you send a colleague
  // a link to. Theming and Domain stay phases — nobody links to those.
  const onPeopleRoute = useLocation().pathname.endsWith('/people')
  // Handed over by the claim flow. One dismissible line, never a modal — the articles are
  // the demo and nothing should stand in front of them. Read-and-clear on mount, so it
  // greets exactly once no matter how many times this component mounts on the way here.
  const [justClaimed, setJustClaimed] = useState(isJustClaimed)

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
  // The OWNER's plan — and null when this account is not the owner. A member cannot read
  // the owner's profile row (profiles is closed) and must never be shown their tier anyway,
  // so every plan-derived surface below either hides or falls back to "no limit known".
  // Falling back to `free` instead would gate a teammate inside a paid help center on their
  // own lifetime cap, which is the exact bug team-access-spec §5 exists to prevent.
  const [plan, setPlan] = useState<PlanId | null>(DEFAULT_PLAN)
  // QUINK STAFF, not a KB admin. Read once, and used for exactly two things: the
  // viewing-as-admin banner, and keeping every customer's help center out of the switcher.
  const [isAdmin, setIsAdmin] = useState(false)
  // 'ok' | 'removed' | 'none' for the KB in the URL. Drives the removed screen and, with
  // isAdmin, the admin banner.
  const [access, setAccess] = useState<AccessState>('ok')
  // Everyone who can edit this KB. Only for the avatar stack — the People screen fetches
  // its own, because it mutates the list.
  const [people, setPeople] = useState<Person[]>([])
  // The context the user typed on the upload screen, kept so the queue can ground every
  // file in the drop with it — and so the post-auth resume grounds identically.
  const [pendingContext, setPendingContext] = useState<VideoContext | null>(null)
  // Recordings dropped alongside the one that crossed the account wall. Reported there, so
  // nobody signs up and then wonders where the other four went.
  const [wallExtras, setWallExtras] = useState(0)
  // Where this run puts the user (2f). First run has nothing else to look at, so it lands
  // INSIDE the article and watches it assemble. A run started from a populated KB leaves
  // them where they were — the dock reports it, and the article row is already in the list
  // wearing the Generating pill. Same component either way; only the landing differs.
  const [landing, setLanding] = useState<'article' | 'kb'>('article')
  const [error, setError] = useState<string | null>(null)
  // Runs spent, off the append-only jobs ledger. Held here so the dropzone can refuse a
  // capped user at file selection instead of after a 90-second upload.
  // Everything this account may know about THIS help center: the owner's limits, the
  // owner's usage, and the flags the previews render from. Null until it resolves, and null
  // for a KB this account cannot edit. It replaces reading limits off `plan`, which was
  // only ever the right answer for the owner.
  const [ent, setEnt] = useState<Entitlements | null>(null)
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

  // Product context for every run this session starts: whatever they just typed, else the
  // KB's saved defaults (migration 0027). Second run onward this is why the form is a
  // header with a Change link instead of four fields again.
  const product: ProductContext = pendingContext?.product ?? {
    product_name: kb?.product_name ?? '',
    description: kb?.product_description ?? '',
    audience: kb?.audience ?? '',
    tone: kb?.tone ?? '',
  }

  // The stable identity across token refresh / focus / INITIAL_SESSION. The post-auth
  // effect keys on this, not the session object, so a refresh doesn't kick the user out.
  const userId = session?.user.id ?? null

  const queue = useQueue({
    kbId: kb?.id ?? null,
    ownerId: userId,
    product,
    // Upload concurrency only. A member has no plan to read, so this stays at the free
    // default for them — conservative, and the worker's LANES is the real limit anyway.
    lanes: lanesFor(plan ?? DEFAULT_PLAN),
    // Display + the client-side hold only. The worker enforces the real wall before the
    // Gemini call — the SPA reads counters for display, never for permission (§10b).
    // The dropzone's local refusal, now correct for a member too: it reads the OWNER's cap
    // and the OWNER's usage. Before this it read the caller's own plan, so a member's
    // over-quota upload was never refused here and only failed at the worker — after the
    // file was already in Storage, stranding an object nothing in the database named.
    runsLeft: runsLeftFrom(ent),
    onQuotaBlocked: () => setShowUpgrade(true),
  })
  // The post-auth effect must not re-run every time the queue changes — it is keyed on the
  // user id precisely so a token refresh cannot restart it (see its own comment).
  const queueRef = useRef(queue)
  queueRef.current = queue

  // The run this editor landing is watching: the first thing the queue has in flight.
  const activeItem =
    queue.items.find(
      (i) => i.state === 'uploading' || i.state === 'running' || i.state === 'queued',
    ) ?? null

  // A recording the user asked to WATCH from the dock, before it has an article to open by.
  // Deliberately not a route (CLAUDE.md §10c): there is nothing stable to put in a URL yet,
  // and it stops being this the instant Stage 1 writes the article — at which point
  // onArticleResolved navigates and the normal article route takes over.
  const [watchItemId, setWatchItemId] = useState<string | null>(null)
  const watchItem = watchItemId
    ? (queue.items.find((i) => i.id === watchItemId) ?? null)
    : null

  // A DEAD SESSION MUST LAND ON THE LANDING PAGE, NOT ON NOTHING.
  //
  // `phase` starts at 'loading', which renders an empty div, and the only thing that moved
  // it off there was a resolved getSession() reporting no session. So every way that call
  // can end badly — a rejection, or a refresh token whose user no longer exists (a deleted
  // account: "User from sub claim in refresh token not found") — left the app on 'loading'
  // forever. That is a blank white page on the MARKETING HOME, for a visitor who cannot
  // sign in to fix it and has nothing on screen to click.
  //
  // The stored token is the other half: it survives the failed refresh, so the next load
  // repeats it, and the next. Clearing it locally is what makes this recoverable by
  // reloading rather than by clearing site data in devtools. `scope: 'local'` because the
  // server call would fail on the same dead token it is trying to revoke.
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error || !data.session) {
          if (error) void supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          setSession(null)
          setPhase('home')
          return
        }
        setSession(data.session)
      })
      .catch(() => {
        setSession(null)
        setPhase('home')
      })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // A refresh that fails LATER (the account is deleted while the tab is open) arrives
      // here, not above. Without this the app keeps rendering an authenticated screen whose
      // every query now returns nothing.
      if (event === 'SIGNED_OUT') setPhase('home')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Rescue a claim that lost its path across the sign-in redirect.
  //
  // Claim.tsx sends the provider back to /claim/:token, but that only works if the exact
  // path is in Supabase's redirect allowlist; when it isn't, the provider quietly falls
  // back to the Site URL and lands here instead. Without this, the user has just signed up
  // for a help center they were promised and is looking at an empty app — the single worst
  // moment this funnel has. takeClaimToken() is read-and-clear, so it fires at most once.
  useEffect(() => {
    if (!userId) return
    const pendingClaim = takeClaimToken()
    if (pendingClaim) navigate(`/claim/${pendingClaim}`, { replace: true })
  }, [userId, navigate])

  // The same rescue for an invite that lost its path across the sign-in redirect. Identical
  // failure, identical net: without it an invited person signs in and lands in their own
  // empty app with no idea what happened to the help center they were invited to.
  useEffect(() => {
    if (!userId) return
    const pendingInvite = takeInviteToken()
    if (pendingInvite) navigate(`/invite/${pendingInvite}`, { replace: true })
  }, [userId, navigate])

  // Resolve which KB we are in: the URL wins, then the last one used, then whatever this
  // account has. The old version was `.eq('owner_id', userId).single()`, which THREW rather
  // than degraded the moment an account held a second KB — and `internal` (our own account,
  // with help.quink.online plus the demo KBs) is the first to hit that.
  //
  // A route id that resolves to nothing is not an error to report; it is a state to render.
  const loadKb = useCallback(
    async (userId: string, wantedKbId?: string, isAdmin = false) =>
      wantedKbId ? await fetchKb(wantedKbId) : await resolveDefaultKb(userId, isAdmin),
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
      // Staff first: it decides whether the switcher lists this account's KBs or every
      // KB in the database, so it has to be known before the list is asked for.
      const me = await fetchProfile(userId)
      if (cancelled) return
      setIsAdmin(me.isAdmin)

      const [found, mine] = await Promise.all([
        loadKb(userId, routeKbId, me.isAdmin),
        listKbs(userId, me.isAdmin),
      ])
      if (cancelled) return
      setKbs(mine)
      // Their plan governs this help center only when it is THEIRS. Inside someone else's,
      // the entitlements are the owner's and we deliberately cannot see them.
      setPlan(found && found.owner_id === userId ? me.plan : null)

      // A :kbId that resolves to nothing is either gone or not ours — RLS answers both
      // with zero rows, and so do we. Rendering different states for the two would turn
      // the URL bar into a probe for which KBs exist.
      //
      // WITHOUT a :kbId this used to fall through to phase 'kb', which renders only on
      // `phase === 'kb' && kb` — so a signed-in session whose account resolves no KB at all
      // matched no branch and hit the bare early return at the bottom: a WHITE PAGE with no
      // way out, not even a sign-out. handle_new_user() provisions a KB on signup, so
      // reaching here means the account was emptied underneath a live session (a deleted
      // profile row, a half-deleted account) — rare, but it strands the user completely.
      if (!found) {
        // Before settling on "not found", ask whether this account was REMOVED from it.
        // kb_access_state() answers for a KB whose row RLS is now hiding, which is the only
        // way to tell the two apart — and they are not the same message.
        const state = routeKbId ? await fetchAccessState(routeKbId) : 'none'
        if (cancelled) return
        setAccess(state)
        setPhase(state === 'removed' ? 'removed' : 'noaccess')
        return
      }
      setKb(found)

      // Access state and the people list, together: the first decides whether the
      // viewing-as-admin banner shows, the second feeds the avatar stack.
      void fetchAccessState(found.id).then((a) => !cancelled && setAccess(a))
      void fetchPeople(found.id).then((p) => !cancelled && setPeople(p))
      // The run count is billed to the KB's OWNER, so it can only be asked for once we know
      // which KB we are in — this account has no quota of its own inside someone else's.
      setEnt(await fetchEntitlements(found.id))
      if (cancelled) return

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

      if (!pending) {
        setPhase('kb') // returning user, nothing queued
        return
      }

      setFile(pending.file)
      setPendingContext(pending.context as VideoContext)
      setLanding('article')
      setPhase('generating')
      queueRef.current?.add([pending.file])
      void saveProductContext(found, (pending.context as VideoContext).product)
        .then(setKb)
        .catch(() => {})
      await clearPending()
    })()

    return () => {
      cancelled = true
    }
  }, [userId, loadKb, routeKbId, navigate])

  // uploadVideo / startJob / the quota-refusal branch all moved into lib/queue.ts. There is
  // exactly ONE place that puts a recording into Storage and creates a job now, and both
  // landings go through it — a second copy is how the two paths drift on the day the
  // request shape changes (it changed with 0027, and would have).

  // Re-read the KB and the run count. There is no longer a "your guide is ready" moment to
  // hang this on — the editor just becomes editable — so it runs when the user leaves the
  // article, which is the next time either number is used for anything.
  const refreshAfterRun = useCallback(async () => {
    if (kb) {
      setKb(await fetchKb(kb.id))
      setEnt(await fetchEntitlements(kb.id))
    }
  }, [kb])

  async function handleSubmit(chosen: File[], context: VideoContext) {
    const [first, ...rest] = chosen
    if (!first) return
    setFile(first)
    setPendingContext(context)

    // Already signed in (making article #2+)? The wall exists to stop the pipeline
    // running for an UNVERIFIED session — this one is verified, so showing it again
    // would be a gate with nothing behind it. Go straight to generating.
    if (session && kb) {
      // Article #2 onward. They already have a help center to look at, so the run reports
      // from the dock and the list rather than taking the screen over.
      setLanding('kb')
      setPhase('kb')
      queue.add(chosen)
      void saveProductContext(kb, context.product).then(setKb).catch(() => {})
      return
    }

    // Signed in, but the help center has not resolved. The wall below is a SIGN-IN screen:
    // showing it to someone already signed in is indistinguishable from having been logged
    // out, and it is reachable from the failure screen's "Upload a different recording".
    // Hold the recording and re-resolve instead. A full reload rather than navigate(),
    // because if the URL is already '/' a router navigation is a no-op and would strand
    // them on a blank 'loading' screen; the reload re-runs the resolver and loadPending()
    // picks the file back up, exactly as it does after the real wall.
    if (session) {
      await savePending({ file: first, context, extra: rest.length })
      window.location.assign('/')
      return
    }

    setLanding('article')
    // Persist before the wall: Google OAuth is a full redirect and would drop the File.
    // Only the FIRST file crosses the wall — the rest are re-dropped after, because
    // holding several hundred megabytes through an OAuth round trip to save one drag is
    // not a trade worth making.
    setWallExtras(rest.length)
    await savePending({ file: first, context, extra: rest.length })
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
    setPhase('kb')
    void refreshAfterRun()
    if (kb) navigate(`/app/${kb.id}`)
  }, [kb, navigate, refreshAfterRun])

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
    setPhase('home')
  }

  // An admin inside someone else's KB. Rendered around every authenticated screen below,
  // never conditionally hidden — see AdminBanner.
  // Video runs left, or null when there is no cap (paid) or no account yet (a visitor,
  // who gets the full free allowance the moment they sign up).
  // Owner of THIS help center. Not Quink staff, and not "can edit" — this is the line
  // billing sits behind.
  const isOwner = !!kb && !!userId && kb.owner_id === userId
  // Identity for presence, straight off the session: Google puts a name in the token's
  // metadata, and the email's local part is the fallback everywhere else in the app.
  // Deliberately not another round trip — this is already in memory.
  const me = session?.user
    ? {
        user_id: session.user.id,
        display_name:
          (session.user.user_metadata?.full_name as string | undefined)?.trim() ||
          (session.user.user_metadata?.name as string | undefined)?.trim() ||
          session.user.email?.split('@')[0] ||
          'Someone',
        avatar_url: (session.user.user_metadata?.avatar_url as string | undefined) ?? null,
      }
    : null

  // Who to point an admin at. kb_entitlements() resolves it through person_name(), the
  // same helper the People list and the invite screen use — profiles stays closed.
  const ownerName = ent?.owner_name ?? null
  // The cap is unknowable from a member's session, so there is none to enforce locally. That
  // is safe by §10b: the client may REFUSE work it can already tell will be rejected, but it
  // may never GRANT — the worker's wall runs on every request either way.
  const runsLeft = runsLeftFrom(ent)

  // The free-trial clock. Computed here so the wizard and the KB shell read the same
  // number on the same day — the countdown is only defensible if it never disagrees with
  // itself or with the email (pricing-spec §2).
  // Billing state, so it is the owner's alone (spec L7). A member sees no countdown, no
  // plan name and no upgrade path — they are not the person who can act on any of it.
  // The clock comes from the OWNER's expiry_days now, so it is right inside a claimed demo
  // and absent on a paid help center whoever is looking. Still rendered only for the owner:
  // a countdown is a bill arriving, and it is not a member's to act on.
  const trial = kb && ent ? trialFor(kb, ent.expiry_days) : null

  // A run that died BEFORE a job row existed — an upload that failed, a refused start. The
  // 'failed' phase was built for exactly this and stopped being reachable when the queue took
  // over the upload, so the first-run landing rendered nothing at all instead. The editor
  // can't own this one: with no job to poll and no article to open there is nothing there.
  const deadItem =
    landing === 'article' && phase === 'generating'
      ? (queue.items.find((i) => i.state === 'error' && !i.jobId) ?? null)
      : null
  useEffect(() => {
    if (!deadItem) return
    setFailureCode(deadItem.failureCode)
    setPhase('failed')
  }, [deadItem])

  useEffect(() => {
    if (!kb || trial?.stage !== 'offline') return
    supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('kb_id', kb.id)
      .then(({ count }) => setOfflineArticles(count ?? 0))
  }, [kb, trial?.stage])

  // Back to the dropzone from a failure. The dead run is dropped from the queue too, so a
  // stale row can't resurrect the old failure screen behind the new upload.
  function startOver() {
    queue.dismiss()
    setFailureCode(null)
    setError(null)
    setWatchItemId(null)
    // Drop the dead article from the URL. Without this the failed article id is still in
    // the path, so the moment the new upload moves phase back to 'kb' the article route
    // wins the render race below and puts them right back on the run they just abandoned.
    if (kb) navigate(`/app/${kb.id}`)
    setPhase('upload')
  }

  // QUINK STAFF inside a help center they are neither the owner nor a member of.
  //
  // The old condition was `kb.owner_id !== userId`, which was right when the only way to be
  // in someone else's KB was to be staff. A teammate is also not the owner, so every member
  // saw a permanent, undismissable "Viewing as admin" bar on the help center they were
  // invited to. `access === 'ok'` is exactly "owner or active member", straight from
  // kb_access_state() — the same function the database gates on.
  // ONE decision about what "upgrade" looks like, so the paths cannot drift.
  //
  // An admin never sees a price, a plan name or a CTA — but they DO hit the wall, because
  // runs are the owner's and the worker refuses on the owner's cap. So they get the fact
  // and the person, and nothing to click. A visitor with no KB yet is not an admin of
  // anything; they get the real modal.
  const upgradeUi = !showUpgrade ? null : isOwner || !kb ? (
    <UpgradeModal
      onWriteManually={() => {
        setShowUpgrade(false)
        writeFromScratch()
      }}
      onClose={() => setShowUpgrade(false)}
    />
  ) : (
    <OwnerOnly
      modal
      heading="This help center is out of video guides"
      body="You can still write and edit articles by hand here, as many as you like — it's only recordings that are capped."
      ownerName={ownerName}
      onDismiss={() => setShowUpgrade(false)}
    />
  )

  const adminBar =
    kb && isAdmin && access !== 'ok' ? (
      <AdminBanner kbName={kb.name} onExit={() => navigate('/admin')} />
    ) : null

  if (phase === 'loading') return <div className="page" />

  // Removed, and told so. The reassurance line is the whole point: the instinct on losing
  // access is that everything you wrote went with it.
  //
  // The help center's NAME is deliberately absent — kb_access_state() returns a state and
  // nothing else, and the row itself is now hidden from this account by RLS. Naming it
  // would mean handing back a fragment of a help center they can no longer read.
  if (phase === 'removed') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <h2>You no longer have access to this help center</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            Your access was removed. Anything you wrote is still there — it belongs to the
            help center, not to your account.
          </p>
          <div className="wall-actions">
            <button className="btn" onClick={() => navigate('/')}>
              Go to your help centers
            </button>
            <button className="btn btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Same answer whether the KB is gone or was never ours: the URL must not reveal which.
  if (phase === 'noaccess') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="card wall">
          <h2>Help center not found</h2>
          <p className="cap" style={{ marginTop: 8 }}>
            This help center doesn't exist, or your account doesn't have access to it.
          </p>
          {/* Sign out is here because this screen is also where a session outlives its
              account. "Back" re-runs the same lookup and lands right back here, so without
              it the only way out of a broken session is clearing site data by hand. It
              says nothing about WHICH of the two states this is — §10c still holds. */}
          <div className="wall-actions">
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              Back to your help center
            </button>
            <button className="btn btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
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
          // The MARKETING home, which carries a "Log in" button — so sending a signed-in
          // user there reads as having been logged out. Anyone with a help center goes
          // back to it instead.
          onHome={() => setPhase(kb ? 'kb' : 'home')}
          runsLeft={runsLeft}
          onCapped={() => setShowUpgrade(true)}
          saved={kb?.product_name ? product : null}
          // From the OWNER's plan, so a member uploading into a paid help center is told
          // the paid retention rather than the free one (§10j: every limit reads the payer).
          // From this HELP CENTER's entitlements (the owner's plan), never from the
          // caller's — §10j: the caller and the payer are not the same person. A visitor
          // with no account yet is a free account in a moment, so free is the right answer
          // for them and the only place the local table is read.
          videoRetentionDays={
            session ? videoRetentionFrom(ent) : PLANS.free.video_retention_days
          }
          // 4b: only when there is a help center to go back to. Onboarding gets none.
          onBack={kb ? () => setPhase('kb') : undefined}
        />
        {/* A capped user is stopped at the dropzone and can still leave with an article —
            blocking generation is not blocking the product. */}
        {upgradeUi}
      </>
    )
  if (phase === 'login') return <Login onBack={() => setPhase('home')} />
  if (phase === 'wall' && file)
    return (
      <AccountWall
        fileName={file.name}
        fileSize={mb(file.size)}
        extraFiles={wallExtras}
      />
    )

  // Refused before a job row existed, so there is nothing to poll and nothing to retry.
  if (phase === 'failed') {
    return (
      <FailureScreen
        code={failureCode}
        jobId={null}
        onRetryStarted={() => setPhase('kb')}
        onReupload={startOver}
      />
    )
  }

  // People. A route rather than a phase, so it survives a refresh and can be linked to.
  if (onPeopleRoute && kb && userId) {
    return (
      <>
        {adminBar}
        <People
          kb={kb}
          userId={userId}
          isOwner={isOwner}
          ent={ent}
          onBack={() => navigate(`/app/${kb.id}`)}
          onUpgrade={() => setShowUpgrade(true)}
          // Leaving takes away the thing you are looking at. Back to the root, which
          // re-resolves to a help center this account still has.
          onLeft={() => navigate('/')}
        />
        {upgradeUi}
      </>
    )
  }

  // The editor, which is ALSO the generating screen — there is no other one (2a). Three
  // ways in, one component, deliberately in one branch so React keeps the same instance
  // when the URL gains the article id mid-run:
  //   · an article route (the normal case, and a refresh)
  //   · uploading, on the first-run landing — no job row yet
  //   · a job in flight on the first-run landing — no article row yet either
  const watchingRun = landing === 'article' && (phase === 'working' || phase === 'generating')
  // A fourth way in: watching a recording opened from the dock, which has no article yet.
  // Same component, same branch — so when Stage 1 lands, the instance is kept and the URL
  // simply gains the article id underneath it.
  const watched = watchingRun ? activeItem : watchItem
  if ((routeArticleId || watchingRun || watchItem) && kb) {
    return (
      <>
        {adminBar}
        <Editor
          articleId={routeArticleId ?? watchItem?.articleId ?? null}
          kb={kb}
          me={me}
          people={people}
          ent={ent}
          jobId={watched?.jobId ?? null}
          // Every state BEFORE a job row exists, not just 'uploading'. A queued file waiting
          // for a lane, and — the long one — a finished upload while POST /api/generate is
          // still in flight, both reported null here, so the editor had no article, no job
          // and no upload to render and fell through to its blank early return. On a cold
          // worker that blank screen lasted tens of seconds, which is what "nothing seemed
          // to be happening" was.
          uploadProgress={watched && !watched.jobId ? watched.progress : null}
          onArticleResolved={(id) => {
            // The URL catches up with the run. `replace`, because the article-less URL is
            // not somewhere the back button should be able to return to.
            navigate(`/app/${kb.id}/article/${id}`, { replace: true })
            // The article route owns it from here; keeping the item watch as well would
            // leave two things claiming the same editor.
            setWatchItemId(null)
          }}
          onReupload={startOver}
          onBack={() => {
            setWatchItemId(null)
            closeArticle()
          }}
          onOpenTheme={() => setPhase('theme')}
        />
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
          ent={ent}
          isOwner={isOwner}
          people={people}
          userId={userId}
          kbs={kbs}
          onSwitchKb={switchKb}
          onOpenPeople={() => navigate(`/app/${kb.id}/people`)}
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
          onOpenProduct={() => setPhase('product')}
          onSignOut={signOut}
          onUpgrade={() => setShowUpgrade(true)}
          justClaimed={justClaimed}
          runInFlight={queue.activeCount > 0}
          onDismissWelcome={() => {
            clearJustClaimed()
            setJustClaimed(false)
          }}
        />
        <QueueDock
          items={queue.items}
          productName={product.product_name}
          productSummary={[product.audience, product.tone].filter(Boolean).join(' · ')}
          onChangeProduct={() => setPhase('upload')}
          onSetRecording={queue.setRecording}
          onRemove={queue.remove}
          onUndoRemove={queue.undoRemove}
          canUndo={!!queue.lastRemoved}
          onOpenArticle={openArticle}
          onWatchItem={setWatchItemId}
          onUpgrade={() => setShowUpgrade(true)}
          isOwner={isOwner}
          ownerName={ownerName}
          onDismiss={queue.dismiss}
          onAddMore={() => setPhase('upload')}
        />

        {/* The proactive path (pricing-spec §6): they tapped the countdown rather than
            hitting a wall. Same surface either way — one place decides what upgrading looks
            like, so the two paths cannot drift apart. */}
        {upgradeUi}
      </>
    )
  }

  if (phase === 'product' && kb) {
    return (
      <>
        {adminBar}
        <ProductSettings
          kb={kb}
          onBack={() => setPhase('kb')}
          onSaved={setKb}
        />
      </>
    )
  }

  if (phase === 'theme' && kb && session) {
    return (
      <>
        {adminBar}
        <ThemeSettings
          kb={kb}
          ent={ent}
          onBack={() => setPhase('kb')}
          onSaved={(updated) => setKb(updated)}
        />
      </>
    )
  }

  if (phase === 'domain' && kb) {
    // An admin changing the CNAME takes a paying customer's help center off the internet,
    // so the worker refuses them (_require_owner) — which would land here as a raw 403 on a
    // screen that looks broken. A named state instead: the rail item still works, it just
    // says whose decision this is.
    if (!isOwner) {
      return (
        <>
          {adminBar}
          <div className="settings">
            <header className="settings-top">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setPhase('kb')}
              >
                ← Help center
              </button>
            </header>
            <div className="settings-single">
              <OwnerOnly
                heading="The address is managed by the owner"
                body={`${kb.name} is reachable at its Quink address, and a custom domain can be connected to it. Connecting or changing one points a real website at this help center, so it stays with the person accountable for it.`}
                ownerName={ownerName}
              />
            </div>
          </div>
        </>
      )
    }
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
