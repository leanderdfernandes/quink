import { COPY } from '../lib/config'
import LegalFooter from '../components/LegalFooter'
import Wordmark from '../components/Wordmark'
import ThemeToggle from '../components/ThemeToggle'

// The marketing landing — the front door (Quink Flow design).
//
// This overrides ux-spec §2's "dropzone is the landing": the design puts a marketing
// page first, with "Build my article" leading into the upload+context flow and "Log in"
// for returning users. The account wall still fires after upload, before generation.
//
// Lean by decision: hero + how-it-works only. The design's lower sections (why-quink,
// outcome preview, footer) are deferred so the editor (the North Star surface) isn't
// pushed back.

type Props = {
  onStart: () => void
  onLogin: () => void
}

const STEPS = [
  {
    n: 1,
    title: 'Record your screen',
    body: 'Do the workflow you already know cold — .mp4 or .mov, no narration required.',
  },
  {
    n: 2,
    title: 'Get an editable article',
    body: 'Headings, steps and a screenshot per action — drafted for you. Fix a frame, reword a line.',
  },
  {
    n: 3,
    title: 'Publish to your domain',
    body: 'It goes live on your own hosted, searchable help center — the one your customers actually read.',
  },
]

export default function Home({ onStart, onLogin }: Props) {
  return (
    <div className="home">
      <header className="home-nav">
        <span className="home-wordmark">
          <Wordmark height={22} />
        </span>
        <nav>
          <a href="#how">How it works</a>
          <a href="#how">Pricing</a>
          <ThemeToggle />
          {/* Prominent, so returning users spot the way in without hunting. */}
          <button className="btn btn-ghost nav-login" onClick={onLogin}>
            Log in
          </button>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow hero-eyebrow">
          For the support &amp; ops teams who write the docs
        </p>
        <h1 className="hero-title">The week of article-writing you never have to do.</h1>
        <p className="lede hero-lede">
          Record your screen once. Quink turns it into a polished, step-by-step help
          article — published straight to your own branded help center at
          docs.yourcompany.com.
        </p>
        <button className="btn hero-cta" onClick={onStart}>
          {COPY.buildCta}
        </button>
        <p className="cap hero-reassure">
          <span className="check" aria-hidden>
            ✓
          </span>{' '}
          {/* The .replace() that used to be here targeted a substring the disclosure has
              not contained for two rewrites — a dead no-op the landing page rendered
              straight through (UI-STATE-INVENTORY, Surface F drift list). */}
          Free to try — {COPY.freeLimitDisclosure}
        </p>
      </section>

      <section id="how" className="how">
        <p className="eyebrow" style={{ textAlign: 'center' }}>
          How it works
        </p>
        <h2 className="how-title">Three steps. About ninety seconds.</h2>
        <div className="how-grid">
          {STEPS.map((s) => (
            <div key={s.n} className="how-card">
              <span className="how-num">{s.n}</span>
              <h3 className="how-card-title">{s.title}</h3>
              <p className="how-card-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The "footer" the deferred design called for, reduced to the part that is not
          optional: Razorpay's activation review looks for these four links on the marketing
          site. The rest of that section stays deferred. */}
      <LegalFooter />
    </div>
  )
}
