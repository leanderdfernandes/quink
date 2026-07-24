import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal shim so this config can read the build environment without pulling in
// @types/node for one lookup. Vercel injects build-time vars into process.env; a local
// .env.local only comes through loadEnv — so both are checked below.
declare const process: { cwd(): string; env: Record<string, string | undefined> }

// Vite inlines env vars at BUILD time, so a missing VITE_WORKER_URL doesn't fail at
// runtime — it silently bakes the localhost fallback from lib/config.ts into the
// production bundle. The deployed site then calls http://localhost:8000 for every worker
// request: the pipeline (/api/generate) and the custom-domain flow both quietly target
// the visitor's own machine instead of the worker. It looks fine to whoever is running a
// local worker and is broken for everyone else.
//
// So refuse to produce a production bundle without it. A build that can't reach the
// worker is not a build worth deploying.
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '')
    const workerUrl = env.VITE_WORKER_URL || process.env.VITE_WORKER_URL
    if (!workerUrl) {
      throw new Error(
        'VITE_WORKER_URL is not set. A production build without it falls back to ' +
          'http://localhost:8000, so the deployed SPA would call the visitor\'s own ' +
          'machine. Set it to the worker origin (e.g. https://<service>.onrender.com) ' +
          'in the deploy environment and rebuild.',
      )
    }
  }
  return { plugins: [react()] }
})
