import { supabase } from './supabase'
import { WORKER_URL } from './config'

// Steerable editing (PRD "Context & AI Editing" §6.1 and §6.4).
//
// ONE ENTRY POINT, NOT A MENU OF VERBS. "Shorten / Simplify / Rewrite" decide for the user
// what better means, and the journey map's complaint is not "typing is hard" — it is
// "what to change it to is what the tool is supposed to do". A knowing problem. A fixed
// verb answers a different question than the one being asked; an instruction field lets
// them ask theirs.
//
// NOTHING HERE WRITES. Both calls return a proposal the caller renders as a diff card.
// There is no silent-write path anywhere in this feature.

export const STEER_INSTRUCTION_MAX = 400

// Below the field, not beside it. They FILL the field rather than firing — a starting
// phrase someone extends is not the same thing as a decision made for them, and that
// difference is the whole point of the field existing (PRD §6.1).
export const QUICK_WORDS = ['shorter', 'plainer', 'more specific', 'explain why'] as const

// On the RESULT, not the trigger. Nobody gets the instruction right first time, and
// re-articulating from scratch is what makes AI editing feel like work (PRD §6.2).
export const REFINEMENTS = [
  'shorter still',
  'less formal',
  'put the detail back',
  'name the button',
] as const

export type BlockProposal = {
  proposed_text: string
  // The instruction that produced it, as the worker received it — quoted on the card, so
  // a result the user does not recognise can be traced to what they actually asked for.
  instruction: string
}

export type ArticleProposal = {
  // What is about to change, said BEFORE any diff lands. Only ever names steps that have a
  // proposal behind them — the worker drops plan lines with no diff, because a plan that
  // promises a change nothing delivers is worse than no plan.
  plan: { step_number: number; change: string }[]
  steps: { step_number: number; proposed_text: string }[]
  instruction: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.detail?.message ?? "That didn't work just now. Nothing changed.")
  }
  return data as T
}

export function steerBlock(
  articleId: string,
  stepNumber: number,
  instruction: string,
  selection: string,
): Promise<BlockProposal> {
  return post<BlockProposal>('/api/steer', {
    article_id: articleId,
    step_number: stepNumber,
    instruction: instruction.slice(0, STEER_INSTRUCTION_MAX),
    // Context only — the worker reads the step's real text from the database. Capped here
    // because a whole-step selection on a long step is a lot of bytes for a hint.
    selection: selection.slice(0, 1000),
  })
}

export function steerArticle(
  articleId: string,
  instruction: string,
): Promise<ArticleProposal> {
  return post<ArticleProposal>('/api/steer/article', {
    article_id: articleId,
    instruction: instruction.slice(0, STEER_INSTRUCTION_MAX),
  })
}
